<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useImageTransfers } from '../model/transfers'
import { taskStateKeys, taskPercent } from '../../tasks'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppProgress from '../../../shared/ui/AppProgress.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
const model = useImageTransfers(),
  upload = model.uploader,
  { t, locale } = useI18n()
const confirmRemove = ref(false)
const phaseKeys = {
  idle: 'transferIdle',
  running: 'transferRunning',
  paused: 'transferPaused',
  unknown: 'transferUnknown',
  retry: 'transferRetry',
  ready: 'transferReady',
  failed: 'transferFailed',
} as const
const bytes = (value: string | bigint) => BigInt(value).toLocaleString(locale.value)
function select(event: Event) {
  const input = event.target as HTMLInputElement
  model.select(Array.from(input.files ?? []))
  input.value = ''
}
function reselect(event: Event) {
  const input = event.target as HTMLInputElement
  void upload.reselect(Array.from(input.files ?? []))
  input.value = ''
}
function handoff() {
  if (model.handoff())
    document.querySelector<HTMLInputElement>('[data-testid="image-import-source"]')?.focus()
}
async function remove() {
  confirmRemove.value = false
  await model.remove()
}
onBeforeUnmount(model.leave)
</script>
<template>
  <section class="image-transfers">
    <h2>{{ t('imageUploadTitle') }}</h2>
    <p>{{ t('imageUploadIntro') }}</p>
    <fieldset
      v-if="upload.recoveryProblem.value || model.recoveryProblem.value"
      class="tracking-guard"
      :disabled="
        model.recoveryRequired.value || (!!model.entry.value && model.entry.value.state !== 'done')
      "
    >
      <OperationTrackingNotice
        :problem="upload.recoveryProblem.value"
        @clear="model.clearUploadTracking"
      />
      <OperationTrackingNotice
        :problem="model.recoveryProblem.value"
        @clear="model.clearInstallTracking"
      />
    </fieldset>
    <AppNotice v-if="!model.supported.value" tone="warning" :title="t('imageUploadUnavailable')" />
    <template v-if="model.supported.value || upload.uploadId.value || model.entry.value">
      <p>{{ t('imageUploadLifetime') }}</p>
      <p v-if="upload.restored.value" data-testid="image-upload-restored">
        {{ t('transferRecoveryHint') }}
      </p>
      <p v-if="upload.hashBusy.value" data-testid="image-upload-hashing" role="status">
        {{ t('transferHashing') }}
      </p>
      <AppButton v-if="upload.hashBusy.value" @click="upload.pauseUpload">{{
        t('transferPause')
      }}</AppButton>
      <AppNotice
        v-if="upload.uploadProblem.value"
        data-testid="image-upload-problem"
        :data-code="upload.uploadProblem.value.code"
        tone="error"
        :title="t(upload.uploadProblem.value.titleKey)"
      >
        <p>{{ t(upload.uploadProblem.value.descriptionKey) }}</p>
        <p
          v-if="
            upload.restored.value && upload.uploadProblem.value.titleKey !== 'transferFileMismatch'
          "
        >
          {{ t('transferRestoreUnavailable') }}
        </p>
      </AppNotice>
      <label v-if="upload.needsFiles.value && !model.entry.value">
        {{ t('transferReselect') }}
        <input
          type="file"
          data-testid="image-upload-reselect"
          :disabled="
            upload.uploadBusy.value || upload.hashBusy.value || !!upload.recoveryProblem.value
          "
          @change="reselect"
        />
        <small>{{ t('transferReselectHint') }}</small>
      </label>
      <label v-if="!upload.uploadId.value && !model.entry.value"
        >{{ t('imageUploadFile')
        }}<input
          data-testid="image-upload-file"
          type="file"
          :disabled="!model.editable.value || !!upload.uploadId.value"
          @change="select"
      /></label>
      <p v-if="!upload.metadata.value && !upload.uploadId.value">{{ t('imageUploadFileHint') }}</p>
      <ul v-if="upload.metadata.value" data-testid="image-upload-files">
        <li v-for="file in upload.metadata.value" :key="file.name">
          {{ file.name }} · {{ bytes(file.sizeBytes) }} B
        </li>
      </ul>
      <AppButton
        v-if="!upload.uploadId.value && !model.entry.value"
        data-testid="image-upload-start"
        tone="primary"
        :disabled="!upload.canStart.value"
        @click="upload.start"
        >{{ t('transferStart') }}</AppButton
      >
      <template v-if="upload.uploadId.value">
        <p role="status" data-testid="image-upload-phase" :data-phase="upload.uploadPhase.value">
          {{ t(phaseKeys[upload.uploadPhase.value]) }}
        </p>
        <AppProgress :label="t('transferUploadProgress')" :value="upload.percent.value" />
        <p>{{ bytes(upload.doneBytes.value) }} / {{ bytes(upload.totalBytes.value) }} B</p>
        <p v-if="upload.upload.value">
          {{
            t('transferQuota', {
              files: upload.upload.value.limits.maxFiles,
              file: bytes(upload.upload.value.limits.maxFileBytes),
              session: bytes(upload.upload.value.limits.maxSessionBytes),
              total: bytes(upload.upload.value.limits.maxTotalBytes),
              ttl: upload.upload.value.limits.ttlMs / 1000,
            })
          }}
        </p>
        <div class="buttons">
          <AppButton v-if="upload.uploadPhase.value === 'running'" @click="upload.pauseUpload">{{
            t('transferPause')
          }}</AppButton>
          <AppButton
            v-if="['paused', 'retry'].includes(upload.uploadPhase.value)"
            data-testid="image-upload-resume"
            :disabled="!upload.canResume.value || !!model.entry.value"
            @click="upload.resumeUpload"
            >{{
              t(upload.uploadPhase.value === 'retry' ? 'transferRetryButton' : 'transferResume')
            }}</AppButton
          >
          <AppButton
            v-if="['unknown', 'failed'].includes(upload.uploadPhase.value)"
            data-testid="image-upload-inspect"
            :disabled="upload.uploadBusy.value || upload.hashBusy.value"
            @click="upload.inspectUpload"
            >{{ t('queryStatus') }}</AppButton
          >
          <AppButton
            data-testid="image-upload-remove"
            :disabled="!model.canRemove.value"
            @click="confirmRemove = true"
            >{{ t('transferDeleteUpload') }}</AppButton
          >
        </div>
      </template>
      <div v-if="confirmRemove" class="confirmation">
        <p>{{ t('imageUploadRemoveHint') }}</p>
        <div class="buttons">
          <AppButton @click="confirmRemove = false">{{ t('cancel') }}</AppButton
          ><AppButton
            data-testid="image-upload-remove-confirm"
            :disabled="!model.canRemove.value"
            @click="remove"
            >{{ t('transferConfirmDelete') }}</AppButton
          >
        </div>
      </div>
      <form
        v-if="upload.uploadPhase.value === 'ready' && !model.entry.value"
        @submit.prevent="model.install"
      >
        <h3>{{ t('imageUploadInstallTitle') }}</h3>
        <p>{{ t('imageUploadInstallHint') }}</p>
        <p>{{ t('imageUploadDirectoryHint') }}</p>
        <label
          >{{ t('diskHostFolder')
          }}<input
            v-model="model.draft.folder"
            data-testid="image-upload-folder"
            placeholder="/storage/emulated/0/DroidVM"
            required
            autocomplete="off"
            :disabled="!model.editable.value"
        /></label>
        <label
          >{{ t('diskFileName')
          }}<input
            v-model="model.draft.name"
            data-testid="image-upload-name"
            required
            autocomplete="off"
            :disabled="!model.editable.value"
        /></label>
        <label class="check"
          ><input
            v-model="model.acknowledged.value"
            data-testid="image-upload-acknowledge"
            type="checkbox"
            :disabled="!model.editable.value"
          /><span>{{ t('imageUploadConfirm') }}</span></label
        >
        <AppButton
          type="submit"
          data-testid="image-upload-install"
          tone="primary"
          :disabled="!model.canInstall.value"
          >{{ t('imageUploadInstall') }}</AppButton
        >
      </form>
      <section v-if="model.entry.value" data-testid="image-upload-result" aria-live="polite">
        <h3>{{ t('imageUploadResult') }}</h3>
        <div v-if="model.entry.value.restored" data-testid="image-install-restored">
          <p>{{ t('imageInstallRecoveryHint') }}</p>
          <code>{{
            `${model.entry.value.request.folder === '/' ? '' : model.entry.value.request.folder}/${model.entry.value.request.name}`
          }}</code>
        </div>
        <p v-if="model.entry.value.state === 'posting'">{{ t('processing') }}</p>
        <p v-if="model.entry.value.state === 'unknown'">{{ t('imageUploadUnknown') }}</p>
        <p v-if="model.entry.value.task">{{ t(taskStateKeys[model.entry.value.task.state]) }}</p>
        <AppProgress
          v-if="model.entry.value.task && model.entry.value.state === 'waiting'"
          :label="t('imageUploadInstall')"
          :value="taskPercent(model.entry.value.task)"
        />
        <p v-if="model.entry.value.task?.errorCode">{{ model.entry.value.task.errorCode }}</p>
        <AppNotice
          v-if="model.entry.value.problem"
          tone="error"
          :title="t(model.entry.value.problem.titleKey)"
          ><p>{{ t(model.entry.value.problem.descriptionKey) }}</p></AppNotice
        >
        <p v-if="model.result.value">
          <span>{{ t('imageUploadTarget') }}</span
          ><br /><code>{{ model.result.value.source }}</code>
        </p>
        <AppNotice
          v-if="model.recoveryRequired.value"
          tone="warning"
          :title="t('imageUploadRecovery')"
          ><p>{{ t('imageUploadRecoveryHint') }}</p></AppNotice
        >
        <p v-if="model.succeeded.value">{{ t('imageUploadInstalled') }}</p>
        <p v-else-if="model.entry.value.state === 'done'">{{ t('imageUploadIncomplete') }}</p>
        <AppNotice
          v-if="model.handoffBlocked.value"
          tone="warning"
          :title="t('imageUploadImportBusy')"
          ><p>{{ t('imageUploadImportBusyHint') }}</p></AppNotice
        >
        <p v-if="model.handedOff.value">{{ t('imageUploadHandedOff') }}</p>
        <div class="buttons">
          <AppButton
            data-testid="image-upload-reconcile"
            :disabled="model.checking.value || model.entry.value.state === 'posting'"
            @click="model.reconcile"
            >{{ t('queryStatus') }}</AppButton
          >
          <AppButton
            v-if="model.succeeded.value"
            data-testid="image-upload-import"
            tone="primary"
            :disabled="model.handedOff.value"
            @click="handoff"
            >{{ t('imageUploadImport') }}</AppButton
          >
          <RouterLink class="btn tonal" to="/tasks">{{ t('diskTaskLink') }}</RouterLink>
        </div>
      </section>
      <div
        v-if="
          (upload.uploadId.value || model.entry.value) &&
          !upload.uploadBusy.value &&
          (!model.entry.value || model.entry.value.state === 'done') &&
          !model.recoveryRequired.value
        "
        class="confirmation"
      >
        <p>{{ t('imageUploadResetHint') }}</p>
        <label class="check"
          ><input v-model="model.outcomeAcknowledged.value" type="checkbox" /><span>{{
            t('imageUploadOutcomeConfirm')
          }}</span></label
        >
        <AppButton
          data-testid="image-upload-reset"
          :disabled="!model.canReset.value"
          @click="model.startNew"
          >{{ t('imageUploadRestart') }}</AppButton
        >
      </div>
    </template>
  </section>
</template>
<style scoped>
.tracking-guard {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.image-transfers,
section,
form,
label,
.confirmation {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  overflow-wrap: anywhere;
}
.image-transfers,
.confirmation {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  background: var(--surface);
}
h2,
h3,
p {
  margin: 0;
}
h2,
h3 {
  font-size: var(--font-heading);
}
input:not([type='checkbox']) {
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
  margin: 0;
  padding-inline-start: 20px;
}
@media (max-width: 480px) {
  .image-transfers,
  .confirmation {
    padding: var(--space-3);
  }
  .buttons > * {
    width: 100%;
  }
}
</style>
