<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useHostMonitoring } from '../model/overview'
import HostMetrics from './HostMetrics.vue'
import HostObservationState from './HostObservationState.vue'
const props = withDefaults(defineProps<{ variant?: 'identity' | 'metrics'; active?: boolean }>(), {
  variant: 'metrics',
  active: true,
})
const host = useHostMonitoring(() => props.active),
  { t } = useI18n()
</script>
<template>
  <section class="host-summary" data-testid="host-summary" :aria-label="t('hostOverviewTitle')">
    <template v-if="variant === 'identity'">
      <h2>{{ host.data.value?.host.deviceModel ?? t('hostOverviewTitle') }}</h2>
      <p v-if="host.data.value" class="muted">
        {{ t('hostServiceVersion', { version: host.data.value.daemon.version }) }} ·
        {{ host.data.value.host.kernelRelease ?? '—' }}
      </p>
    </template>
    <HostObservationState />
    <HostMetrics v-if="variant === 'metrics'" />
    <RouterLink to="/host">{{ t('hostViewDetails') }}</RouterLink>
  </section>
</template>
<style scoped>
.host-summary {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  background: var(--soft);
  border-radius: var(--radius-md);
  overflow-wrap: anywhere;
}
h2,
p {
  margin: 0;
}
h2 {
  font-size: var(--font-heading);
}
a {
  display: inline-flex;
  align-items: center;
  min-height: var(--touch-target);
}
</style>
