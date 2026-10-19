<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDiskActions } from '../model/diskOperations'
import { taskStateKeys } from '../../tasks'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'

const { t } = useI18n(),
  recovery = useDiskActions().recovery,
  confirm = ref(false)
async function prepare() {
  await recovery.readStatus()
  if (recovery.allowed.value && recovery.pending.value !== null) confirm.value = true
}
function run() {
  if (!recovery.allowed.value) return
  confirm.value = false
  void recovery.submit()
}
</script>
<template>
  <section
    v-if="recovery.supported.value"
    class="disk-recovery"
    :aria-label="t('diskRecoveryTitle')"
  >
    <h2>{{ t('diskRecoveryTitle') }}</h2>
    <OperationTrackingNotice
      :problem="recovery.recoveryProblem.value"
      @clear="recovery.clearTracking"
    />
    <p v-if="recovery.pending.value !== null">
      {{ t('diskRecoveryCount', { count: recovery.pending.value }) }}
    </p>
    <p>{{ t('diskRecoveryHint') }}</p>
    <AppNotice
      v-if="recovery.problem.value"
      tone="error"
      :title="t(recovery.problem.value.titleKey)"
      ><p>{{ t(recovery.problem.value.descriptionKey) }}</p></AppNotice
    >
    <template v-for="entry in recovery.entries.value" :key="entry.request.requestId">
      <p v-if="entry.state === 'unknown'" role="status">{{ t('vmOperationUnknown') }}</p>
      <p v-else-if="entry.state === 'posting'" role="status">{{ t('processing') }}</p>
      <p v-if="entry.task">
        {{ t(taskStateKeys[entry.task.state])
        }}<span v-if="entry.task.errorCode"> · {{ entry.task.errorCode }}</span>
      </p>
      <p v-if="entry.task?.state === 'succeeded'">
        {{ t('diskRecoveryResult', { count: entry.task.pendingRecords }) }}
      </p>
      <AppNotice v-if="entry.problem" tone="error" :title="t(entry.problem.titleKey)"
        ><p>{{ t(entry.problem.descriptionKey) }}</p></AppNotice
      >
    </template>
    <div class="buttons">
      <AppButton
        :disabled="recovery.checking.value || recovery.loading.value"
        @click="recovery.reconcile"
        >{{ t('diskRecoveryRefresh') }}</AppButton
      >
      <AppButton :disabled="!recovery.allowed.value" @click="prepare">{{
        t('diskRecover')
      }}</AppButton>
      <RouterLink class="btn tonal" to="/tasks">{{ t('diskTaskLink') }}</RouterLink>
    </div>
    <AppDialog :open="confirm" :title="t('diskRecoveryTitle')" @close="confirm = false">
      <p>{{ t('diskRecoveryConfirm') }}</p>
      <div class="buttons">
        <AppButton @click="confirm = false">{{ t('cancel') }}</AppButton>
        <AppButton tone="primary" :disabled="!recovery.allowed.value" @click="run">{{
          t('diskRecover')
        }}</AppButton>
      </div>
    </AppDialog>
  </section>
</template>
<style scoped>
.disk-recovery {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow-wrap: anywhere;
}
h2 {
  font-size: var(--font-heading);
  margin: 0;
}
p {
  margin: 0;
}
.buttons {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
</style>
