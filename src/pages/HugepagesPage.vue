<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  useHugepages,
  HugepageUsageBar,
  HugepageOperationLayer,
  type HugepageOwner,
} from '../modules/hugepages'
import { useHugepageProcesses } from '../modules/hugepage-processes'
import AppButton from '../shared/ui/AppButton.vue'
import AppIcon from '../shared/ui/AppIcon.vue'
import AppNotice from '../shared/ui/AppNotice.vue'
import AppSwitch from '../shared/ui/AppSwitch.vue'
import AppTextField from '../shared/ui/AppTextField.vue'
import OperationTrackingNotice from '../shared/ui/OperationTrackingNotice.vue'

// Mirrors the App's hugepage screen: targets with save and module toggle, the usage bar,
// acquire, switches and counters; the rest lives on the advanced page.
const model = useHugepages(),
  processes = useHugepageProcesses(),
  { t, n } = useI18n()
const status = computed(() => model.status.value)

// Targets are edited in GiB like the App and stored as 2 MiB pages.
const toGib = (pages: string) =>
  /^\d+$/.test(pages) ? String(Math.round((Number(pages) / 512) * 1000) / 1000) : pages
const toPages = (gib: string) =>
  gib.trim() === ''
    ? ''
    : /^\d+(\.\d+)?$/.test(gib.trim())
      ? String(Math.round(Number(gib.trim()) * 512))
      : gib
const poolText = ref(toGib(model.draft.pool))
const cmaText = ref(toGib(model.draft.cma))
watch(
  () => model.draft.pool,
  (pages) => {
    if (toPages(poolText.value) !== pages) poolText.value = toGib(pages)
  },
)
watch(
  () => model.draft.cma,
  (pages) => {
    if (toPages(cmaText.value) !== pages) cmaText.value = toGib(pages)
  },
)
function editPool(value: string) {
  poolText.value = value
  model.draft.pool = toPages(value)
}
function editCma(value: string) {
  cmaText.value = value
  model.draft.cma = toPages(value)
}
const targetsLocked = computed(
  () =>
    !model.editable.value ||
    status.value?.installed !== true ||
    status.value?.consumerPages == null,
)

// As the App: a loaded module whose pool target is 0 is soft-disabled, so offer Enable.
const moduleOn = computed(
  () =>
    status.value?.loaded === true &&
    !(status.value.hasPoolWant === true && Number(status.value.actualPoolPages ?? 0) <= 1),
)
const toggleModule = computed(() => ({ kind: 'runtime' as const, enabled: !moduleOn.value }))

const owners = computed<HugepageOwner[] | null>(() => {
  const entries = processes.status.value?.entries
  if (!processes.supported.value || !entries) return null
  return entries
    .filter((entry) => entry.pages != null && entry.pages !== '0')
    .sort((a, b) => a.pid - b.pid)
    .map((entry) => ({
      key: String(entry.pid),
      label: entry.vm?.name || entry.name || `pid ${entry.pid}`,
      pages: Number(entry.pages),
    }))
})

const gib = (pages: string | null | undefined) =>
  pages == null ? '' : `${n(Number(pages) / 512, { maximumFractionDigits: 2 })} GiB`
const cmaOn = computed(
  () => status.value?.hasCma === true && (status.value?.actualCmaPages ?? '0') !== '0',
)
const stateText = computed(() => {
  const value = status.value
  if (!value) return t('notAvailable')
  if (value.acquireActive) return t('hugepagesStateAcquiring', { mode: value.acquireMode ?? '—' })
  if (value.busy) return t('hugepagesStateBusy')
  if (value.loaded) return t('hugepagesStateLoaded')
  return t(value.installed === false ? 'hugepagesStateNotInstalled' : 'hugepagesStateNotLoaded')
})
// md-switch keeps its own toggled state; re-key the switches when a review closes, so a
// cancelled or refused change snaps back to the observed value.
const switchKey = ref(0)
watch(
  () => model.review.value,
  (review) => {
    if (!review) switchKey.value++
  },
)
function confirmSwitch(operation: Parameters<typeof model.prepare>[0]) {
  model.prepare(operation)
  if (!model.review.value) switchKey.value++
}
// Turning CMA on uses the "with CMA" size above (else the last one used) and the lever
// chosen in advanced settings, and saves it, as the App's switch does.
const cmaTarget = computed(() => {
  const draft = model.draft.cma
  if (/^\d+$/.test(draft) && draft !== '0') return draft
  return status.value?.cma?.savedLastPages ?? status.value?.savedCmaPages ?? ''
})
const cmaOperation = computed(() =>
  cmaOn.value
    ? { kind: 'cma' as const, enabled: false, pages: '0', persist: true, lever: null }
    : {
        kind: 'cma' as const,
        enabled: true,
        pages: cmaTarget.value,
        persist: true,
        lever: model.draft.lever === 'none' ? null : model.draft.lever,
      },
)

