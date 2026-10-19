<script setup lang="ts">
import AppLinkButton from '../../../shared/ui/AppLinkButton.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentOperations } from '../model/operations'
import { taskStateKeys, taskPercent } from '../../tasks'
import type { MessageKey } from '../../../shared/i18n'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppProgress from '../../../shared/ui/AppProgress.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
const { t } = useI18n()
const agent = useAgentOperations(),
  entry = agent.entry
const result = computed(() => entry.value?.task?.agentResult)
const stateKeys: Record<string, MessageKey> = {
  pending: 'agentStatePending',
  running: 'agentStateRunning',
  succeeded: 'agentStateSucceeded',
  skipped: 'agentStateSkipped',
  partial: 'agentStatePartial',
  failed: 'agentStateFailed',
  uncertain: 'agentStateUncertain',
  cancelled: 'agentStateCancelled',
  not_required: 'agentStateNotRequired',
  rescue_ready: 'agentStateRescueReady',
}
const label = (state: string) => t(stateKeys[state] ?? 'agentStateUncertain')
</script>
<template>
  <OperationTrackingNotice :problem="agent.trackingProblem.value" @clear="agent.clearTracking" />
  <section v-if="entry" class="agent-status" aria-live="polite" :aria-label="t('agentStatusTitle')">
    <h2>
      {{ t(entry.reference.action === 'chpasswd' ? 'agentPasswordTitle' : 'agentGrowTitle') }}
    </h2>
    <p class="muted">{{ entry.reference.diskId }}</p>
    <p v-if="entry.state === 'unknown'">{{ t('agentUnknown') }}</p>
    <p v-else-if="entry.state === 'posting'">{{ t('processing') }}</p>
    <p v-if="entry.task">{{ t(taskStateKeys[entry.task.state]) }}</p>
    <AppProgress
      v-if="entry.task && entry.state === 'waiting'"
      :label="t('agentStatusTitle')"
      :value="taskPercent(entry.task)"
    />
    <AppNotice v-if="entry.problem" tone="error" :title="t(entry.problem.titleKey)">
      <p>{{ t(entry.problem.descriptionKey) }}</p>
    </AppNotice>
    <template v-if="result">
      <strong>{{ label(result.outcome) }}</strong>
      <template v-if="result.outcome === 'rescue_ready'">
        <p>{{ t('agentRescueHandoffHint') }}</p>
        <AppLinkButton
          v-if="result.rescueSessionId"
          tone="tonal"
          :to="`/agent/rescue/${result.rescueSessionId}`"
          >{{ t('agentRescueOpen') }}</AppLinkButton
        >
      </template>
      <dl>
        <dt>{{ t('agentGuestResult') }}</dt>
        <dd>{{ label(result.guestOutcome) }}</dd>
        <dt>{{ t('agentGuestCleanup') }}</dt>
        <dd>{{ label(result.guestCleanup) }}</dd>
        <dt>{{ t('agentVmStopped') }}</dt>
        <dd>{{ t(result.cleanup.stopped ? 'diskYes' : 'diskNo') }}</dd>
        <dt>{{ t('agentVmRemoved') }}</dt>
        <dd>{{ t(result.cleanup.removed ? 'diskYes' : 'diskNo') }}</dd>
        <dt>{{ t('agentDiskSynced') }}</dt>
        <dd>{{ t(result.cleanup.diskSynced ? 'diskYes' : 'diskNo') }}</dd>
        <dt>{{ t('agentDurability') }}</dt>
        <dd>{{ t(result.durabilityConfirmed ? 'agentConfirmed' : 'agentNotConfirmed') }}</dd>
      </dl>
      <ul v-if="result.actions.length">
        <li v-for="(action, index) in result.actions" :key="index">
          {{ t(action.action === 'chpasswd' ? 'agentPasswordTitle' : 'agentGrowTitle') }} ·
          {{ label(action.state) }}
          <span v-if="action.code"> · {{ action.code }}</span>
        </li>
      </ul>
      <p v-if="result.guestCode">{{ t('agentResultCode') }}: {{ result.guestCode }}</p>
      <p v-if="result.reason !== 'none'">{{ t('agentResultCode') }}: {{ result.reason }}</p>
      <p v-if="result.outcome === 'skipped'">{{ t('agentSkippedHint') }}</p>
      <p v-if="result.outcome === 'partial'">{{ t('agentPartialHint') }}</p>
      <p v-if="result.outcome === 'uncertain'">{{ t('agentUncertainHint') }}</p>
      <p v-if="result.committed && result.outcome !== 'succeeded'">{{ t('agentNoRollback') }}</p>
      <AppNotice v-if="result.recoveryRequired" tone="warning" :title="t('agentRecoveryNeeded')" />
    </template>
    <p v-else-if="entry.task?.errorCode">{{ entry.task.errorCode }}</p>
    <div class="buttons">
      <AppButton
        v-if="entry.state !== 'done'"
        :disabled="agent.checking.value || entry.state === 'posting'"
        @click="agent.reconcile"
        >{{ t('queryStatus') }}</AppButton
      >
      <AppLinkButton tone="tonal" to="/tasks">{{ t('diskTaskLink') }}</AppLinkButton>
    </div>
  </section>
</template>
<style scoped>
.agent-status {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  min-width: 0;
  overflow-wrap: anywhere;
}
h2 {
  font-size: var(--md-sys-typescale-title-medium-size);
  margin: 0;
}
p {
  margin: 0;
}
dl {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: var(--space-2);
  margin: 0;
}
dd {
  margin: 0;
}
ul {
  padding-inline-start: var(--space-4);
  margin: 0;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
</style>
