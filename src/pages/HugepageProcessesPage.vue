<script setup lang="ts">
import AppLinkButton from '../shared/ui/AppLinkButton.vue'
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  useHugepageProcesses,
  type ProcessEntry,
  type ProcessSource,
} from '../modules/hugepage-processes'
import { useHugepages, HugepageUsageBar, ownerHue } from '../modules/hugepages'
import { taskStateKeys } from '../modules/tasks'
import AppButton from '../shared/ui/AppButton.vue'
import AppIcon from '../shared/ui/AppIcon.vue'
import AppMenu from '../shared/ui/AppMenu.vue'
import AppNotice from '../shared/ui/AppNotice.vue'
import AppDialog from '../shared/ui/AppDialog.vue'
import AppCheckbox from '../shared/ui/AppCheckbox.vue'
import OperationTrackingNotice from '../shared/ui/OperationTrackingNotice.vue'

// The App's usage screen: the pool bar, then one row per process holding hugepages with
// its size and signal actions. Source choice and re-attribution sit in the overflow menu.
const model = useHugepageProcesses(),
  pool = useHugepages(),
  { t, n } = useI18n()
const sources: ProcessSource[] = ['auto', 'ko', 'scan']
const sourceLabels = {
  auto: 'hpProcessSourceAuto',
  ko: 'hpProcessSourceKo',
  scan: 'hpProcessSourceScan',
} as const
const PAGE = 2097152
const pagesOf = (row: ProcessEntry) =>
  row.pages != null ? Number(row.pages) : row.bytes != null ? Number(row.bytes) / PAGE : 0
const size = (mib: number) =>
  mib >= 1024
    ? `${n(mib / 1024, { maximumFractionDigits: 2 })} GiB`
    : `${n(mib, { maximumFractionDigits: 0 })} MiB`
// Rows sorted by PID; owners holding pages get the bar's colour for their rank.
const byPid = computed(() => [...(model.status.value?.entries ?? [])].sort((a, b) => a.pid - b.pid))
const holders = computed(() => byPid.value.filter((row) => pagesOf(row) > 0))
// Holders first (colour rank stays by PID, as on the main page), then the rest.
const rows = computed(() => [...holders.value, ...byPid.value.filter((row) => pagesOf(row) <= 0)])
const hues = computed(
  () => new Map(holders.value.map((row, rank) => [row.pid, ownerHue(rank)] as const)),
)
const owners = computed(() =>
  model.status.value
    ? holders.value.map((row) => ({
        key: String(row.pid),
        label: row.vm?.name || row.name || `pid ${row.pid}`,
        pages: pagesOf(row),
      }))
    : null,
)
const identityLabels = {
  verified: '',
  unverified: 'hpProcessUnverified',
  exited: 'hpProcessExited',
  changed: 'hpProcessChanged',
  unreadable: 'hpProcessUnreadable',
} as const
function detail(row: ProcessEntry) {
  return [
    `PID ${row.pid}`,
    row.state,
    row.vm ? row.name : null,
    identityLabels[row.identityStatus] ? t(identityLabels[row.identityStatus]) : null,
    row.source === 'ko' && !row.attributionVerified ? t('hpProcessKoUnverified') : null,
    row.reason ? t('hpProcessRowIncomplete') : null,
  ]
    .filter(Boolean)
    .join(' · ')
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
  pool.activate()
})
onBeforeUnmount(() => {
  model.deactivate()
  pool.deactivate()
  pool.cancelReview()
})
</script>

