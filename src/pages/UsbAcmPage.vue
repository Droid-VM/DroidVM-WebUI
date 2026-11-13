<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsbAcm } from '../modules/usbAcm'
import { taskStateKeys } from '../modules/tasks'
import AppButton from '../shared/ui/AppButton.vue'
import AppNotice from '../shared/ui/AppNotice.vue'
import AppDialog from '../shared/ui/AppDialog.vue'
import AppCheckbox from '../shared/ui/AppCheckbox.vue'
import AppOption from '../shared/ui/AppOption.vue'
import AppSelect from '../shared/ui/AppSelect.vue'
import AppSwitch from '../shared/ui/AppSwitch.vue'
import OperationTrackingNotice from '../shared/ui/OperationTrackingNotice.vue'
const model = useUsbAcm(),
  { t } = useI18n()
const reasonKeys: Record<string, string> = {
  'application-outcome-unknown': 'usbAcmUncertain',
  'persistence-outcome-unknown': 'usbAcmUncertain',
  'application-failed': 'usbAcmApplyFailureReason',
  'gadget-unavailable': 'usbAcmUnavailableReason',
  'observation-unavailable': 'usbAcmUnavailableReason',
  'pool-size-mismatch': 'usbAcmMismatchReason',
  'missing-link': 'usbAcmMismatchReason',
  'unsafe-function': 'usbAcmIdentityReason',
  'unsafe-link': 'usbAcmIdentityReason',
  'invalid-port': 'usbAcmIdentityReason',
  'udc-unbound': 'usbAcmControllerReason',
  'tty-unavailable': 'usbAcmPortReason',
}
onMounted(model.activate)
onBeforeUnmount(model.deactivate)
</script>
<template>
  <div class="usb-acm-page" data-testid="usb-acm-page">
    <AppBackLink to="/more">{{ t('navMore') }}</AppBackLink>
    <header>
      <h1>{{ t('usbAcmTitle') }}</h1>
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
      <div class="actions">
        <AppButton
          data-testid="usb-acm-refresh"
          :disabled="model.loading.value"
          @click="model.refresh"
          >{{ t('hugepagesRefresh') }}</AppButton
        >
      </div>
      <p v-if="model.loading.value" role="status">{{ t('loading') }}</p>
      <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
        ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p v-if="model.status.value && !model.fresh.value" role="status" data-testid="usb-acm-stale">
        {{ t('usbAcmStale') }}
      </p>
      <template v-if="model.status.value">
        <section class="observation" data-testid="usb-acm-observation">
          <h2>{{ t('usbAcmSavedTitle') }}</h2>
          <p>
            {{ t(model.status.value.desired.enabled ? 'usbAcmEnabled' : 'usbAcmDisabled') }} ·
            {{ t('usbAcmPortCount', { count: model.status.value.desired.ports }) }}
          </p>
          <p v-if="!model.status.value.initialized">{{ t('usbAcmDefaults') }}</p>
          <h2>{{ t('usbAcmLiveTitle') }}</h2>
          <p data-testid="usb-acm-live-state">
            {{ t(model.status.value.live.applied ? 'usbAcmApplied' : 'usbAcmNotApplied') }}
          </p>
          <dl>
            <div>
              <dt>{{ t('usbAcmAvailable') }}</dt>
              <dd>{{ t(model.status.value.live.available ? 'usbAcmYes' : 'usbAcmNo') }}</dd>
            </div>
            <div>
              <dt>{{ t('usbAcmUdc') }}</dt>
              <dd>
                {{
                  model.status.value.live.udcBound === null
                    ? t('notAvailable')
                    : t(model.status.value.live.udcBound ? 'usbAcmYes' : 'usbAcmNo')
                }}
              </dd>
            </div>
            <div>
              <dt>{{ t('usbAcmLivePorts') }}</dt>
              <dd>{{ model.status.value.live.ports ?? t('notAvailable') }}</dd>
            </div>
          </dl>
          <p
            v-if="model.status.value.live.reason && model.status.value.initialized"
            data-testid="usb-acm-reason"
          >
            {{ t(reasonKeys[model.status.value.live.reason] ?? 'usbAcmNotApplied') }}
          </p>
          <h2>{{ t('usbAcmOwners') }}</h2>
          <ul v-if="model.occupied.value" data-testid="usb-acm-owners">
            <li
              v-for="owner in model.status.value.live.owners"
              :key="`${owner.slot}:${owner.vmId}`"
            >
              {{ t('usbAcmOwner', { port: owner.slot + 1, vm: owner.vmId }) }}
            </li>
          </ul>
          <p v-else>{{ t('usbAcmNoOwners') }}</p>
        </section>
        <AppNotice v-if="model.occupied.value" tone="warning" :title="t('usbAcmOccupied')" />
        <AppNotice
          v-if="model.status.value.persistenceUncertain || model.unresolved.value"
          tone="warning"
          :title="t('usbAcmUncertain')"
          data-testid="usb-acm-uncertain"
        />
        <section class="menu" :aria-label="t('usbAcmEditTitle')">
          <AppSwitch
            v-model="model.draft.enabled"
            class="menu-row"
            data-testid="usb-acm-enabled"
            :disabled="!model.editable.value"
            @change="model.cancelReview"
            ><span class="grow"
              ><strong>{{ t('usbAcmEnable') }}</strong></span
            ></AppSwitch
          >
          <div class="menu-row">
            <span class="grow"
              ><strong>{{ t('usbAcmPorts') }}</strong></span
            ><AppSelect
              v-model.number="model.draft.ports"
              class="row-select"
              :aria-label="t('usbAcmPorts')"
              data-testid="usb-acm-ports"
              :disabled="!model.editable.value"
              @change="model.cancelReview"
            >
              <AppOption v-for="count in 6" :key="count" :value="count">{{ count }}</AppOption>
            </AppSelect>
          </div>
        </section>
        <AppNotice
          v-if="model.conflict.value"
          tone="warning"
          :title="t('usbAcmConflict')"
          data-testid="usb-acm-conflict"
          ><p>{{ t('usbAcmConflictHint') }}</p>
          <AppButton
            data-testid="usb-acm-rebase"
            :disabled="!model.editable.value"
            @click="model.rebase"
            >{{ t('usbAcmRebase') }}</AppButton
          ></AppNotice
        >
        <div class="actions">
          <AppButton
            data-testid="usb-acm-review"
            tone="primary"
            :disabled="!model.canConfigure.value"
            @click="model.prepare('configure')"
            >{{ t('usbAcmSaveApply') }}</AppButton
          >
          <AppButton
            data-testid="usb-acm-discard"
            :disabled="!model.dirty.value || model.pending.value"
            @click="model.discard"
            >{{ t('hostPreferencesDiscard') }}</AppButton
          >
          <AppButton
            v-if="model.status.value.initialized && !model.status.value.live.applied"
            data-testid="usb-acm-apply"
            :disabled="!model.canApply.value"
            @click="model.prepare('apply')"
            >{{ t('usbAcmApplySaved') }}</AppButton
          >
        </div>
        <p>{{ t('usbAcmDisconnectHint') }}</p>
      </template>
    </template>
    <section
      v-if="model.entry.value"
      class="receipt"
      aria-live="polite"
      data-testid="usb-acm-receipt"
    >
      <p v-if="model.entry.value.state === 'unknown'">{{ t('usbAcmUnknown') }}</p>
      <p v-else-if="model.entry.value.task">
        {{ t(taskStateKeys[model.entry.value.task.state]) }}
      </p>
      <p v-else>{{ t('processing') }}</p>
      <p v-if="model.entry.value.problem">{{ t(model.entry.value.problem.descriptionKey) }}</p>
      <p v-if="model.entry.value.task?.errorCode">{{ model.entry.value.task.errorCode }}</p>
      <template v-if="model.receipt.value"
        ><p v-if="model.receipt.value.saved">{{ t('usbAcmSaved') }}</p>
        <p v-if="model.receipt.value.applied">{{ t('usbAcmOperationApplied') }}</p>
        <p
          v-if="
            model.receipt.value.saved &&
            !model.receipt.value.applied &&
            !model.receipt.value.uncertain
          "
        >
          {{ t('usbAcmSavedNotApplied') }}
        </p></template
      >
      <AppButton
        v-if="model.pending.value"
        data-testid="usb-acm-query"
        :disabled="model.checking.value || model.entry.value.state === 'posting'"
        @click="model.reconcile"
        >{{ t('queryStatus') }}</AppButton
      >
    </section>
    <AppDialog
      :open="!!model.review.value"
      :title="
        t(model.review.value?.operation.kind === 'apply' ? 'usbAcmApplySaved' : 'usbAcmSaveApply')
      "
      @close="model.cancelReview"
    >
      <template v-if="model.review.value">
        <p
          v-if="model.review.value.operation.kind === 'configure'"
          data-testid="usb-acm-review-target"
        >
          {{ t(model.review.value.operation.enabled ? 'usbAcmEnabled' : 'usbAcmDisabled') }} ·
          {{ t('usbAcmPortCount', { count: model.review.value.operation.ports }) }}
        </p>
        <p>{{ t('usbAcmDisconnectHint') }}</p>
        <AppCheckbox
          v-model="model.confirmDisconnect.value"
          class="confirm-disconnect"
          data-testid="usb-acm-confirm-disconnect"
          >{{ t('usbAcmConfirmDisconnect') }}</AppCheckbox
        >
        <div class="actions">
          <AppButton @click="model.cancelReview">{{ t('cancel') }}</AppButton
          ><AppButton
            data-testid="usb-acm-confirm"
            tone="primary"
            :disabled="
              !model.confirmDisconnect.value ||
              !(model.review.value.operation.kind === 'configure'
                ? model.canConfigure.value
                : model.canApply.value)
            "
            @click="model.submit"
            >{{ t('confirm') }}</AppButton
          >
        </div>
      </template>
    </AppDialog>
  </div>
</template>
<style scoped>
.tracking-guard {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.usb-acm-page {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  max-width: var(--app-content-width);
}
header h1 {
  margin-block: 0 var(--space-2);
}
p,
li,
dd {
  overflow-wrap: anywhere;
}
p {
  margin-block: var(--space-2);
}
h2 {
  font-size: var(--md-sys-typescale-title-medium-size);
}
.menu {
  margin: 0;
}
.menu-row {
  gap: var(--space-4);
  align-items: center;
}
.grow {
  min-width: 0;
  overflow-wrap: anywhere;
}
.row-select {
  width: 120px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.observation,
.receipt {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  padding: var(--space-4);
  min-width: 0;
}
dl {
  display: grid;
  gap: var(--space-2);
}
dl > div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}
dd {
  margin: 0;
  text-align: end;
}
.confirm-disconnect {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-block: var(--space-4);
}
</style>
