<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHostPreferences, preferenceKeys } from '../modules/hostPreferences'
import { taskStateKeys } from '../modules/tasks'
import AppButton from '../shared/ui/AppButton.vue'
import AppNotice from '../shared/ui/AppNotice.vue'
import AppDialog from '../shared/ui/AppDialog.vue'
import AppSwitch from '../shared/ui/AppSwitch.vue'
import OperationTrackingNotice from '../shared/ui/OperationTrackingNotice.vue'
const model = useHostPreferences(),
  { t } = useI18n()
const labels = {
  vm_hugepage_auto_reserve: 'hostPreferencesHugepages',
  optimize_sdcard: 'hostPreferencesSdcard',
  vm_clear_logs_before_start: 'hostPreferencesLogs',
} as const
onMounted(model.activate)
onBeforeUnmount(model.deactivate)
</script>
<template>
  <div class="host-preferences-page" data-testid="host-preferences-page">
    <AppBackLink to="/more">{{ t('navMore') }}</AppBackLink>
    <h1>{{ t('hostPreferencesTitle') }}</h1>
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
    <AppNotice
      v-if="!model.supported.value"
      tone="warning"
      :title="t('settingsCapabilityUnavailable')"
    />
    <template v-else>
      <div class="actions">
        <AppButton
          data-testid="host-preferences-refresh"
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
        />
        <section class="menu" :aria-label="t('settingsCategoryVm')">
          <AppSwitch
            v-for="key in preferenceKeys"
            :key="key"
            v-model="model.draft[key]"
            class="menu-row"
            :data-testid="`host-preference-${key}`"
            :disabled="!model.editable.value"
            @change="model.cancelReview"
          >
            <span class="grow"
              ><strong>{{ t(labels[key]) }}</strong></span
            >
          </AppSwitch>
        </section>
        <AppNotice
          v-if="model.conflict.value"
          tone="warning"
          :title="t('hostPreferencesConflict')"
          data-testid="host-preferences-conflict"
        >
          <AppButton
            data-testid="host-preferences-rebase"
            :disabled="!model.editable.value"
            @click="model.rebase"
            >{{ t('hostPreferencesRebase') }}</AppButton
          >
        </AppNotice>
        <div class="actions">
          <AppButton
            data-testid="host-preferences-review"
            tone="primary"
            :disabled="!model.canSave.value"
            @click="model.prepare"
            >{{ t('hostPreferencesReview') }}</AppButton
          >
          <AppButton :disabled="!model.dirty.value || model.pending.value" @click="model.discard">{{
            t('hostPreferencesDiscard')
          }}</AppButton>
        </div>
      </template>
      <section
        v-if="model.entry.value"
        class="receipt"
        aria-live="polite"
        data-testid="host-preferences-receipt"
      >
        <p v-if="model.entry.value.state === 'unknown'">{{ t('hostPreferencesUnknown') }}</p>
        <p v-else-if="model.entry.value.task">
          {{ t(taskStateKeys[model.entry.value.task.state]) }}
        </p>
        <p v-else>{{ t('processing') }}</p>
        <p v-if="model.entry.value.problem">{{ t(model.entry.value.problem.descriptionKey) }}</p>
        <p v-if="model.entry.value.task?.errorCode">{{ model.entry.value.task.errorCode }}</p>
        <p v-if="model.receipt.value?.saved && !model.receipt.value.uncertain">
          {{ t('hostPreferencesSaved') }}
        </p>
        <AppButton
          v-if="model.pending.value"
          data-testid="host-preferences-query"
          :disabled="model.checking.value || model.entry.value.state === 'posting'"
          @click="model.reconcile"
          >{{ t('queryStatus') }}</AppButton
        >
      </section>
    </template>
    <AppDialog
      :open="!!model.review.value"
      :title="t('hostPreferencesReview')"
      @close="model.cancelReview"
    >
      <ul v-if="model.review.value">
        <template v-for="key in preferenceKeys" :key="key"
          ><li v-if="model.review.value.changes[key] !== undefined">
            {{ t(labels[key]) }}:
            {{ t(model.review.value.changes[key] ? 'hostPreferencesOn' : 'hostPreferencesOff') }}
          </li></template
        >
      </ul>
      <div class="actions">
        <AppButton @click="model.cancelReview">{{ t('cancel') }}</AppButton
        ><AppButton
          data-testid="host-preferences-confirm"
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
.host-preferences-page {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  max-width: var(--app-content-width);
}
h1 {
  margin: 0;
}
p {
  margin-block: var(--space-2);
  overflow-wrap: anywhere;
}
.menu {
  margin: 0;
}
.menu-row {
  gap: var(--space-4);
  align-items: flex-start;
}
.grow {
  min-width: 0;
  overflow-wrap: anywhere;
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
  overflow-wrap: anywhere;
}
</style>
