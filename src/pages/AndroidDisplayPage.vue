<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { autoRestoreChoices, useAndroidDisplay } from '../modules/androidDisplay'
import { taskStateKeys } from '../modules/tasks'
import AppButton from '../shared/ui/AppButton.vue'
import AppNotice from '../shared/ui/AppNotice.vue'
import AppDialog from '../shared/ui/AppDialog.vue'
import AppCheckbox from '../shared/ui/AppCheckbox.vue'
import AppOption from '../shared/ui/AppOption.vue'
import AppSelect from '../shared/ui/AppSelect.vue'
import AppSwitch from '../shared/ui/AppSwitch.vue'
import OperationTrackingNotice from '../shared/ui/OperationTrackingNotice.vue'
const model = useAndroidDisplay(),
  { t, locale } = useI18n()
const stateKeys = {
  android: 'androidDisplayStateAndroid',
  stopping: 'androidDisplayStateStopping',
  stopped: 'androidDisplayStateStopped',
  restoring: 'androidDisplayStateRestoring',
} as const
function clock(value: string | null) {
  return value === null
    ? t('notAvailable')
    : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'medium' }).format(
        new Date(Number(value)),
      )
}
onMounted(model.activate)
onBeforeUnmount(model.deactivate)
</script>
<template>
  <div class="android-display-page" data-testid="android-display-page">
    <AppBackLink to="/more">{{ t('navMore') }}</AppBackLink>
    <header>
      <h1>{{ t('androidDisplayTitle') }}</h1>
      <p>{{ t('androidDisplayScope') }}</p>
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
          data-testid="android-display-refresh"
          :disabled="model.loading.value"
          @click="model.refresh"
          >{{ t('hugepagesRefresh') }}</AppButton
        >
      </div>
      <p v-if="model.loading.value" role="status">{{ t('loading') }}</p>
      <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
        ><p>{{ t(model.problem.value.descriptionKey) }}</p>
        <p v-if="model.stopped.value || model.busy.value">{{ t('androidDisplayReconnecting') }}</p>
      </AppNotice>
      <p
        v-if="model.status.value && !model.fresh.value"
        role="status"
        data-testid="android-display-stale"
      >
        {{ t('androidDisplayStale') }}
      </p>
      <template v-if="model.status.value">
        <section class="observation" data-testid="android-display-observation">
          <h2>{{ t('androidDisplayStateTitle') }}</h2>
          <p data-testid="android-display-state">
            {{ t(stateKeys[model.status.value.state]) }}
            <template v-if="model.status.value.progress"
              >· {{ model.status.value.progress }}</template
            >
          </p>
          <dl>
            <div v-if="model.status.value.owner">
              <dt>{{ t('androidDisplayOwner') }}</dt>
              <dd>
                {{
                  model.status.value.owner.kind === 'vm'
                    ? t('androidDisplayOwnerVm', {
                        vm: model.status.value.owner.vmName ?? model.status.value.owner.vmId ?? '',
                      })
                    : t('androidDisplayOwnerManual')
                }}
              </dd>
            </div>
            <div v-if="model.status.value.sinceMs">
              <dt>{{ t('androidDisplaySince') }}</dt>
              <dd>{{ clock(model.status.value.sinceMs) }}</dd>
            </div>
            <div v-if="model.status.value.autoRestoreAtMs">
              <dt>{{ t('androidDisplayAutoRestoreAt') }}</dt>
              <dd>{{ clock(model.status.value.autoRestoreAtMs) }}</dd>
            </div>
            <div>
              <dt>{{ t('androidDisplayNetwork') }}</dt>
              <dd data-testid="android-display-network">
                {{
                  model.status.value.network
                    ? `${model.status.value.network.interface} · ${model.status.value.network.operstate ?? t('notAvailable')}`
                    : t('notAvailable')
                }}
              </dd>
            </div>
            <div>
              <dt>{{ t('androidDisplayPanel') }}</dt>
              <dd>
                {{
                  model.status.value.panelLit === null
                    ? t('notAvailable')
                    : t(
                        model.status.value.panelLit
                          ? 'androidDisplayPanelLit'
                          : 'androidDisplayPanelDark',
                      )
                }}
              </dd>
            </div>
            <div>
              <dt>{{ t('androidDisplayWatchdog') }}</dt>
              <dd>
                {{
                  model.status.value.watchdog.verified
                    ? t('androidDisplayWatchdogVerified')
                    : (model.status.value.watchdog.reason ?? t('androidDisplayWatchdogUnverified'))
                }}
              </dd>
            </div>
            <div>
              <dt>{{ t('androidDisplayServices') }}</dt>
              <dd>
                SurfaceFlinger
                {{ model.status.value.services.surfaceflinger || t('notAvailable') }} · composer
                {{ model.status.value.services.composer || t('notAvailable') }}
              </dd>
            </div>
          </dl>
          <p v-if="model.status.value.lastRestore" data-testid="android-display-last-restore">
            {{
              t(
                model.status.value.lastRestore.ok
                  ? 'androidDisplayLastRestoreOk'
                  : 'androidDisplayLastRestoreFailed',
                { time: clock(model.status.value.lastRestore.atMs) },
              )
            }}
            <template v-if="model.status.value.lastRestore.message"
              >· {{ model.status.value.lastRestore.message }}</template
            >
          </p>
        </section>
        <AppNotice
          v-if="model.vmOwned.value"
          tone="warning"
          :title="t('androidDisplayVmOwned')"
          data-testid="android-display-vm-owned"
        />
        <AppNotice
          v-if="!model.status.value.supported"
          tone="warning"
          :title="t('androidDisplayUnsupportedHost')"
        />
        <AppNotice
          v-else-if="
            !model.status.value.watchdog.verified && model.status.value.state === 'android'
          "
          tone="warning"
          :title="t('androidDisplayWatchdogUnverified')"
          ><p>{{ model.status.value.watchdog.reason }}</p></AppNotice
        >
        <section
          v-if="model.status.value.state === 'android'"
          class="menu"
          :aria-label="t('androidDisplayStopTitle')"
        >
          <div class="menu-row">
            <span class="grow"
              ><strong>{{ t('androidDisplayAutoRestore') }}</strong
              ><small>{{ t('androidDisplayAutoRestoreHint') }}</small></span
            ><AppSelect
              v-model.number="model.autoRestoreSeconds.value"
              class="row-select"
              :aria-label="t('androidDisplayAutoRestore')"
              data-testid="android-display-auto-restore"
              :disabled="!model.editable.value"
              @change="model.cancelReview"
            >
              <AppOption v-for="seconds in autoRestoreChoices" :key="seconds" :value="seconds">{{
                t('androidDisplayMinutes', { count: seconds / 60 })
              }}</AppOption>
            </AppSelect>
          </div>
          <AppSwitch
            v-model="model.restoreOnNetworkLoss.value"
            class="menu-row"
            data-testid="android-display-network-loss"
            :disabled="!model.editable.value"
            @change="model.cancelReview"
            ><span class="grow"
              ><strong>{{ t('androidDisplayNetworkLoss') }}</strong
              ><small>{{ t('androidDisplayNetworkLossHint') }}</small></span
            ></AppSwitch
          >
        </section>
        <div class="actions">
          <AppButton
            v-if="model.status.value.state === 'android'"
            data-testid="android-display-stop"
            tone="primary"
            :disabled="!model.canStop.value"
            @click="model.prepare('stop')"
            >{{ t('androidDisplayStop') }}</AppButton
          >
          <AppButton
            v-if="model.stopped.value"
            data-testid="android-display-restore"
            tone="primary"
            :disabled="!model.canRestore.value"
            @click="model.prepare('restore')"
            >{{ t('androidDisplayRestore') }}</AppButton
          >
        </div>
        <p v-if="model.stopped.value || model.busy.value">{{ t('androidDisplayPollingHint') }}</p>
      </template>
    </template>
    <section
      v-if="model.entry.value"
      class="receipt"
      aria-live="polite"
      data-testid="android-display-receipt"
    >
      <div v-if="model.entry.value.restored" data-testid="android-display-tracking-restored">
        <p>{{ t('operationTrackingHint') }}</p>
        <p>{{ t('androidDisplayRecoveryHint') }}</p>
      </div>
      <p v-if="model.entry.value.state === 'unknown'">{{ t('androidDisplayUnknown') }}</p>
      <p v-else-if="model.entry.value.task">
        {{ t(taskStateKeys[model.entry.value.task.state]) }}
      </p>
      <p v-else>{{ t('processing') }}</p>
      <p v-if="model.entry.value.problem">{{ t(model.entry.value.problem.descriptionKey) }}</p>
      <p v-if="model.entry.value.task?.errorCode">{{ model.entry.value.task.errorCode }}</p>
      <template v-if="model.receipt.value"
        ><p v-if="model.receipt.value.stopped">{{ t('androidDisplayStoppedReceipt') }}</p>
        <p v-if="model.receipt.value.restored">{{ t('androidDisplayRestoredReceipt') }}</p>
        <p v-if="model.receipt.value.uncertain">{{ t('androidDisplayUncertain') }}</p>
        <p v-if="model.receipt.value.message">{{ model.receipt.value.message }}</p></template
      >
      <AppButton
        v-if="model.pending.value"
        data-testid="android-display-query"
        :disabled="model.checking.value || model.entry.value.state === 'posting'"
        @click="model.reconcile"
        >{{ t('queryStatus') }}</AppButton
      >
    </section>
    <AppDialog
      :open="!!model.review.value"
      :title="
        t(
          model.review.value?.operation.kind === 'restore'
            ? 'androidDisplayRestore'
            : 'androidDisplayStop',
        )
      "
      @close="model.cancelReview"
    >
      <template v-if="model.review.value">
        <template v-if="model.review.value.operation.kind === 'stop'">
          <p data-testid="android-display-review-stop">{{ t('androidDisplayStopWarning') }}</p>
          <p>
            {{
              t('androidDisplayStopSummary', {
                minutes: (model.review.value.operation.autoRestoreSeconds ?? 1800) / 60,
              })
            }}
            {{
              t(
                model.review.value.operation.restoreOnNetworkLoss === false
                  ? 'androidDisplayNetworkLossOff'
                  : 'androidDisplayNetworkLossOn',
              )
            }}
          </p>
          <AppCheckbox
            v-model="model.confirmBlank.value"
            class="confirm-blank"
            data-testid="android-display-confirm-blank"
            >{{ t('androidDisplayConfirmBlank') }}</AppCheckbox
          >
        </template>
        <p v-else>{{ t('androidDisplayRestoreHint') }}</p>
        <div class="actions">
          <AppButton @click="model.cancelReview">{{ t('cancel') }}</AppButton
          ><AppButton
            data-testid="android-display-confirm"
            tone="primary"
            :disabled="
              model.review.value.operation.kind === 'stop'
                ? !model.confirmBlank.value || !model.canStop.value
                : !model.canRestore.value
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
.android-display-page {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  max-width: var(--app-content-width);
}
header h1 {
  margin-block: 0 var(--space-2);
}
p,
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
  width: 160px;
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
.confirm-blank {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-block: var(--space-4);
}
</style>