<template>
  <div class="hugepage-processes-page" data-testid="hugepage-processes-page">
    <AppBackLink to="/hugepages">{{ t('hugepagesTitle') }}</AppBackLink>
    <header>
      <h1>{{ t('hpProcessTitle') }}</h1>
      <AppButton
        v-if="model.supported.value"
        tone="icon"
        data-testid="hugepage-process-refresh"
        :aria-label="t('hugepagesRefresh')"
        :title="t('hugepagesRefresh')"
        @click="model.refresh"
        ><AppIcon name="refresh"
      /></AppButton>
      <AppMenu
        v-if="model.supported.value"
        :label="t('moreActions')"
        data-testid="hugepage-process-menu"
      >
        <button
          v-for="source in sources"
          :key="source"
          type="button"
          role="menuitemradio"
          :aria-checked="model.source.value === source"
          :data-testid="`hugepage-process-source-${source}`"
          @click="model.chooseSource(source)"
        >
          <span class="mark"><AppIcon v-if="model.source.value === source" name="check" /></span
          >{{ t(sourceLabels[source]) }}
        </button>
        <button
          v-if="pool.management.value"
          type="button"
          role="menuitem"
          data-testid="hugepage-process-reconcile"
          :disabled="
            model.pending.value ||
            pool.pending.value ||
            pool.status.value?.features?.reconcile !== true
          "
          @click="prepareReconcile"
        >
          <span class="mark"><AppIcon name="refresh" /></span>{{ t('hugepagesReconcile') }}
        </button>
      </AppMenu>
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
      <p v-if="model.loading.value && !model.status.value" role="status">{{ t('loading') }}</p>
      <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
        ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p
        v-if="model.status.value && !model.fresh.value"
        data-testid="hugepage-process-stale"
        class="note"
        role="status"
      >
        {{ t('hpProcessStale') }}
      </p>
      <div v-if="pool.pending.value" class="pending" role="status">
        <p class="note">{{ t('hpProcessPoolPending') }}</p>
        <AppButton
          data-testid="hugepage-process-query-pool"
          :disabled="pool.checking.value"
          @click="pool.reconcile"
          >{{ t('queryStatus') }}</AppButton
        ><AppLinkButton to="/hugepages">{{ t('hugepagesTitle') }}</AppLinkButton>
      </div>
      <HugepageUsageBar v-if="pool.status.value" :status="pool.status.value" :owners="owners" />
      <section
        v-if="model.status.value"
        class="observation"
        data-testid="hugepage-process-observation"
      >
        <span class="source">{{ t(sourceLabels[model.status.value.source]) }}</span>
        <p v-if="model.status.value.fallbackReason" class="note" role="status">
          {{ t('hpProcessFallback') }}
        </p>
        <p v-if="!model.status.value.available" class="note" role="status">
          {{ t('hpProcessUnavailable') }}
        </p>
        <p
          v-else-if="model.status.value.partial"
          class="note"
          role="status"
          data-testid="hugepage-process-partial"
        >
          {{ t('hpProcessPartial') }}
        </p>
      </section>
      <section v-if="rows.length" class="card out process-list" data-testid="hugepage-process-list">
        <article
          v-for="(row, index) in rows"
          :key="`${row.source}:${row.pid}:${row.startTicks ?? 'unknown'}:${index}`"
          class="process"
          :data-testid="`hugepage-process-${row.pid}`"
        >
          <span
            class="swatch"
            :class="{ none: !hues.has(row.pid) }"
            :style="hues.has(row.pid) ? { '--hue': hues.get(row.pid) } : {}"
            ><AppIcon :name="row.vm ? 'vm' : 'memory'"
          /></span>
          <div class="body">
            <RouterLink v-if="row.vm" :to="`/vms/${encodeURIComponent(row.vm.id)}`" class="name">{{
              row.vm.name || row.vm.id
            }}</RouterLink>
            <strong v-else class="name">{{ row.name || t('hpProcessUnnamed') }}</strong>
            <span class="detail">{{ detail(row) }}</span>
            <span v-if="row.state === 'D'" class="detail warn">{{ t('hpProcessDStateHint') }}</span>
          </div>
          <span class="amount" :data-testid="`hugepage-process-usage-${row.pid}`">{{
            row.pages == null && row.bytes == null ? '—' : size(pagesOf(row) * 2)
          }}</span>
          <span class="actions">
            <AppButton
              v-if="row.state === 'D'"
              tone="icon"
              :data-testid="`hugepage-process-stack-${row.pid}`"
              :aria-label="t('hpProcessStack')"
              :title="t('hpProcessStack')"
              :disabled="!model.canStack(row)"
              @click="model.openStack(row)"
              ><AppIcon name="layers"
            /></AppButton>
            <AppButton
              tone="icon"
              :data-testid="`hugepage-process-term-${row.pid}`"
              :aria-label="t('hpProcessTerm')"
              :title="t('hpProcessTerm')"
              :disabled="!model.canSignal(row)"
              @click="model.prepare(row, 'term')"
              ><AppIcon name="stop"
            /></AppButton>
            <AppButton
              tone="icon"
              class="danger"
              :data-testid="`hugepage-process-kill-${row.pid}`"
              :aria-label="t('hpProcessKill')"
              :title="t('hpProcessKill')"
              :disabled="!model.canSignal(row)"
              @click="model.prepare(row, 'kill')"
              ><AppIcon name="close"
            /></AppButton>
          </span>
        </article>
      </section>
      <p v-else-if="model.status.value?.available" class="empty" role="status">
        {{ t(model.status.value.partial ? 'hpProcessEmptyPartial' : 'hpProcessEmpty') }}
      </p>
    </template>
    <section
      v-if="model.entry.value"
      class="receipt"
      data-testid="hugepage-process-receipt"
      aria-live="polite"
    >
      <h2>{{ t('hpProcessReceipt') }}</h2>
      <p v-if="model.entry.value.task">{{ t(taskStateKeys[model.entry.value.task.state]) }}</p>
      <p v-if="model.entry.value.state === 'unknown' || model.unresolved.value">
        {{ t('hpProcessUnknown') }}
      </p>
      <p v-if="model.entry.value.problem">{{ t(model.entry.value.problem.titleKey) }}</p>
      <p v-if="model.receipt.value">
        {{ t(model.receipt.value.sent ? 'hpProcessSignalSent' : 'hpProcessSignalNotSent') }}
      </p>
      <p v-if="model.receipt.value?.exited === true">{{ t('hpProcessConfirmedExited') }}</p>
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
        <p>
          {{ t(model.review.value.signal === 'kill' ? 'hpProcessKillRisk' : 'hpProcessTermRisk') }}
        </p>
        <AppCheckbox
          v-model="model.confirmSignal.value"
          class="signal-confirm"
          data-testid="hugepage-process-confirm-check"
          >{{ t('hpProcessSignalAcknowledgment') }}</AppCheckbox
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
  min-width: 0;
  max-width: var(--app-content-width);
}
.hugepage-processes-page > a {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
}
header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
header > .btn {
  margin-inline-start: auto;
}
h1,
h2 {
  margin: 0;
  overflow-wrap: anywhere;
}
h2 {
  font-size: var(--md-sys-typescale-title-medium-size);
}
p {
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.mark {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-inline-end: 12px;
  vertical-align: middle;
}
.mark > .icon {
  width: 20px;
  height: 20px;
}
.note {
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 13px;
  line-height: 18px;
}
.pending {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.pending .note {
  flex-basis: 100%;
}
.observation {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.source {
  color: var(--md-sys-color-primary);
  font-size: 14px;
  font-weight: 500;
}
.process {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto auto;
  align-items: center;
  column-gap: 12px;
  min-height: 64px;
  padding: 8px 4px 8px 16px;
}
.process + .process {
  border-top: 1px solid var(--md-sys-color-outline-variant);
}
.swatch {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: hsl(var(--hue) 62% 42%);
  color: #fff;
}
:root[data-color='dark'] .swatch:not(.none) {
  background: hsl(var(--hue) 55% 72%);
  color: #1b1b1f;
}
.swatch.none {
  background: var(--md-sys-color-surface-container-highest);
  color: var(--md-sys-color-on-surface-variant);
}
.swatch > .icon {
  width: 22px;
  height: 22px;
}
.body {
  display: grid;
  min-width: 0;
}
.name {
  overflow: hidden;
  color: var(--md-sys-color-on-surface);
  font-size: 16px;
  font-weight: 400;
  line-height: 24px;
  text-decoration: none;
  white-space: nowrap;
  text-overflow: ellipsis;
}
a.name:hover {
  text-decoration: underline;
}
.detail {
  color: var(--md-sys-color-on-surface-variant);
  font-size: 13px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.detail.warn {
  color: var(--app-color-warning);
}
.amount {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.actions {
  display: inline-flex;
}
.actions .danger {
  --md-icon-button-icon-color: var(--md-sys-color-error);
  --md-icon-button-hover-icon-color: var(--md-sys-color-error);
  color: var(--md-sys-color-error);
}
.empty {
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
}
.receipt {
  padding: var(--space-4);
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--app-color-card);
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.signal-confirm {
  line-height: 1.5;
  margin-block: var(--space-3);
}
.stack-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 50vh;
  overflow: auto;
  padding: var(--space-3);
  background: var(--app-color-raised);
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: var(--md-sys-typescale-body-medium-size);
}
@media (width < 480px) {
  .process {
    grid-template-columns: 40px minmax(0, 1fr) auto;
  }
  .actions {
    grid-column: 2 / -1;
    justify-self: end;
    margin-top: -4px;
  }
}
</style>
