<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWebService } from '../model/service'
import { taskStateKeys } from '../../tasks'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
const model = useWebService(),
  { t } = useI18n()
const stateKeys = {
  disabled: 'webServiceDisabled',
  running: 'webServiceRunning',
  local_only: 'webServiceLocalOnly',
  error: 'webServiceError',
} as const
const errorKeys = {
  discovery_failed: 'webServiceDiscoveryFailed',
  listen_failed: 'webServiceListenFailed',
  configuration_write_failed: 'webServiceWriteFailed',
} as const
onMounted(model.read)
onBeforeUnmount(model.leave)
</script>
<template>
  <div class="service-panel">
    <h1>{{ t('webServiceTitle') }}</h1>
    <p>{{ t('webServiceIntro') }}</p>
    <AppNotice v-if="!model.supported.value" tone="warning" :title="t('webServiceUnavailable')" />
    <template v-else>
      <section>
        <h2>{{ t('webServiceCurrent') }}</h2>
        <div class="buttons">
          <AppButton
            :disabled="model.loading.value || model.entry.value?.state === 'posting'"
            @click="model.read"
            >{{ t('webServiceRead') }}</AppButton
          >
        </div>
        <p v-if="model.loading.value" role="status">{{ t('loading') }}</p>
        <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
          ><p>{{ t(model.problem.value.descriptionKey) }}</p>
          <p>{{ t('webServiceReconnectHint') }}</p></AppNotice
        >
        <template v-if="model.status.value">
          <p v-if="!model.fresh.value">{{ t('webServiceStale') }}</p>
          <p>{{ t(stateKeys[model.status.value.state]) }}</p>
          <AppNotice
            v-if="model.status.value.error"
            tone="warning"
            :title="t(errorKeys[model.status.value.error])"
          />
          <p v-if="model.status.value.applyPending">{{ t('webServiceApplyPending') }}</p>
          <h3>{{ t('webServiceAddresses') }}</h3>
          <ul v-if="model.status.value.addresses.length">
            <li v-for="(address, index) in model.status.value.addresses" :key="index">
              <code>{{ address }}</code>
            </li>
          </ul>
          <p v-else>{{ t('webServiceNoAddresses') }}</p>
          <p>{{ t('webServiceAddressHint') }}</p>
        </template>
      </section>
      <form v-if="model.baseline.value" @submit.prevent="model.reviewAction('configure')">
        <fieldset :disabled="!model.editable.value">
          <legend>{{ t('webServiceGeneral') }}</legend>
          <label class="check"
            ><input v-model="model.draft.enabled" type="checkbox" /><span>{{
              t('webServiceEnabled')
            }}</span></label
          >
          <label
            >{{ t('webServicePort')
            }}<input v-model="model.draft.port" inputmode="numeric" autocomplete="off" required
          /></label>
          <p>{{ t('webServicePortHint') }}</p>
        </fieldset>
        <fieldset :disabled="!model.editable.value">
          <legend>{{ t('webServiceAccess') }}</legend>
          <label
            >{{ t('webServiceScope')
            }}<select v-model="model.draft.scope">
              <option value="lan">{{ t('webServiceLan') }}</option>
              <option value="all">{{ t('webServiceAll') }}</option>
            </select></label
          >
          <p>{{ t('webServiceScopeHint') }}</p>
          <label
            >{{ t('webServiceOrigins')
            }}<textarea
              v-model="model.draft.origins"
              rows="4"
              autocomplete="off"
              spellcheck="false"
              placeholder="http://example.test:8080"
            />
          </label>
          <p>{{ t('webServiceOriginsHint') }}</p>
        </fieldset>
        <p v-if="!model.valid.value">{{ t('webServiceInvalid') }}</p>
        <p>{{ t('webServiceReloadDraftHint') }}</p>
        <div class="buttons">
          <AppButton
            type="submit"
            tone="primary"
            :disabled="!model.editable.value || !model.valid.value || !model.dirty.value"
            >{{ t('webServiceReview') }}</AppButton
          ><AppButton
            :disabled="!model.editable.value || !model.baseline.value.enabled || !model.valid.value"
            @click="model.reviewAction('restart')"
            >{{ t('webServiceRestartReview') }}</AppButton
          >
        </div>
      </form>
      <section v-if="model.review.value" class="review">
        <h2>
          {{
            t(
              model.review.value.action === 'configure'
                ? 'webServiceReview'
                : 'webServiceRestartReview',
            )
          }}
        </h2>
        <p v-if="model.review.value.action === 'restart'">{{ t('webServiceRestartSavedHint') }}</p>
        <dl>
          <dt>{{ t('webServiceEnabled') }}</dt>
          <dd>{{ t(model.review.value.settings.enabled ? 'webServiceOn' : 'webServiceOff') }}</dd>
          <dt>{{ t('webServicePort') }}</dt>
          <dd>{{ model.review.value.settings.port }}</dd>
          <dt>{{ t('webServiceScope') }}</dt>
          <dd>
            {{ t(model.review.value.settings.scope === 'lan' ? 'webServiceLan' : 'webServiceAll') }}
          </dd>
          <dt>{{ t('webServiceOrigins') }}</dt>
          <dd>
            <ul v-if="model.review.value.settings.publicOrigins.length">
              <li v-for="(origin, index) in model.review.value.settings.publicOrigins" :key="index">
                {{ origin }}
              </li>
            </ul>
            <span v-else>{{ t('webServiceNoOrigins') }}</span>
          </dd>
        </dl>
        <p>{{ t('webServiceDisconnectHint') }}</p>
        <AppNotice
          v-if="!model.review.value.settings.enabled"
          tone="warning"
          :title="t('webServiceDisableHint')"
        />
        <label class="check"
          ><input v-model="model.acknowledged.value" type="checkbox" /><span>{{
            t('webServiceConfirm')
          }}</span></label
        >
        <div class="buttons">
          <AppButton @click="model.cancelReview">{{ t('diskBackToForm') }}</AppButton
          ><AppButton
            tone="primary"
            :disabled="!model.acknowledged.value || !model.editable.value"
            @click="model.submit"
            >{{
              t(model.review.value.action === 'configure' ? 'webServiceSave' : 'webServiceRestart')
            }}</AppButton
          >
        </div>
      </section>
      <section v-if="model.entry.value" class="status" aria-live="polite">
        <h2>{{ t('webServiceOperationStatus') }}</h2>
        <p>{{ t('webServiceTaskHint') }}</p>
        <p v-if="model.entry.value.state === 'posting'">{{ t('processing') }}</p>
        <p v-if="model.entry.value.state === 'unknown'">{{ t('webServiceUnknown') }}</p>
        <p v-if="model.entry.value.task">{{ t(taskStateKeys[model.entry.value.task.state]) }}</p>
        <p v-if="model.applied.value">{{ t('webServiceApplied') }}</p>
        <p v-else-if="model.entry.value.task?.state === 'succeeded'">{{ t('webServiceQueued') }}</p>
        <p
          v-if="
            model.entry.value.task?.state === 'succeeded' &&
            model.fresh.value &&
            model.status.value &&
            !model.status.value.applyPending &&
            !model.applied.value
          "
        >
          {{ t('webServiceNotApplied') }}
        </p>
        <p v-if="model.entry.value.task?.errorCode">{{ model.entry.value.task.errorCode }}</p>
        <AppNotice
          v-if="model.entry.value.problem"
          tone="error"
          :title="t(model.entry.value.problem.titleKey)"
          ><p>{{ t(model.entry.value.problem.descriptionKey) }}</p>
          <p>{{ t('webServiceReconnectHint') }}</p></AppNotice
        >
        <div class="buttons">
          <AppButton
            v-if="model.entry.value.state !== 'done'"
            :disabled="
              model.checking.value || model.loading.value || model.entry.value.state === 'posting'
            "
            @click="model.reconcile"
            >{{ t('queryStatus') }}</AppButton
          ><AppButton
            :disabled="
              model.checking.value || model.loading.value || model.entry.value.state === 'posting'
            "
            @click="model.reconcile"
            >{{ t('webServiceVerify') }}</AppButton
          ><RouterLink to="/tasks">{{ t('diskTaskLink') }}</RouterLink>
        </div>
        <div v-if="model.locked.value && model.entry.value.state === 'done'" class="recovery">
          <p>{{ t('webServiceOutcomeHint') }}</p>
          <label class="check"
            ><input v-model="model.outcomeAcknowledged.value" type="checkbox" /><span>{{
              t('webServiceOutcomeConfirm')
            }}</span></label
          >
          <AppButton :disabled="!model.canRestartWorkflow.value" @click="model.restartWorkflow">{{
            t('webServiceRestartWorkflow')
          }}</AppButton>
        </div>
      </section>
      <section>
        <h2>{{ t('webServicePairing') }}</h2>
        <p>{{ t('webServicePairingHint') }}</p>
      </section>
    </template>
  </div>
</template>
<style scoped>
.service-panel,
section,
form,
fieldset,
label,
.recovery {
  display: grid;
  min-width: 0;
  gap: var(--space-3);
  overflow-wrap: anywhere;
}
h1,
h2,
h3,
p {
  margin: 0;
}
h2,
h3 {
  font-size: var(--font-heading);
}
section,
fieldset {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
}
input:not([type='checkbox']),
select,
textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font: inherit;
  color: var(--ink);
  background: var(--surface);
}
textarea {
  resize: vertical;
}
.check {
  display: flex;
  align-items: start;
  gap: var(--space-2);
}
.check input {
  flex: none;
  margin-top: 4px;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}
ul {
  padding-inline-start: 20px;
  margin: 0;
}
li + li {
  margin-top: var(--space-2);
}
dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
  gap: var(--space-2);
  margin: 0;
}
dd {
  margin: 0;
}
@media (max-width: 480px) {
  .buttons > * {
    width: 100%;
  }
}
</style>
