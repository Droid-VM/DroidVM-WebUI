<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHugepages } from '../model/hugepages'
import { useHugepageFormatting } from './format'
import { taskStateKeys } from '../../tasks'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppCheckbox from '../../../shared/ui/AppCheckbox.vue'

// The operation receipt and the confirmation dialog, shared by the main and advanced pages.
const model = useHugepages()
const { t } = useI18n(),
  { pageLabel, flag, leverLabel } = useHugepageFormatting()
const summary = computed(() => {
  const operation = model.review.value?.operation
  if (!operation) return ''
  switch (operation.kind) {
    case 'acquire':
      return t('hugepagesConfirmAcquire', { mode: operation.mode })
    case 'stop-acquire':
      return t('hugepagesConfirmStop')
    case 'targets':
      return t('hugepagesConfirmTargets', {
        pool: pageLabel(operation.poolPages),
        cma: operation.cmaPages === null ? t('hugepagesKeepCma') : pageLabel(operation.cmaPages),
      })
    case 'runtime':
      return t(
        operation.enabled ? 'hugepagesConfirmRuntimeEnable' : 'hugepagesConfirmRuntimeDisable',
      )
    case 'unload':
      return t('hugepagesConfirmUnload')
    case 'boot':
      return t(operation.enabled ? 'hugepagesConfirmBootEnable' : 'hugepagesConfirmBootDisable')
    case 'cma':
      return operation.enabled
        ? t(operation.persist ? 'hugepagesConfirmCmaEnable' : 'hugepagesConfirmCmaTrial', {
            target: pageLabel(operation.pages),
            lever: leverLabel(operation.lever),
          })
        : t('hugepagesConfirmCmaDisable')
    case 'cma-save':
      return t('hugepagesConfirmCmaSave', {
        target: pageLabel(operation.pages),
        lever: leverLabel(operation.lever),
      })
    case 'advanced':
      return t('hugepagesConfirmAdvanced', {
        setting: t(model.advancedFields.find((field) => field.key === operation.key)!.label),
        value: operation.value ?? t('hugepagesDefault'),
      })
    case 'reconcile':
      return t('hugepagesReconcileHint')
    case 'migrate-settings':
      return t('hugepagesMigrateHint')
    case 'dismiss-crash':
      return t('hugepagesDismissCrashHint')
  }
  return ''
})
const riskMessage = computed(() =>
  model.review.value?.operation.kind === 'cma'
    ? 'hugepagesCmaRisk'
    : model.review.value?.operation.kind === 'unload'
      ? 'hugepagesUnloadRisk'
      : 'hugepagesSystemReserveRisk',
)
</script>

<template>
  <section
    v-if="model.entry.value"
    class="panel receipt"
    data-testid="hugepages-receipt"
    aria-live="polite"
  >
    <h2>{{ t('hugepagesOutcome') }}</h2>
    <p v-if="model.entry.value.task">{{ t(taskStateKeys[model.entry.value.task.state]) }}</p>
    <p v-if="model.entry.value.state === 'unknown'">{{ t('hugepagesUnknown') }}</p>
    <p v-if="model.entry.value.problem">{{ t(model.entry.value.problem.titleKey) }}</p>
    <p v-if="model.entry.value.task?.errorCode">{{ model.entry.value.task.errorCode }}</p>
    <dl v-if="model.receipt.value" class="facts">
      <div>
        <dt>{{ t('hugepagesSaved') }}</dt>
        <dd>{{ flag(model.receipt.value.saved) }}</dd>
      </div>
      <div>
        <dt>{{ t('hugepagesApplied') }}</dt>
        <dd>{{ flag(model.receipt.value.applied) }}</dd>
      </div>
      <div>
        <dt>{{ t('hugepagesDegraded') }}</dt>
        <dd>{{ flag(model.receipt.value.degraded) }}</dd>
      </div>
    </dl>
    <p v-if="model.unresolvedReceipt.value">{{ t('hugepagesPartial') }}</p>
    <div class="buttons">
      <AppButton
        data-testid="hugepages-query"
        :disabled="model.checking.value || model.entry.value.state === 'posting'"
        @click="model.reconcile"
        >{{ t('queryStatus') }}</AppButton
      ><AppButton
        v-if="model.unresolvedReceipt.value && !model.acknowledged.value"
        :disabled="!model.fresh.value || model.entry.value.state !== 'done'"
        @click="model.acknowledged.value = true"
        >{{ t('hugepagesAcknowledge') }}</AppButton
      >
    </div>
  </section>
  <AppDialog
    :open="!!model.review.value"
    :title="t('hugepagesConfirmTitle')"
    @close="model.cancelReview"
  >
    <p data-testid="hugepages-confirm-summary">{{ summary }}</p>
    <template v-if="model.requiresRiskConfirmation.value">
      <p>{{ t(riskMessage) }}</p>
      <AppCheckbox v-model="model.confirmRisk.value" data-testid="hugepages-confirm-risk">{{
        t('hugepagesRiskAcknowledgment')
      }}</AppCheckbox>
    </template>
    <div class="buttons">
      <AppButton @click="model.cancelReview">{{ t('cancel') }}</AppButton
      ><AppButton
        tone="primary"
        data-testid="hugepages-confirm"
        :disabled="
          !model.editable.value ||
          (model.requiresRiskConfirmation.value && !model.confirmRisk.value)
        "
        @click="model.submit"
        >{{ t('confirm') }}</AppButton
      >
    </div>
  </AppDialog>
</template>
