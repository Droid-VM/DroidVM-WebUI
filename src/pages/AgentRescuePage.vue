<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { computed, onBeforeUnmount, provide } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AgentRescuePanel, useAgentRescue } from '../modules/agent'
import { VmTerminal, vmTerminalKey } from '../modules/terminal'
const route = useRoute(),
  rescue = useAgentRescue(),
  { t } = useI18n()
provide(vmTerminalKey, rescue.terminal)
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
const session = computed(() => rescue.items.value.find((row) => row.id === id.value))
const connectable = computed(
  () =>
    session.value &&
    !session.value.closing &&
    !session.value.expired &&
    session.value.remainingMs > 0 &&
    (!rescue.entries.value[id.value] || rescue.entries.value[id.value]?.state === 'done'),
)
onBeforeUnmount(rescue.terminal.disconnect)
</script>
<template>
  <div class="rescue-page">
    <AppBackLink to="/resources/disk">{{ t('navDisk') }}</AppBackLink>
    <AgentRescuePanel />
    <section v-if="id" :aria-label="t('agentRescueOpen')">
      <h2>{{ t('agentRescueOpen') }}</h2>
      <p>{{ t('agentRescueTerminalHint') }}</p>
      <VmTerminal
        v-if="connectable"
        :key="id"
        :vm-id="id"
        :instance-id="session!.expected.instanceId"
      />
      <p v-else-if="rescue.observed.value">{{ t('agentRescueMissing') }}</p>
    </section>
  </div>
</template>
<style scoped>
.rescue-page,
section {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
}
.rescue-page {
  max-width: var(--app-content-width);
}
h2,
p {
  margin: 0;
}
</style>
