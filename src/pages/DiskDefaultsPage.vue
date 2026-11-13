<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDiskDefaults } from '../modules/diskDefaults'
import { CpuCorePicker } from '../modules/resources'
import { taskStateKeys } from '../modules/tasks'
import { compactCpuSet } from '../shared/lib/cpuSet'
import AppButton from '../shared/ui/AppButton.vue'
import AppNotice from '../shared/ui/AppNotice.vue'
import AppDialog from '../shared/ui/AppDialog.vue'
import AppOption from '../shared/ui/AppOption.vue'
import AppSelect from '../shared/ui/AppSelect.vue'
import OperationTrackingNotice from '../shared/ui/OperationTrackingNotice.vue'
const model = useDiskDefaults(),
  { t } = useI18n()
const cpuLabel = (ids: readonly number[]) =>
  compactCpuSet(ids.map((id) => [id, id])) || t('diskDefaultsAllCpus')
onMounted(model.activate)
onBeforeUnmount(model.deactivate)
</script>
<template>
  <div class="disk-defaults-page" data-testid="disk-defaults-page">
    <AppBackLink to="/more">{{ t('navMore') }}</AppBackLink>
    <h1>{{ t('diskDefaultsTitle') }}</h1>
    <fieldset
      v-if="model.recoveryProblem.value"
      class="tracking-guard"
      :disabled="model.unresolved.value || model.status.value?.uncertain"
    >
      <OperationTrackingNotice
        :problem="model.recoveryProblem.value"
        @clear="model.clearTracking"
      />
    </fieldset>
    <section v-if="model.rememberRecoveryProblem.value" :aria-label="t('diskDefaultsCompression')">
      <h2>{{ t('diskDefaultsCompression') }}</h2>
      <fieldset
        class="tracking-guard"
        :disabled="model.rememberReceipt.value?.uncertain || model.status.value?.uncertain"
      >
        <OperationTrackingNotice
          :problem="model.rememberRecoveryProblem.value"
          @clear="model.clearRememberTracking"
        />
      </fieldset>
    </section>
    <AppNotice
      v-if="!model.supported.value"
      tone="warning"
      :title="t('settingsCapabilityUnavailable')"
    />
    <template v-else>
      <div class="actions">
        <AppButton
          data-testid="disk-defaults-refresh"
          :disabled="model.loading.value"
          @click="model.refresh"
          >{{ t('hugepagesRefresh') }}</AppButton
        >
      </div>
      <p v-if="model.loading.value" role="status">{{ t('loading') }}</p>
      <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
        ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p v-if="model.status.value && !model.fresh.value" role="status">
        {{ t('hostPreferencesStale') }}
      </p>
      <template v-if="model.status.value">
        <p v-if="!model.status.value.initialized">{{ t('hostPreferencesDefaults') }}</p>
        <AppNotice
          v-if="model.status.value.uncertain || model.unresolved.value"
          tone="warning"
          :title="t('hostPreferencesUncertain')"
          data-testid="disk-defaults-uncertain"
        />
        <section class="menu" :aria-label="t('settingsCategoryVm')">
          <div class="menu-row">
            <span class="grow"
              ><strong>{{ t('diskDefaultsCompression') }}</strong></span
            ><AppSelect
              v-model="model.draft.optimizeCompression"
              class="row-select"
              :aria-label="t('diskDefaultsCompression')"
              data-testid="disk-defaults-compression"
              :disabled="!model.editable.value"
              @change="model.cancelReview"
            >
              <AppOption value="ask">{{ t('diskDefaultsAsk') }}</AppOption>
              <AppOption value="none">{{ t('diskNoCompression') }}</AppOption>
            </AppSelect>
          </div>
          <div class="cpu-setting">
            <strong>{{ t('diskDefaultsCpus') }}</strong>
            <p data-testid="disk-defaults-cpu-value">{{ cpuLabel(model.draft.qemuImgCpus) }}</p>
            <CpuCorePicker
              data-testid="disk-defaults-cpu-picker"
              :current="model.cpuText.value"
              :title="t('diskPickCpu')"
              :disabled="!model.editable.value"
              @select="model.chooseCpus"
            />
          </div>
        </section>
        <AppNotice
          v-if="model.conflict.value"
          tone="warning"
          :title="t('diskDefaultsConflict')"
          data-testid="disk-defaults-conflict"
          ><AppButton
            data-testid="disk-defaults-rebase"
            :disabled="!model.editable.value"
            @click="model.rebase"
            >{{ t('hostPreferencesRebase') }}</AppButton
          ></AppNotice
        >
        <div class="actions">
          <AppButton
            data-testid="disk-defaults-review"
            tone="primary"
            :disabled="!model.canSave.value"
            @click="model.prepare"
            >{{ t('hostPreferencesReview') }}</AppButton
          ><AppButton
            data-testid="disk-defaults-discard"
            :disabled="!model.dirty.value || model.pending.value"
            @click="model.discard"
            >{{ t('hostPreferencesDiscard') }}</AppButton
          >
        </div>
      </template>
      <section
        v-if="model.entry.value"
        class="receipt"
        aria-live="polite"
        data-testid="disk-defaults-receipt"
      >
        <p v-if="model.entry.value.state === 'unknown'">{{ t('hostPreferencesUnknown') }}</p>
        <p v-else-if="model.entry.value.task">
          {{ t(taskStateKeys[model.entry.value.task.state]) }}
        </p>
        <p v-else>{{ t('processing') }}</p>
        <p v-if="model.entry.value.problem">{{ t(model.entry.value.problem.descriptionKey) }}</p>
        <p v-if="model.entry.value.task?.errorCode">{{ model.entry.value.task.errorCode }}</p>
        <p v-if="model.receipt.value?.saved && !model.receipt.value.uncertain">
          {{ t('diskDefaultsSaved') }}
        </p>
        <AppButton
          v-if="model.pending.value"
          data-testid="disk-defaults-query"
          :disabled="model.checking.value || model.entry.value.state === 'posting'"
          @click="model.reconcile"
          >{{ t('queryStatus') }}</AppButton
        >
      </section>
    </template>
    <section
      v-if="model.rememberEntry.value"
      class="receipt"
      aria-live="polite"
      data-testid="disk-defaults-remember-receipt"
    >
      <h2>{{ t('diskDefaultsCompression') }}</h2>
      <p
        v-if="
          model.rememberEntry.value.state === 'unknown' || model.rememberReceipt.value?.uncertain
        "
      >
        {{ t('diskOptimizePreferenceUnknown') }}
      </p>
      <p v-else-if="model.rememberEntry.value.task">
        {{ t(taskStateKeys[model.rememberEntry.value.task.state]) }}
      </p>
      <p v-else>{{ t('diskOptimizePreferenceWaiting') }}</p>
      <p v-if="model.rememberEntry.value.problem">
        {{ t(model.rememberEntry.value.problem.descriptionKey) }}
      </p>
      <p v-if="model.rememberEntry.value.task?.errorCode">
        {{ model.rememberEntry.value.task.errorCode }}
      </p>
      <AppButton
        v-if="model.rememberPending.value"
        data-testid="disk-defaults-remember-query"
        :disabled="model.rememberChecking.value || model.rememberEntry.value.state === 'posting'"
        @click="model.reconcileRemember"
        >{{ t('diskOptimizeQueryPreference') }}</AppButton
      >
    </section>
    <AppDialog
      :open="!!model.review.value"
      :title="t('hostPreferencesReview')"
      @close="model.cancelReview"
    >
      <ul v-if="model.review.value">
        <li v-if="model.review.value.changes.optimizeCompression !== undefined">
          {{ t('diskDefaultsCompression') }}:
          {{
            t(
              model.review.value.changes.optimizeCompression === 'ask'
                ? 'diskDefaultsAsk'
                : 'diskNoCompression',
            )
          }}
        </li>
        <li v-if="model.review.value.changes.qemuImgCpus !== undefined">
          {{ t('diskDefaultsCpus') }}: {{ cpuLabel(model.review.value.changes.qemuImgCpus) }}
        </li>
      </ul>
      <div class="actions">
        <AppButton @click="model.cancelReview">{{ t('cancel') }}</AppButton
        ><AppButton
          data-testid="disk-defaults-confirm"
          tone="primary"
          :disabled="!model.canSave.value"
          @click="model.submit"
          >{{ t('confirm') }}</AppButton
        >
      </div>
    </AppDialog>
  </div>
</template>
<style scoped>
.tracking-guard {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.disk-defaults-page {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  max-width: var(--app-content-width);
}
h1 {
  margin: 0;
}
p,
li {
  overflow-wrap: anywhere;
}
p {
  margin-block: var(--space-2);
}
.menu {
  margin: 0;
}
.menu-row {
  gap: var(--space-3);
  align-items: flex-start;
  flex-wrap: wrap;
}
.grow {
  min-width: 0;
  overflow-wrap: anywhere;
}
.row-select {
  width: 200px;
  max-width: 100%;
}
.cpu-setting {
  padding: var(--space-4);
  min-width: 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.receipt {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  padding: var(--space-4);
}
li {
  margin-block: var(--space-3);
}
</style>
