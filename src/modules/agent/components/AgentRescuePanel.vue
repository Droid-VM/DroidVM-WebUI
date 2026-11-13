<script setup lang="ts">
import AppLinkButton from '../../../shared/ui/AppLinkButton.vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentRescue } from '../model/rescue'
import { taskStateKeys } from '../../tasks'
import { useVisiblePolling } from '../../../shared/model/visiblePolling'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppCheckbox from '../../../shared/ui/AppCheckbox.vue'
const { t } = useI18n(),
  rescue = useAgentRescue()
const selected = ref<string | null>(null),
  confirmed = ref(false)
function review(id: string) {
  selected.value = id
  confirmed.value = false
}
function close() {
  if (!selected.value || !confirmed.value || !rescue.canClose(selected.value)) return
  const id = selected.value
  selected.value = null
  confirmed.value = false
  void rescue.close(id)
}
useVisiblePolling(() => rescue.supported.value, rescue.refresh, ['tasks', 'disks'])
</script>
<template>
  <section class="rescue-panel" :aria-label="t('agentRescueTitle')">
    <h2>{{ t('agentRescueTitle') }}</h2>
    <p v-if="!rescue.supported.value">{{ t('agentRescueUnavailable') }}</p>
    <template v-else>
      <AppButton
        :disabled="rescue.loading.value || rescue.checking.value"
        @click="rescue.refresh"
        >{{ t('refreshList') }}</AppButton
      >
      <p v-if="rescue.loading.value" role="status">{{ t('processing') }}</p>
      <AppNotice v-if="rescue.problem.value" tone="error" :title="t(rescue.problem.value.titleKey)"
        ><p>{{ t(rescue.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p v-if="rescue.observed.value && !rescue.items.value.length">{{ t('agentRescueEmpty') }}</p>
      <ul class="sessions">
        <li v-for="session in rescue.items.value" :key="session.id">
          <strong>{{ session.diskId }}</strong>
          <p class="session-id">{{ session.id }}</p>
          <p>{{ t('agentRescueRemaining', { seconds: Math.ceil(session.remainingMs / 1000) }) }}</p>
          <p v-if="session.expired || !session.remainingMs">{{ t('agentRescueExpired') }}</p>
          <p v-if="session.closing">{{ t('agentRescueClosing') }}</p>
          <div class="buttons">
            <AppLinkButton
              v-if="!session.closing && !session.expired && session.remainingMs > 0"
              tone="tonal"
              :to="`/agent/rescue/${session.id}`"
              >{{ t('agentRescueOpen') }}</AppLinkButton
            >
            <AppButton :disabled="!rescue.canClose(session.id)" @click="review(session.id)">{{
              t('agentRescueClose')
            }}</AppButton>
          </div>
        </li>
      </ul>
      <section
        v-for="entry in rescue.entries.value"
        :key="entry.request.requestId"
        class="close-result"
        aria-live="polite"
      >
        <h3>{{ t('agentRescueCloseResult') }}</h3>
        <p class="session-id">{{ entry.request.sessionId }}</p>
        <p v-if="entry.state === 'unknown'">{{ t('agentRescueCloseUnknown') }}</p>
        <p v-if="entry.state === 'posting'">{{ t('processing') }}</p>
        <p v-if="entry.task">{{ t(taskStateKeys[entry.task.state]) }}</p>
        <p v-if="entry.task?.errorCode">{{ entry.task.errorCode }}</p>
        <AppNotice v-if="entry.problem" tone="error" :title="t(entry.problem.titleKey)"
          ><p>{{ t(entry.problem.descriptionKey) }}</p></AppNotice
        >
        <dl v-if="entry.task?.agentRescueCleanup">
          <dt>{{ t('agentVmStopped') }}</dt>
          <dd>{{ t(entry.task.agentRescueCleanup.cleanup.stopped ? 'diskYes' : 'diskNo') }}</dd>
          <dt>{{ t('agentVmRemoved') }}</dt>
          <dd>{{ t(entry.task.agentRescueCleanup.cleanup.removed ? 'diskYes' : 'diskNo') }}</dd>
          <dt>{{ t('agentDiskSynced') }}</dt>
          <dd>{{ t(entry.task.agentRescueCleanup.cleanup.diskSynced ? 'diskYes' : 'diskNo') }}</dd>
        </dl>
        <p>{{ t('agentRescueCloseDurability') }}</p>
        <AppButton
          v-if="entry.state !== 'done'"
          :disabled="rescue.checking.value || entry.state === 'posting'"
          @click="rescue.refresh"
          >{{ t('queryStatus') }}</AppButton
        >
      </section>
    </template>
    <AppDialog :open="selected !== null" :title="t('agentRescueClose')" @close="selected = null">
      <div class="confirmation">
        <p>{{ t('agentRescueCloseWarning') }}</p>
        <p class="session-id">{{ selected }}</p>
        <AppCheckbox v-model="confirmed">{{ t('agentRescueCloseConfirm') }}</AppCheckbox>
        <div class="buttons">
          <AppButton @click="selected = null">{{ t('cancel') }}</AppButton
          ><AppButton
            tone="primary"
            :disabled="!confirmed || !selected || !rescue.canClose(selected)"
            @click="close"
            >{{ t('agentRescueClose') }}</AppButton
          >
        </div>
      </div>
    </AppDialog>
  </section>
</template>
<style scoped>
.rescue-panel,
.sessions,
.close-result,
.confirmation {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  overflow-wrap: anywhere;
}
.sessions {
  padding: 0;
  list-style: none;
}
.sessions li,
.close-result {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: var(--space-3);
}
h2,
h3,
p,
ul {
  margin: 0;
}
h2,
h3 {
  font-size: var(--md-sys-typescale-title-medium-size);
}
.session-id {
  overflow-wrap: anywhere;
}
.buttons {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-2);
}
dl {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: var(--space-2);
}
dd {
  margin: 0;
}
@media (width < 480px) {
  .buttons > *,
  .rescue-panel > .btn {
    width: 100%;
  }
}
</style>
