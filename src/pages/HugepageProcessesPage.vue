<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  useHugepageProcesses,
  HugepageProcessCard,
  type ProcessSource,
} from '../modules/hugepage-processes'
import { useHugepages } from '../modules/hugepages'
import { taskStateKeys } from '../modules/tasks'
import AppButton from '../shared/ui/AppButton.vue'
import AppNotice from '../shared/ui/AppNotice.vue'
import AppDialog from '../shared/ui/AppDialog.vue'
import OperationTrackingNotice from '../shared/ui/OperationTrackingNotice.vue'
const model = useHugepageProcesses(),
  pool = useHugepages(),
  { t, locale } = useI18n()
const sources: ProcessSource[] = ['auto', 'ko', 'scan']
const sourceLabels = {
  auto: 'hpProcessSourceAuto',
  ko: 'hpProcessSourceKo',
  scan: 'hpProcessSourceScan',
} as const
const bytes = (value: string | null | undefined) =>
  value == null
    ? t('notAvailable')
    : t('hpProcessBytes', { value: BigInt(value).toLocaleString(locale.value) })
function changeSource(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'auto' || value === 'ko' || value === 'scan') void model.chooseSource(value)
}
async function prepareReconcile() {
  if (model.pending.value) return
  if (await pool.refresh()) pool.prepare({ kind: 'reconcile' })
}
async function submitReconcile() {
  await pool.submit()
  await model.refresh()
}
onMounted(() => {
  model.activate()
  void pool.refresh()
})
onBeforeUnmount(() => {
  model.deactivate()
  pool.cancelReview()
})
</script>
<template>
  <div class="hugepage-processes-page" data-testid="hugepage-processes-page">
    <AppBackLink to="/hugepages">{{ t('hugepagesTitle') }}</AppBackLink>
    <header>
      <h1>{{ t('hpProcessTitle') }}</h1>
      <p>{{ t('hpProcessIntro') }}</p>
    </header>
    <fieldset
      v-if="model.recoveryProblem.value"
      class="tracking-guard"
      :disabled="model.unresolved.value"
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
      <div class="controls">
        <label
          >{{ t('hpProcessSource')
          }}<select
            :value="model.source.value"
            data-testid="hugepage-process-source"
            @change="changeSource"
          >
            <option v-for="source in sources" :key="source" :value="source">
              {{ t(sourceLabels[source]) }}
            </option>
          </select></label
        ><AppButton
          data-testid="hugepage-process-refresh"
          :disabled="model.loading.value"
          @click="model.refresh"
          >{{ t('hugepagesRefresh') }}</AppButton
        >
      </div>
      <p v-if="model.loading.value" role="status">{{ t('loading') }}</p>
      <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
        ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p
        v-if="model.status.value && !model.fresh.value"
        data-testid="hugepage-process-stale"
        role="status"
      >
        {{ t('hpProcessStale') }}
      </p>
      <section
        v-if="model.status.value"
        class="observation"
        data-testid="hugepage-process-observation"
      >
        <h2>{{ t(sourceLabels[model.status.value.source]) }}</h2>
        <p>
          {{
            t(
              model.status.value.coverage === 'module-owners'
                ? 'hpProcessKoCoverage'
                : 'hpProcessScanCoverage',
            )
          }}
        </p>
        <p v-if="model.status.value.fallbackReason" role="status">{{ t('hpProcessFallback') }}</p>
        <p v-if="!model.status.value.available" role="status">{{ t('hpProcessUnavailable') }}</p>
        <p
          v-else-if="model.status.value.partial"
          role="status"
          data-testid="hugepage-process-partial"
        >
          {{ t('hpProcessPartial') }}
        </p>
        <p>{{ t('hpProcessTotal', { value: bytes(model.status.value.totals.bytes) }) }}</p>
        <p v-if="model.status.value.partial" class="muted">
          {{ t('hpProcessKnownTotal', { value: bytes(model.status.value.totals.knownBytes) }) }}
        </p>
      </section>
      <div class="process-list" data-testid="hugepage-process-list">
        <HugepageProcessCard
          v-for="(row, index) in model.status.value?.entries ?? []"
          :key="`${row.source}:${row.pid}:${row.startTicks ?? 'unknown'}:${index}`"
          :row="row"
        />
      </div>
      <p
        v-if="model.status.value?.available && model.status.value.entries.length === 0"
        role="status"
      >
        {{ t(model.status.value.partial ? 'hpProcessEmptyPartial' : 'hpProcessEmpty') }}
      </p>
      <section v-if="pool.management.value" class="observation">
        <h2>{{ t('hugepagesReconcile') }}</h2>
        <p>{{ t('hugepagesReconcileHint') }}</p>
        <AppButton
          data-testid="hugepage-process-reconcile"
          :disabled="
            model.pending.value ||
            pool.pending.value ||
            pool.loading.value ||
            pool.status.value?.features?.reconcile !== true
          "
          @click="prepareReconcile"
          >{{ t('hugepagesReconcile') }}</AppButton
        >
        <div v-if="pool.pending.value" role="status">
          <p>{{ t('hpProcessPoolPending') }}</p>
          <AppButton
            data-testid="hugepage-process-query-pool"
            :disabled="pool.checking.value"
            @click="pool.reconcile"
            >{{ t('queryStatus') }}</AppButton
          ><RouterLink class="btn tonal" to="/hugepages">{{ t('hugepagesTitle') }}</RouterLink>
        </div>
      </section>
    </template>
    <section
      v-if="model.entry.value"
      class="observation"
      data-testid="hugepage-process-receipt"
      aria-live="polite"
    >
      <h2>{{ t('hpProcessReceipt') }}</h2>
      <div v-if="model.entry.value.restored" data-testid="hugepage-process-tracking-restored">
        <p>{{ t('operationTrackingHint') }}</p>
        <p>{{ t('hpProcessRecoveryHint') }}</p>
      </div>
      <p v-if="model.entry.value.task">{{ t(taskStateKeys[model.entry.value.task.state]) }}</p>
      <p v-if="model.entry.value.state === 'unknown' || model.unresolved.value">
        {{ t('hpProcessUnknown') }}
      </p>
      <p v-if="model.entry.value.problem">{{ t(model.entry.value.problem.titleKey) }}</p>
      <p v-if="model.receipt.value">
        {{ t(model.receipt.value.sent ? 'hpProcessSignalSent' : 'hpProcessSignalNotSent') }}
      </p>
      <p v-if="model.receipt.value?.exited === true">{{ t('hpProcessConfirmedExited') }}</p>
      <p>{{ t('hpProcessReceiptHint') }}</p>
      <AppButton
        data-testid="hugepage-process-query"
        :disabled="model.checking.value || model.entry.value.state === 'posting'"
        @click="model.reconcile"
        >{{ t('queryStatus') }}</AppButton
      >
    </section>
    <AppDialog
      :open="!!model.review.value"
      :title="
        t(model.review.value?.signal === 'kill' ? 'hpProcessConfirmKill' : 'hpProcessConfirmTerm')
      "
      @close="model.cancelReview"
    >
      <template v-if="model.review.value">
        <p data-testid="hugepage-process-confirm-identity">
          {{
            t('hpProcessConfirmIdentity', {
              name: model.review.value.name || t('hpProcessUnnamed'),
              pid: model.review.value.expected.pid,
              birth: model.review.value.expected.startTicks,
            })
          }}
        </p>
        <p v-if="model.review.value.vmName">
          {{ t('hpProcessConfirmVm', { name: model.review.value.vmName }) }}
        </p>
        <p v-if="model.review.value.controlsCurrentVm">{{ t('hpProcessControlsCurrentVm') }}</p>
        <p>
          {{ t(model.review.value.signal === 'kill' ? 'hpProcessKillRisk' : 'hpProcessTermRisk') }}
        </p>
        <label class="signal-confirm"
          ><input
            v-model="model.confirmSignal.value"
            type="checkbox"
            data-testid="hugepage-process-confirm-check"
          />{{ t('hpProcessSignalAcknowledgment') }}</label
        >
        <div class="buttons">
          <AppButton @click="model.cancelReview">{{ t('cancel') }}</AppButton
          ><AppButton
            data-testid="hugepage-process-confirm"
            tone="primary"
            :disabled="!model.confirmSignal.value || !model.editable.value"
            @click="model.submit"
            >{{ t('confirm') }}</AppButton
          >
        </div>
      </template>
    </AppDialog>
    <AppDialog
      :open="!!model.stackTarget.value"
      :title="t('hpProcessStack')"
      @close="model.closeStack"
    >
      <p v-if="model.stackTarget.value">
        {{ model.stackTarget.value.name }} · PID {{ model.stackTarget.value.expected.pid }}
      </p>
      <p v-if="model.stackLoading.value" role="status">{{ t('loading') }}</p>
      <AppNotice
        v-if="model.stackProblem.value"
        tone="error"
        :title="t(model.stackProblem.value.titleKey)"
      />
      <p v-if="model.stack.value && !model.stack.value.available">
        {{ t('hpProcessStackUnavailable') }}
      </p>
      <pre
        v-if="model.stack.value?.text != null"
        class="stack-text"
        data-testid="hugepage-process-stack-text"
        >{{ model.stack.value.text }}</pre
      >
      <p v-if="model.stack.value?.truncated" role="status">{{ t('hpProcessStackTruncated') }}</p>
    </AppDialog>
    <AppDialog
      :open="pool.review.value?.operation.kind === 'reconcile'"
      :title="t('hugepagesReconcile')"
      @close="pool.cancelReview"
      ><p>{{ t('hugepagesReconcileHint') }}</p>
      <div class="buttons">
        <AppButton @click="pool.cancelReview">{{ t('cancel') }}</AppButton
        ><AppButton
          data-testid="hugepage-process-confirm-reconcile"
          :disabled="model.pending.value || !pool.editable.value"
          @click="submitReconcile"
          >{{ t('confirm') }}</AppButton
        >
      </div></AppDialog
    >
  </div>
</template>
<style scoped>
.tracking-guard {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.hugepage-processes-page {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  min-width: 0;
}
.hugepage-processes-page > a {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
}
h1,
h2 {
  margin: 0;
  overflow-wrap: anywhere;
}
h2 {
  font-size: var(--font-heading);
}
p {
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.controls {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.controls label {
  display: grid;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
}
select {
  min-height: 48px;
  width: 100%;
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
select:focus-visible,
.signal-confirm input:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
}
.observation {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  min-width: 0;
}
.process-list {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.muted {
  color: var(--muted);
  font-size: var(--font-sm);
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.signal-confirm {
  display: flex;
  align-items: center;
  min-height: 48px;
  gap: var(--space-3);
  line-height: 1.5;
  margin-block: var(--space-3);
}
.signal-confirm input {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
}
.stack-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 50vh;
  overflow: auto;
  padding: var(--space-3);
  background: var(--soft);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
}
.btn {
  min-height: 48px;
  max-width: 100%;
  white-space: normal;
}
</style>
