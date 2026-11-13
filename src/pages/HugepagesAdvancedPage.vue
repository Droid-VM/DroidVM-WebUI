<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  useHugepages,
  HugepageAdvancedPanel,
  HugepageMaintenancePanel,
  HugepageOperationLayer,
} from '../modules/hugepages'
import AppButton from '../shared/ui/AppButton.vue'
import AppIcon from '../shared/ui/AppIcon.vue'
import AppNotice from '../shared/ui/AppNotice.vue'
import AppOption from '../shared/ui/AppOption.vue'
import AppSelect from '../shared/ui/AppSelect.vue'
import OperationTrackingNotice from '../shared/ui/OperationTrackingNotice.vue'

// The App's advanced screen: module parameters, how CMA lends memory (used when the main
// page switches CMA on) and the rare maintenance actions. Nothing the main page shows.
const model = useHugepages(),
  { t } = useI18n()
const leverAllowed = (lever: 'flag' | 'hook') =>
  model.status.value?.cma?.vendorAllowed === true ||
  (lever === 'flag'
    ? model.status.value?.features?.restrict
    : model.status.value?.features?.gfpHook) === true
onMounted(model.activate)
onBeforeUnmount(model.deactivate)
</script>

<template>
  <div class="hugepages-page" data-testid="hugepages-page">
    <AppBackLink to="/hugepages">{{ t('hugepagesTitle') }}</AppBackLink>
    <header>
      <h1>{{ t('hugepagesAdvancedTitle') }}</h1>
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
      :disabled="model.unresolvedReceipt.value && !model.acknowledged.value"
    >
      <OperationTrackingNotice
        :problem="model.recoveryProblem.value"
        @clear="model.clearTracking"
      />
    </fieldset>
    <AppNotice
      v-if="!model.supported.value || !model.management.value"
      tone="warning"
      :title="
        t(
          model.supported.value
            ? 'hugepagesManagementUnavailable'
            : 'settingsCapabilityUnavailable',
        )
      "
    />
    <template v-else>
      <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
        ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p v-if="model.status.value && !model.fresh.value" role="status">
        {{ t('hugepagesStale') }}
      </p>
      <h2 class="group-title">{{ t('hugepagesGroupAdvanced') }}</h2>
      <HugepageAdvancedPanel />
      <h2 class="group-title">{{ t('hugepagesGroupCma') }}</h2>
      <section class="card out lever" data-testid="hugepages-group-cma">
        <AppSelect
          v-model="model.draft.lever"
          :label="t('hugepagesCmaLever')"
          data-testid="hugepages-cma-lever"
          :disabled="!model.editable.value || model.status.value?.hasCma !== true"
        >
          <AppOption value="none">{{ t('hugepagesLeverNone') }}</AppOption>
          <AppOption value="flag" :disabled="!leverAllowed('flag')">{{
            t('hugepagesLeverFlag')
          }}</AppOption>
          <AppOption value="hook" :disabled="!leverAllowed('hook')">{{
            t('hugepagesLeverHook')
          }}</AppOption>
        </AppSelect>
      </section>
      <h2 class="group-title">{{ t('hugepagesGroupMaintenance') }}</h2>
      <HugepageMaintenancePanel :model="model" />
    </template>
    <HugepageOperationLayer />
  </div>
</template>

<style scoped>
.group-title {
  margin: var(--space-2) 4px -8px;
  color: var(--md-sys-color-primary);
  font-size: 14px;
  font-weight: 500;
}
.card.out.lever {
  padding: 16px;
}
.lever .app-select {
  width: 100%;
}
</style>
