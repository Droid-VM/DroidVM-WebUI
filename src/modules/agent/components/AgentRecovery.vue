<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentOperations } from '../model/operations'
import { taskStateKeys } from '../../tasks'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
const { t } = useI18n(),
  agent = useAgentOperations(),
  confirm = ref(false)
async function prepare() {
  await agent.readRecovery()
  if (agent.recoveryAllowed.value && agent.pendingRecords.value !== null) confirm.value = true
}
function run() {
  confirm.value = false
  void agent.recover()
}
</script>
<template>
  <section
    v-if="agent.recovery.supported.value"
    class="agent-recovery"
    :aria-label="t('agentRecoveryTitle')"
  >
    <h2>{{ t('agentRecoveryTitle') }}</h2>
    <OperationTrackingNotice
      :problem="agent.recovery.recoveryProblem.value"
      @clear="agent.recovery.clearTracking"
    />
    <p>{{ t('agentRecoveryHint') }}</p>
    <p v-if="agent.pendingRecords.value !== null">
      {{ t('agentRecoveryCount', { count: agent.pendingRecords.value }) }}
    </p>
    <AppNotice
      v-if="agent.recoveryProblem.value"
      tone="error"
      :title="t(agent.recoveryProblem.value.titleKey)"
    >
      <p>{{ t(agent.recoveryProblem.value.descriptionKey) }}</p>
    </AppNotice>
    <template v-for="entry in agent.recovery.entries.value" :key="entry.request.requestId">
      <p v-if="entry.state === 'unknown'">{{ t('agentRecoveryUnknown') }}</p>
      <p v-if="entry.task">{{ t(taskStateKeys[entry.task.state]) }}</p>
      <p v-if="entry.task?.pendingRecords !== undefined">
        {{ t('agentRecoveryCount', { count: entry.task.pendingRecords }) }}
      </p>
      <AppNotice v-if="entry.problem" tone="error" :title="t(entry.problem.titleKey)"
        ><p>{{ t(entry.problem.descriptionKey) }}</p></AppNotice
      >
    </template>
    <div class="buttons">
      <AppButton
        :disabled="agent.recovery.checking.value || agent.recoveryLoading.value"
        @click="agent.reconcileRecovery"
        >{{ t('queryStatus') }}</AppButton
      >
      <AppButton
        :disabled="!agent.recoveryAllowed.value || agent.pendingRecords.value === 0"
        @click="prepare"
        >{{ t('agentRecover') }}</AppButton
      >
    </div>
    <AppDialog :open="confirm" :title="t('agentRecoveryTitle')" @close="confirm = false">
      <p>{{ t('agentRecoveryConfirm') }}</p>
      <div class="buttons">
        <AppButton @click="confirm = false">{{ t('cancel') }}</AppButton>
        <AppButton tone="primary" :disabled="!agent.recoveryAllowed.value" @click="run">{{
          t('agentRecover')
        }}</AppButton>
      </div>
    </AppDialog>
  </section>
</template>
<style scoped>
.agent-recovery {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  overflow-wrap: anywhere;
}
h2 {
  font-size: var(--md-sys-typescale-title-medium-size);
  margin: 0;
}
p {
  margin: 0;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
@media (width < 600px) {
  .buttons .btn {
    flex: 1 1 100%;
  }
}
</style>
