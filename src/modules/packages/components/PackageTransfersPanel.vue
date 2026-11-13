<script setup lang="ts">
import AppLinkButton from '../../../shared/ui/AppLinkButton.vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { usePackageTransfers, packageDownloadHref } from '../model/transfers'
import { usePackageImport } from '../model/import'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppProgress from '../../../shared/ui/AppProgress.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
const model = usePackageTransfers(),
  importer = usePackageImport(),
  router = useRouter(),
  { t, locale } = useI18n()
const confirmUpload = ref(false),
  confirmDownload = ref(false),
  handedOff = ref(false)
const forget = ref<'upload' | 'download' | null>(null)
const phaseKeys = {
  idle: 'transferIdle',
  running: 'transferRunning',
  paused: 'transferPaused',
  unknown: 'transferUnknown',
  retry: 'transferRetry',
  ready: 'transferReady',
  failed: 'transferFailed',
} as const
function select(event: Event) {
  const input = event.target as HTMLInputElement
  model.select(Array.from(input.files ?? []))
  input.value = ''
}
function reselect(event: Event) {
  const input = event.target as HTMLInputElement
  void model.reselect(Array.from(input.files ?? []))
  input.value = ''
}
function forgetConfirmed() {
  if (forget.value === 'upload') model.forgetUpload()
  else if (forget.value === 'download') model.forgetDownload()
  forget.value = null
}
const bytes = (value: string | bigint) => BigInt(value).toLocaleString(locale.value)
function importUploaded() {
  const source = model.upload.value?.source
  if (
    model.uploadPhase.value !== 'ready' ||
    !source ||
    importer.pending.value ||
    model.recoveryProblem.value
  )
    return
  importer.draft.source = source
  void router.push('/packages/import')
}
async function removeUpload() {
  confirmUpload.value = false
  await model.deleteUpload()
}
async function removeDownload() {
  confirmDownload.value = false
  await model.deleteDownload()
}
watch([model.downloadId, model.canAccessDownload], () => {
  handedOff.value = false
  confirmDownload.value = false
  if (forget.value === 'download') forget.value = null
})
onBeforeUnmount(model.pauseUpload)
</script>
<template>
  <div class="transfers">
    <h1>{{ t('transferTitle') }}</h1>
    <OperationTrackingNotice :problem="model.recoveryProblem.value" @clear="model.clearTracking" />
    <div v-if="model.downloadRecoveryProblem.value" data-testid="package-download-tracking">
      <OperationTrackingNotice
        :problem="model.downloadRecoveryProblem.value"
        @clear="model.clearDownloadTracking"
      />
    </div>
    <AppNotice v-if="!model.supported.value" tone="warning" :title="t('transferUnavailable')" />
    <template v-if="model.supported.value || model.uploadId.value || model.downloadId.value">
      <section>
        <h2>{{ t('transferUpload') }}</h2>
        <p v-if="model.hashBusy.value" data-testid="package-upload-hashing" role="status">
          {{ t('transferHashing') }}
        </p>
        <AppButton v-if="model.hashBusy.value" @click="model.pauseUpload">{{
          t('transferPause')
        }}</AppButton>
        <AppNotice
          v-if="model.uploadProblem.value"
          data-testid="package-upload-problem"
          :data-code="model.uploadProblem.value.code"
          tone="error"
          :title="t(model.uploadProblem.value.titleKey)"
        >
          <p>{{ t(model.uploadProblem.value.descriptionKey) }}</p>
          <p
            v-if="
              model.restored.value && model.uploadProblem.value.titleKey !== 'transferFileMismatch'
            "
          >
            {{ t('transferRestoreUnavailable') }}
          </p>
        </AppNotice>
        <label v-if="model.needsFiles.value">
          {{ t('transferReselect') }}
          <input
            type="file"
            multiple
            data-testid="package-upload-reselect"
            :disabled="
              model.uploadBusy.value || model.hashBusy.value || !!model.recoveryProblem.value
            "
            @change="reselect"
          />
        </label>
        <p v-if="model.limits.value">
          {{
            t('transferQuota', {
              files: model.limits.value.maxFiles,
              file: bytes(model.limits.value.maxFileBytes),
              session: bytes(model.limits.value.maxSessionBytes),
              total: bytes(model.limits.value.maxTotalBytes),
              ttl: model.limits.value.ttlMs / 1000,
            })
          }}
        </p>
        <label v-if="!model.uploadId.value"
          >{{ t('transferSelect')
          }}<input
            type="file"
            multiple
            :disabled="
              !!model.uploadId.value ||
              model.uploadBusy.value ||
              model.hashBusy.value ||
              !!model.recoveryProblem.value
            "
            @change="select"
        /></label>
        <ul v-if="model.metadata.value && !model.upload.value">
          <li v-for="file in model.metadata.value" :key="file.name">
            {{ file.name }} · {{ bytes(file.sizeBytes) }} B
          </li>
        </ul>
        <AppButton
          v-if="!model.uploadId.value"
          tone="primary"
          :disabled="!model.canStart.value"
          @click="model.start"
          >{{ t('transferStart') }}</AppButton
        >
        <template v-if="model.uploadId.value">
          <p role="status" data-testid="package-upload-phase" :data-phase="model.uploadPhase.value">
            {{ t(phaseKeys[model.uploadPhase.value]) }}
          </p>
          <p class="id">{{ model.uploadId.value }}</p>
          <AppProgress :label="t('transferUploadProgress')" :value="model.percent.value" />
          <p>{{ bytes(model.doneBytes.value) }} / {{ bytes(model.totalBytes.value) }} B</p>
          <ul v-if="model.upload.value">
            <li v-for="file in model.upload.value.files" :key="file.index">
              {{ file.name }} · {{ bytes(file.offsetBytes) }} / {{ bytes(file.sizeBytes) }} B
            </li>
          </ul>
          <div class="buttons">
            <AppButton v-if="model.uploadPhase.value === 'running'" @click="model.pauseUpload">{{
              t('transferPause')
            }}</AppButton>
            <AppButton
              v-if="model.uploadPhase.value === 'paused' || model.uploadPhase.value === 'retry'"
              data-testid="package-upload-resume"
              :disabled="!model.canResume.value"
              @click="model.resumeUpload"
              >{{
                t(model.uploadPhase.value === 'retry' ? 'transferRetryButton' : 'transferResume')
              }}</AppButton
            >
            <AppButton
              v-if="model.uploadPhase.value === 'unknown' || model.uploadPhase.value === 'failed'"
              data-testid="package-upload-inspect"
              :disabled="model.uploadBusy.value || model.hashBusy.value"
              @click="model.inspectUpload"
              >{{ t('queryStatus') }}</AppButton
            >
            <AppButton
              v-if="model.uploadPhase.value === 'ready'"
              tone="primary"
              :disabled="
                importer.pending.value || !importer.supported.value || !!model.recoveryProblem.value
              "
              @click="importUploaded"
              >{{ t('transferImport') }}</AppButton
            >
            <AppButton :disabled="!model.canDelete.value" @click="confirmUpload = true">{{
              t('transferDeleteUpload')
            }}</AppButton>
            <AppButton
              v-if="model.uploadPhase.value === 'unknown' || model.uploadPhase.value === 'failed'"
              :disabled="model.uploadBusy.value"
              @click="forget = 'upload'"
              >{{ t('transferForget') }}</AppButton
            >
          </div>
          <div
            v-if="confirmUpload"
            class="confirmation"
            role="group"
            :aria-label="t('transferDeleteUpload')"
          >
            <p>{{ t('transferDeleteUploadHint') }}</p>
            <div class="buttons">
              <AppButton @click="confirmUpload = false">{{ t('transferKeep') }}</AppButton
              ><AppButton :disabled="!model.canDelete.value" @click="removeUpload">{{
                t('transferConfirmDelete')
              }}</AppButton>
            </div>
          </div>
        </template>
      </section>
      <section>
        <h2>{{ t('transferDownload') }}</h2>
        <template v-if="model.downloadId.value">
          <p
            role="status"
            data-testid="package-download-phase"
            :data-phase="model.downloadPhase.value"
          >
            {{ t(phaseKeys[model.downloadPhase.value]) }}
          </p>
          <p v-if="model.downloadDeleteUnknown.value" data-testid="package-download-delete-unknown">
            {{ t('transferDownloadDeleteUnknown') }}
          </p>
          <AppNotice
            v-if="model.downloadProblem.value"
            data-testid="package-download-problem"
            :data-code="model.downloadProblem.value.code"
            tone="error"
            :title="t(model.downloadProblem.value.titleKey)"
            ><p>{{ t(model.downloadProblem.value.descriptionKey) }}</p></AppNotice
          >
          <ul
            v-if="model.download.value && model.canAccessDownload.value"
            data-testid="package-download-files"
          >
            <li v-for="file in model.download.value.files" :key="file.index">
              <AppLinkButton
                tone="tonal"
                data-testid="package-download-file"
                :href="packageDownloadHref(model.download.value.id, file.index)"
                :download="file.name"
                @click="handedOff = true"
                >{{ file.name }}</AppLinkButton
              >
              · {{ bytes(file.sizeBytes) }} B
            </li>
          </ul>
          <p v-if="handedOff" role="status" data-testid="package-download-handed-off">
            {{ t('transferHandedOff') }}
          </p>
          <div class="buttons">
            <AppButton
              v-if="!model.canAccessDownload.value"
              data-testid="package-download-inspect"
              :disabled="model.downloadBusy.value"
              @click="model.inspectDownload"
              >{{ t('queryStatus') }}</AppButton
            ><AppButton
              data-testid="package-download-remove"
              :disabled="!model.canDeleteDownload.value"
              @click="confirmDownload = true"
              >{{ t('transferDeleteDownload') }}</AppButton
            >
          </div>
          <div
            v-if="confirmDownload"
            class="confirmation"
            role="group"
            :aria-label="t('transferDeleteDownload')"
          >
            <p>{{ t('transferDeleteDownloadHint') }}</p>
            <div class="buttons">
              <AppButton @click="confirmDownload = false">{{ t('transferKeep') }}</AppButton
              ><AppButton
                data-testid="package-download-remove-confirm"
                :disabled="!model.canDeleteDownload.value"
                @click="removeDownload"
                >{{ t('transferConfirmDelete') }}</AppButton
              >
            </div>
          </div>
          <AppButton
            v-if="model.downloadPhase.value === 'unknown' || model.downloadPhase.value === 'failed'"
            data-testid="package-download-forget"
            :disabled="model.downloadBusy.value"
            @click="forget = 'download'"
            >{{ t('transferForget') }}</AppButton
          >
        </template>
        <AppLinkButton tone="tonal" to="/packages/export">{{
          t('packageExportTitle')
        }}</AppLinkButton>
      </section>
      <div v-if="forget" class="confirmation" role="group" :aria-label="t('transferForget')">
        <p>{{ t(forget === 'download' ? 'transferDownloadForgetHint' : 'transferForgetHint') }}</p>
        <div class="buttons">
          <AppButton @click="forget = null">{{ t('transferKeep') }}</AppButton
          ><AppButton
            data-testid="transfer-forget-confirm"
            :disabled="
              forget === 'download'
                ? model.downloadBusy.value
                : model.uploadBusy.value || model.hashBusy.value
            "
            @click="forgetConfirmed"
            >{{ t('transferConfirmForget') }}</AppButton
          >
        </div>
      </div>
    </template>
  </div>
</template>
<style scoped>
.transfers,
section,
label {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  overflow-wrap: anywhere;
}
h1,
h2,
p {
  margin: 0;
}
h2 {
  font-size: var(--md-sys-typescale-title-medium-size);
}
section,
.confirmation {
  padding: var(--space-3);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
}
input {
  width: 100%;
  min-width: 0;
  font: inherit;
}
input::file-selector-button {
  max-width: 100%;
  padding: 12px;
  margin: 0 8px 8px 0;
}
ul {
  padding-inline-start: 20px;
  margin: 0;
}
li + li {
  margin-top: var(--space-2);
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.confirmation p {
  margin-bottom: var(--space-3);
}
.id {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium-size);
}
@media (width < 480px) {
  .buttons > * {
    width: 100%;
  }
}
</style>