onMounted(() => {
  model.activate()
  if (processes.supported.value) processes.activate()
})
onBeforeUnmount(() => {
  model.deactivate()
  processes.deactivate()
})
</script>

<template>
  <div class="hugepages-page" data-testid="hugepages-page">
    <AppBackLink to="/more">{{ t('navMore') }}</AppBackLink>
    <header>
      <h1>{{ t('hugepagesTitle') }}</h1>
      <AppButton
        v-if="model.supported.value"
        tone="icon"
        data-testid="hugepages-refresh"
        :aria-label="t('hugepagesRefresh')"
        :title="t('hugepagesRefresh')"
        @click="model.refresh"
        ><AppIcon name="refresh"
      /></AppButton>
    </header>
    <fieldset
      v-if="model.recoveryProblem.value"
      class="plain"
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
      <p v-if="model.loading.value && !status" role="status">{{ t('loading') }}</p>
      <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
        ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p v-if="status && !model.fresh.value" role="status" data-testid="hugepages-stale">
        {{ t('hugepagesStale') }}
      </p>
      <AppNotice
        v-if="!model.management.value"
        tone="warning"
        :title="t('hugepagesManagementUnavailable')"
        data-testid="hugepages-management-unavailable"
      />
      <div v-if="status?.hasCrash" class="alert" role="alert">
        <AppIcon name="bug" /><strong>{{ t('hugepagesCrashWarning') }}</strong>
        <AppButton
          data-testid="hugepages-dismiss-crash"
          :disabled="!model.canPrepare({ kind: 'dismiss-crash' })"
          @click="model.prepare({ kind: 'dismiss-crash' })"
          >{{ t('hugepagesCrashDismiss') }}</AppButton
        >
      </div>
      <div v-if="status?.loaded === false" class="alert" role="status">
        <AppIcon name="layers" /><strong>{{ t('hugepagesNotLoaded') }}</strong>
      </div>

      <form class="targets" @submit.prevent="model.saveTargets">
        <fieldset class="plain" :disabled="targetsLocked">
          <div class="field-row">
            <AppIcon name="memory" />
            <AppTextField
              :model-value="poolText"
              :label="t('hugepagesPoolSizeGib')"
              suffix-text="GiB"
              inputmode="decimal"
              autocomplete="off"
              data-testid="hugepages-pool-target"
              @update:model-value="editPool"
            />
          </div>
          <div class="field-row">
            <AppIcon name="memory" />
            <AppTextField
              :model-value="cmaText"
              :label="t('hugepagesCmaSizeGib')"
              suffix-text="GiB"
              inputmode="decimal"
              autocomplete="off"
              data-testid="hugepages-cma-target"
              @update:model-value="editCma"
            />
          </div>
          <p v-if="model.draft.pool && !model.valid.value" class="invalid" role="alert">
            {{ t('hugepagesInvalidTarget') }}
          </p>
        </fieldset>
        <div class="pair">
          <button
            type="submit"
            class="btn tonal icon-lead"
            data-testid="hugepages-save"
            :disabled="targetsLocked || !model.valid.value"
          >
            <AppIcon name="save" />{{ t('hugepagesSave') }}
          </button>
          <button
            v-if="model.management.value"
            type="button"
            class="btn tonal icon-lead"
            :data-testid="moduleOn ? 'hugepages-runtime-disable' : 'hugepages-runtime-enable'"
            :disabled="!model.canPrepare(toggleModule)"
            @click="model.prepare(toggleModule)"
          >
            <AppIcon :name="moduleOn ? 'stop' : 'play'" />{{
              t(moduleOn ? 'hugepagesModuleDisable' : 'hugepagesModuleEnable')
            }}
          </button>
        </div>
      </form>

      <HugepageUsageBar v-if="status" :status="status" :owners="owners" />

      <RouterLink
        v-if="processes.supported.value"
        to="/hugepages/processes"
        class="btn text icon-lead usage-link"
        data-testid="hugepages-processes-link"
        ><AppIcon name="activity" />{{ t('hugepagesShowUsage') }}</RouterLink
      >

      <section class="card out rows" :aria-label="t('hugepagesTitle')">
        <div class="row">
          <span class="lead"><AppIcon name="memory" /></span>
          <span class="rt"
            ><span class="a">{{ t('hugepagesAcquire') }}</span></span
          >
          <span v-if="status?.acquireActive" class="acquire">
            <span class="spinner" aria-hidden="true" />
            <AppButton
              data-testid="hugepages-stop"
              :disabled="!model.canPrepare({ kind: 'stop-acquire' })"
              @click="model.prepare({ kind: 'stop-acquire' })"
              >{{ t('hugepagesStop') }}</AppButton
            >
          </span>
          <span v-else class="acquire">
            <button
              v-for="mode in [1, 2, 3] as const"
              :key="mode"
              type="button"
              class="btn tonal mode"
              :data-testid="`hugepages-acquire-${mode}`"
              :aria-label="t('hugepagesMode', { mode })"
              :title="t('hugepagesMode', { mode })"
              :disabled="!model.canPrepare({ kind: 'acquire', mode })"
              @click="model.prepare({ kind: 'acquire', mode })"
            >
              V{{ mode }}
            </button>
          </span>
        </div>
        <AppSwitch
          v-if="model.management.value && status?.hasCma === true"
          :key="`cma-${switchKey}`"
          class="row"
          data-testid="hugepages-cma-switch"
          :model-value="cmaOn"
          :disabled="!model.canPrepare(cmaOperation)"
          @update:model-value="confirmSwitch(cmaOperation)"
          ><span class="lead"><AppIcon name="layers" /></span
          ><span class="rt"
            ><span class="a">{{ t('hugepagesEnableCma') }}</span
            ><span v-if="cmaOn" class="b">{{ gib(status?.actualCmaPages) }}</span></span
          ></AppSwitch
        >
        <AppSwitch
          v-if="model.management.value"
          :key="`boot-${switchKey}`"
          class="row"
          data-testid="hugepages-boot-switch"
          :model-value="status?.bootEnabled === true"
          :disabled="!model.canPrepare({ kind: 'boot', enabled: status?.bootEnabled !== true })"
          @update:model-value="(enabled: boolean) => confirmSwitch({ kind: 'boot', enabled })"
          ><span class="lead"><AppIcon name="power" /></span
          ><span class="rt"
            ><span class="a">{{ t('hugepagesBootModule') }}</span></span
          ></AppSwitch
        >
        <div class="row">
          <span class="lead"><AppIcon name="info" /></span>
          <span class="rt"
            ><span class="a">{{ t('hugepagesState') }}</span></span
          >
          <span class="value" data-testid="hugepages-active">{{ stateText }}</span>
        </div>
        <div v-if="cmaOn" class="row">
          <span class="lead"><AppIcon name="share" /></span>
          <span class="rt"
            ><span class="a">{{ t('hugepagesCmaLent') }}</span></span
          >
          <span class="value" data-testid="hugepages-cma-lent">{{
            status?.cmaLentPages != null ? gib(status.cmaLentPages) : '—'
          }}</span>
        </div>
        <div class="row">
          <span class="lead"><AppIcon name="vm" /></span>
          <span class="rt"
            ><span class="a">{{ t('hugepagesActiveVms') }}</span></span
          >
          <span class="value">{{
            status?.consumerCount != null ? n(status.consumerCount) : '—'
          }}</span>
        </div>
        <RouterLink to="/hugepages/advanced" class="row" data-testid="hugepages-advanced-link">
          <span class="lead"><AppIcon name="settings" /></span>
          <span class="rt"
            ><span class="a">{{ t('hugepagesAdvancedTitle') }}</span></span
          >
          <span class="trail"><AppIcon name="chevron" /></span>
        </RouterLink>
      </section>
    </template>
    <HugepageOperationLayer />
  </div>
</template>

<style scoped>
.alert {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px 10px 14px;
  border-radius: 12px;
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
}
.alert > strong {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
}
.targets {
  display: grid;
  gap: 12px;
}
.targets fieldset {
  gap: 8px;
}
.field-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  color: var(--md-sys-color-on-surface-variant);
}
.field-row .app-text-field {
  width: 100%;
}
.invalid {
  margin: 0;
  color: var(--md-sys-color-error);
  font-size: 13px;
}
.pair {
  display: grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  gap: 8px;
}
.pair > .btn {
  width: 100%;
}
.usage-link {
  justify-self: stretch;
}
.rows .row {
  min-height: 56px;
}
.rows :deep(.app-switch-label) {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.rows .row + .row {
  border-top: 1px solid var(--md-sys-color-outline-variant);
}
.value {
  color: var(--md-sys-color-on-surface-variant);
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.acquire {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
:is(button).btn.mode {
  min-width: 48px;
  padding: 0 12px;
}
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--md-sys-color-primary);
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
