<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDiskActions } from '../model/diskOperations'
import { useResourceCatalog } from '../model/catalog'
import { diskActionKeys } from '../model/diskForm'
import { taskPercent, taskStateKeys } from '../../tasks'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
import type { MessageKey } from '../../../shared/i18n'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppProgress from '../../../shared/ui/AppProgress.vue'
withDefaults(defineProps<{ showResult?: boolean; showRetry?: boolean }>(), {
  showResult: true,
  showRetry: true,
})
const { t } = useI18n(),
  actions = useDiskActions(),
  resources = useResourceCatalog()
const growStateKeys: Record<string, MessageKey> = {
  waiting: 'diskGrowWaiting',
  checking: 'diskGrowChecking',
  submitted: 'diskGrowSubmitted',
  stopped: 'diskGrowStopped',
}
const growConfirmed = ref(false)
watch(
  () => actions.resizeGrow.sequence.value,
  () => {
    growConfirmed.value = false
  },
)
async function resumeGrow() {
  if (!growConfirmed.value) return
  growConfirmed.value = false
  await actions.resumeGrow()
}
function retry() {
  void actions.retry()
}
</script>
<template>
  <OperationTrackingNotice
    :problem="actions.recoveryProblem.value"
    @clear="actions.clearTracking"
  />
  <AppNotice
    v-if="actions.resizeGrow.recoveryProblem.value"
    tone="warning"
    :title="t('operationTrackingTitle')"
    ><p>{{ t('diskGrowTrackingUnavailable') }}</p></AppNotice
  >
  <section
    v-if="actions.entries.value.disk"
    class="disk-status"
    :aria-label="t('diskOperationStatus')"
  >
    <template v-for="entry in [actions.entries.value.disk]" :key="entry.request.requestId">
      <p v-if="entry.restored" data-testid="disk-continuation-lost">
        {{ t('diskContinuationLost') }}
      </p>
      <strong>{{
        t(
          actions.lastOptimizationOrigin.value
            ? 'diskOptimizeTitle'
            : diskActionKeys[entry.request.operation.action],
        )
      }}</strong>
      <p v-if="entry.state === 'unknown'">{{ t('vmOperationUnknown') }}</p>
      <p v-if="entry.state === 'posting'">{{ t('processing') }}</p>
      <p v-if="entry.task">
        {{ t(taskStateKeys[entry.task.state])
        }}<span v-if="entry.task.errorCode"> · {{ entry.task.errorCode }}</span>
      </p>
      <div
        v-if="actions.resizeGrow.sequence.value?.resizeRequestId === entry.request.requestId"
        class="grow-status"
        aria-live="polite"
      >
        <strong>{{ t('diskGrowSequence') }}</strong>
        <p>{{ t(growStateKeys[actions.resizeGrow.sequence.value.state]!) }}</p>
        <p>
          {{ actions.resizeGrow.sequence.value.target.diskId }} ·
          {{ actions.resizeGrow.sequence.value.target.size }} B
        </p>
        <p v-if="actions.resizeGrow.sequence.value.growRequestId">
          {{ t('diskGrowRequest', { id: actions.resizeGrow.sequence.value.growRequestId }) }}
        </p>
        <template
          v-if="
            actions.resizeGrow.sequence.value.state === 'stopped' &&
            !actions.resizeGrow.sequence.value.growRequestId &&
            entry.state === 'done' &&
            entry.task?.state === 'succeeded'
          "
        >
          <label
            ><input v-model="growConfirmed" type="checkbox" />{{
              t('diskGrowResumeConfirm')
            }}</label
          >
          <AppButton
            :disabled="
              !growConfirmed ||
              !actions.resizeGrow.available.value ||
              !!actions.resizeGrow.recoveryProblem.value
            "
            @click="resumeGrow"
            >{{ t('diskGrowResume') }}</AppButton
          >
        </template>
        <p v-if="actions.resizeGrow.sequence.value.problem">
          {{ t(actions.resizeGrow.sequence.value.problem.descriptionKey) }}
        </p>
        <AppButton v-if="actions.resizeGrow.pending.value" @click="actions.resizeGrow.stop">{{
          t('diskGrowStop')
        }}</AppButton>
      </div>
      <AppProgress
        v-if="entry.task && entry.state === 'waiting'"
        :label="t('diskOperationStatus')"
        :value="taskPercent(entry.task)"
      />
      <p v-if="entry.task?.errorCode === 'COMMIT_UNCERTAIN'">
        {{ t(actions.recovery.supported.value ? 'diskRecoveryNeeded' : 'diskRecoveryRequired') }}
      </p>
      <AppNotice v-if="entry.problem" tone="error" :title="t(entry.problem.titleKey)"
        ><p>{{ t(entry.problem.descriptionKey) }}</p></AppNotice
      >
      <AppButton :disabled="actions.checking.value" @click="actions.reconcile">{{
        t('queryStatus')
      }}</AppButton>
      <AppButton
        v-if="showRetry && entry.state === 'done' && entry.task?.state !== 'succeeded'"
        :disabled="!actions.allowed.value"
        @click="retry"
        >{{ t('diskEditRetry') }}</AppButton
      >
      <AppButton
        v-if="
          showResult &&
          entry.task?.state === 'succeeded' &&
          entry.task.diskId &&
          !['delete', 'commit'].includes(entry.request.operation.action)
        "
        @click="resources.diskDetail.open(entry.task.diskId!)"
        >{{ t('diskViewResult') }}</AppButton
      >
      <RouterLink class="btn tonal" to="/tasks">{{ t('diskTaskLink') }}</RouterLink>
    </template>
  </section>
</template>
<style scoped>
.disk-status {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow-wrap: anywhere;
}
p {
  margin: 0;
}
.btn {
  justify-self: start;
}
.grow-status {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border-inline-start: 3px solid var(--line);
  min-width: 0;
}
@media (max-width: 480px) {
  .btn {
    width: 100%;
    justify-self: stretch;
  }
}
</style>
