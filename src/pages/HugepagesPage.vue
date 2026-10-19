<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  useHugepages,
  hugepageGroups,
  useHugepageFormatting,
  HugepageOverviewPanel,
  HugepageReservePanel,
  HugepageModulePanel,
  HugepageCmaPanel,
  HugepageAdvancedPanel,
  HugepageMaintenancePanel,
} from '../modules/hugepages'
import { taskStateKeys } from '../modules/tasks'
import { useHugepageProcesses } from '../modules/hugepage-processes'
import AppButton from '../shared/ui/AppButton.vue'
import AppNotice from '../shared/ui/AppNotice.vue'
import AppDialog from '../shared/ui/AppDialog.vue'
import OperationTrackingNotice from '../shared/ui/OperationTrackingNotice.vue'
const model = useHugepages(),
  { t } = useI18n()
const processes = useHugepageProcesses()
const { pageLabel, flag, leverLabel } = useHugepageFormatting()
const groupLabels = {
  overview: 'hugepagesGroupOverview',
  reserve: 'hugepagesGroupReserve',
  module: 'hugepagesGroupModule',
  cma: 'hugepagesGroupCma',
  advanced: 'hugepagesGroupAdvanced',
  maintenance: 'hugepagesGroupMaintenance',
} as const
const groups = computed(() =>
  model.management.value ? hugepageGroups : hugepageGroups.slice(0, 2),
)
const selected = ref<(typeof hugepageGroups)[number]>('overview')
watch(groups, (value) => {
  if (!value.includes(selected.value)) selected.value = 'overview'
})
function moveTab(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const current = groups.value.indexOf(selected.value)
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? groups.value.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + groups.value.length) %
          groups.value.length
  selected.value = groups.value[index]!
  void nextTick(() => document.getElementById(`hugepages-tab-${selected.value}`)?.focus())
}
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
        ? t('hugepagesConfirmCmaTrial', {
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
onMounted(model.activate)
onBeforeUnmount(model.deactivate)
</script>
<template>
  <div class="hugepages-page" data-testid="hugepages-page">
    <RouterLink to="/more">{{ t('navMore') }}</RouterLink>
    <header>
      <h1>{{ t('hugepagesTitle') }}</h1>
      <AppButton
        v-if="model.supported.value"
        data-testid="hugepages-refresh"
        :disabled="model.loading.value"
        @click="model.refresh"
        >{{ t('hugepagesRefresh') }}</AppButton
      >
      <p>{{ t('hugepagesIntro') }}</p>
      <RouterLink
        v-if="processes.supported.value"
        to="/hugepages/processes"
        data-testid="hugepages-processes-link"
        >{{ t('hpProcessTitle') }}</RouterLink
      >
    </header>
    <fieldset
      v-if="model.recoveryProblem.value"
      :disabled="model.unresolvedReceipt.value && !model.acknowledged.value"
    >
      <OperationTrackingNotice
        :problem="model.recoveryProblem.value"
        @clear="model.clearTracking"
      />
    </fieldset>
    <AppNotice
      v-if="!model.supported.value"
      tone="warning"
      :title="t('settingsCapabilityUnavailable')"
    />
    <template v-else>
      <p v-if="model.loading.value" role="status">{{ t('loading') }}</p>
      <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
        ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p
        v-if="model.status.value && !model.fresh.value"
        role="status"
        data-testid="hugepages-stale"
      >
        {{ t('hugepagesStale') }}
      </p>
      <AppNotice
        v-if="!model.management.value"
        tone="warning"
        :title="t('hugepagesManagementUnavailable')"
        data-testid="hugepages-management-unavailable"
        ><p>{{ t('hugepagesManagementUnavailableHint') }}</p></AppNotice
      >
      <div
        class="section-nav"
        role="tablist"
        :aria-label="t('hugepagesSectionNav')"
        @keydown="moveTab"
      >
        <button
          v-for="group in groups"
          :id="`hugepages-tab-${group}`"
          :key="group"
          type="button"
          role="tab"
          :aria-selected="selected === group"
          :aria-controls="`hugepages-panel-${group}`"
          :tabindex="selected === group ? 0 : -1"
          :data-testid="`hugepages-tab-${group}`"
          @click="selected = group"
        >
          {{ t(groupLabels[group]) }}
        </button>
      </div>
      <div
        :id="`hugepages-panel-${selected}`"
        role="tabpanel"
        :aria-labelledby="`hugepages-tab-${selected}`"
        tabindex="0"
      >
        <HugepageOverviewPanel v-if="selected === 'overview'" :model="model" />
        <HugepageReservePanel v-if="selected === 'reserve'" />
        <HugepageModulePanel
          v-if="selected === 'module' && model.management.value"
          :model="model"
        />
        <HugepageCmaPanel v-if="selected === 'cma' && model.management.value" />
        <HugepageAdvancedPanel v-if="selected === 'advanced' && model.management.value" />
        <HugepageMaintenancePanel
          v-if="selected === 'maintenance' && model.management.value"
          :model="model"
        />
      </div>
    </template>
    <section
      v-if="model.entry.value"
      class="panel"
      data-testid="hugepages-receipt"
      aria-live="polite"
    >
      <h2>{{ t('hugepagesOutcome') }}</h2>
      <div v-if="model.entry.value.restored" data-testid="hugepages-tracking-restored">
        <p>{{ t('operationTrackingHint') }}</p>
        <p>{{ t('hugepagesRecoveryHint') }}</p>
      </div>
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
      <p>{{ t('hugepagesTaskHint') }}</p>
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
      <p>{{ t('hugepagesTaskHint') }}</p>
      <template v-if="model.requiresRiskConfirmation.value">
        <p>{{ t(riskMessage) }}</p>
        <label class="confirmation-choice"
          ><input
            v-model="model.confirmRisk.value"
            type="checkbox"
            data-testid="hugepages-confirm-risk"
          />{{ t('hugepagesRiskAcknowledgment') }}</label
        >
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
  </div>
</template>
<style>
.hugepages-page {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  min-width: 0;
}
.hugepages-page header h1,
.hugepages-page h2 {
  margin: 0;
}
.hugepages-page header a {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
}
.hugepages-page header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
}
.hugepages-page header h1 {
  font-size: var(--font-heading);
}
.hugepages-page header p {
  grid-column: 1 / -1;
  margin: 0;
}
.hugepages-page h2 {
  font-size: var(--font-heading);
}
.hugepages-page h3 {
  font-size: 1rem;
  margin: var(--space-4) 0 var(--space-2);
}
.hugepages-page .panel {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  min-width: 0;
  scroll-margin-top: var(--space-4);
}
.hugepages-page .facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
.hugepages-page dt,
.hugepages-page small,
.hugepages-page .hint {
  color: var(--muted);
  font-size: var(--font-sm);
}
.hugepages-page dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}
.hugepages-page fieldset {
  display: grid;
  gap: var(--space-4);
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.hugepages-page label {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.hugepages-page input:not([type='checkbox']),
.hugepages-page select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--soft);
  color: var(--ink);
  font: inherit;
}
.hugepages-page input:focus-visible,
.hugepages-page select:focus-visible,
.hugepages-page .section-nav button:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
}
.hugepages-page .buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.hugepages-page .buttons .btn {
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}
.hugepages-page p {
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.hugepages-page .section-nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.hugepages-page .section-nav button {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
  max-width: 100%;
}
.hugepages-page .section-nav button[aria-selected='true'] {
  background: var(--soft);
  border-color: var(--primary);
  font-weight: 600;
}
.hugepages-page .setting-card {
  border-top: 1px solid var(--line);
  margin-top: var(--space-4);
  padding-top: var(--space-2);
  min-width: 0;
}
.hugepages-page .confirmation-choice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 48px;
  line-height: 1.5;
}
.hugepages-page .confirmation-choice input {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  accent-color: var(--primary);
}
@media (max-width: 380px) {
  .hugepages-page .facts {
    grid-template-columns: minmax(0, 1fr);
  }
  .hugepages-page .buttons .btn {
    flex: 1 1 auto;
  }
}
</style>
