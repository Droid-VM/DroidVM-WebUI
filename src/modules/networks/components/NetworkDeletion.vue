<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useNetworkDeletion } from '../model/deletion'
import { taskStateKeys } from '../../tasks'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'

const deletion = useNetworkDeletion(),
  { t } = useI18n()
</script>
<template>
  <AppDialog
    :open="deletion.visible.value"
    :title="t(deletion.recoveryConfirmation.value ? 'configurationRecoveryTitle' : 'networkDelete')"
    @close="deletion.close"
  >
    <div
      class="network-deletion"
      data-testid="network-delete-dialog"
      :aria-busy="deletion.loading.value || deletion.staging.value"
    >
      <OperationTrackingNotice
        :problem="deletion.recoveryProblem.value"
        @clear="deletion.clearTracking"
      />
      <p v-if="deletion.entry.value?.restored || deletion.recoveryEntry.value?.restored">
        {{ t('configurationRestoredReceipt') }}
      </p>
      <p
        v-if="
          deletion.entry.value?.state === 'unknown' ||
          deletion.recoveryEntry.value?.state === 'unknown'
        "
      >
        {{ t('configurationMissingReceipt') }}
      </p>
      <template v-if="deletion.recoveryConfirmation.value">
        <p>{{ t('configurationRecoveryConfirm') }}</p>
        <p>{{ t('configurationRecoveryNotDeletion') }}</p>
        <div class="buttons">
          <AppButton @click="deletion.cancelRecovery">{{ t('cancel') }}</AppButton>
          <AppButton
            data-testid="configuration-recovery-confirm"
            tone="primary"
            :disabled="!deletion.canRecover.value"
            @click="deletion.recover"
            >{{ t('configurationRecoveryRun') }}</AppButton
          >
        </div>
      </template>
      <template v-else>
        <template v-if="deletion.preview.value">
          <h3>{{ deletion.preview.value.name }}</h3>
          <p class="muted">{{ deletion.preview.value.id }}</p>
          <AppNotice tone="warning" :title="t('networkDeletionWarning')">
            <p>{{ t('networkDeletionEffect') }}</p>
            <p>{{ t('networkDeletionStopVms') }}</p>
          </AppNotice>
          <section data-testid="network-delete-attachments">
            <h3>{{ t('networkDeletionAttachments') }}</h3>
            <p>{{ t('networkDeletionSnapshotHint') }}</p>
            <p v-if="!deletion.preview.value.detail.attachments.length">
              {{ t('networkDeletionNoAttachments') }}
            </p>
            <ul v-else>
              <li
                v-for="attachment in deletion.preview.value.detail.attachments"
                :key="`${attachment.vmId}:${attachment.slot}`"
              >
                <strong>{{ attachment.vmName || attachment.vmId }}</strong>
                <span
                  >{{ attachment.vmId }} ·
                  {{ t('networkDeletionNic', { slot: attachment.slot + 1 }) }}</span
                >
                <span
                  >{{ attachment.mac
                  }}<template v-if="attachment.vlan !== null">
                    · VLAN {{ attachment.vlan }}</template
                  ></span
                >
              </li>
            </ul>
          </section>
        </template>
        <p v-if="deletion.loading.value || deletion.staging.value" role="status">
          {{ t('processing') }}
        </p>
        <AppNotice
          v-if="deletion.problem.value"
          tone="error"
          :title="t(deletion.problem.value.titleKey)"
        >
          <p>{{ t(deletion.problem.value.descriptionKey) }}</p>
        </AppNotice>
        <section
          v-if="deletion.entry.value"
          data-testid="network-delete-status"
          :data-task-state="deletion.entry.value.task?.state ?? deletion.entry.value.state"
          aria-live="polite"
        >
          <p v-if="deletion.entry.value.state === 'unknown'">{{ t('vmOperationUnknown') }}</p>
          <p v-if="deletion.entry.value.task">
            {{ t(taskStateKeys[deletion.entry.value.task.state])
            }}<span v-if="deletion.entry.value.task.errorCode">
              · {{ deletion.entry.value.task.errorCode }}</span
            >
          </p>
          <p v-if="deletion.entry.value.problem" class="error">
            {{ t(deletion.entry.value.problem.titleKey) }} ·
            {{ t(deletion.entry.value.problem.descriptionKey) }}
          </p>
          <p v-if="deletion.removed.value">{{ t('networkDeletionSucceeded') }}</p>
          <AppButton
            data-testid="network-delete-reconcile"
            :disabled="deletion.checking.value || deletion.staging.value"
            @click="deletion.reconcile"
            >{{ t('queryStatus') }}</AppButton
          >
        </section>
        <p
          v-if="
            deletion.observed.value !== 'unknown' &&
            (deletion.entry.value || deletion.recoveryEntry.value)
          "
          data-testid="network-delete-observation"
          :data-observation="deletion.observed.value"
        >
          {{
            t(
              deletion.observed.value === 'absent'
                ? 'networkDeletionAbsent'
                : 'networkDeletionPresent',
            )
          }}
        </p>
        <p v-if="deletion.uncertain.value">{{ t('networkDeletionUncertain') }}</p>
        <section
          v-if="deletion.recoveryEntry.value"
          data-testid="configuration-recovery-status"
          :data-task-state="
            deletion.recoveryEntry.value.task?.state ?? deletion.recoveryEntry.value.state
          "
          aria-live="polite"
        >
          <h3>{{ t('configurationRecoveryTitle') }}</h3>
          <p v-if="deletion.recoveryEntry.value.state === 'unknown'">
            {{ t('vmOperationUnknown') }}
          </p>
          <p v-if="deletion.recoveryEntry.value.task">
            {{ t(taskStateKeys[deletion.recoveryEntry.value.task.state])
            }}<span v-if="deletion.recoveryEntry.value.task.errorCode">
              · {{ deletion.recoveryEntry.value.task.errorCode }}</span
            >
          </p>
          <p v-if="deletion.recoveryEntry.value.problem" class="error">
            {{ t(deletion.recoveryEntry.value.problem.titleKey) }}
          </p>
          <p>{{ t('configurationRecoveryNotDeletion') }}</p>
          <AppButton
            data-testid="configuration-recovery-reconcile"
            :disabled="deletion.checking.value || deletion.staging.value"
            @click="deletion.reconcile"
            >{{ t('queryStatus') }}</AppButton
          >
        </section>
        <div class="buttons">
          <AppButton @click="deletion.close">{{ t('close') }}</AppButton>
          <AppButton
            v-if="deletion.target.value && !deletion.removed.value"
            :disabled="deletion.busy.value || deletion.uncertain.value"
            @click="deletion.reload"
            >{{ t('networkDeletionReload') }}</AppButton
          >
          <AppButton
            v-if="deletion.recoverySupported.value"
            data-testid="configuration-recovery-open"
            :disabled="deletion.loading.value || deletion.staging.value"
            @click="deletion.openRecovery"
            >{{ t('configurationRecoveryTitle') }}</AppButton
          >
          <AppButton
            v-if="!deletion.entry.value && deletion.preview.value"
            data-testid="network-delete-confirm"
            tone="primary"
            :disabled="!deletion.canSubmit.value"
            @click="deletion.submit"
            >{{ t('networkDelete') }}</AppButton
          >
        </div>
      </template>
    </div>
  </AppDialog>
</template>
<style scoped>
.network-deletion {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  overflow-wrap: anywhere;
}
h3,
p {
  margin: 0;
}
h3 {
  font-size: var(--md-sys-typescale-title-medium-size);
}
section {
  display: grid;
  gap: var(--space-2);
}
ul {
  display: grid;
  gap: var(--space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}
li {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.error {
  color: var(--md-sys-color-error);
}
</style>
