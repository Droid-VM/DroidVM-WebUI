<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  backupCategories,
  backupMaximumBytes,
  configurationBackupDownloadHref,
  useConfigurationBackup,
} from '../model/backup'
import { taskPercent, taskStateKeys } from '../../tasks'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
import AppProgress from '../../../shared/ui/AppProgress.vue'
const model = useConfigurationBackup(),
  { t, locale } = useI18n(),
  handedOff = ref(false)
const categoryKeys = { networks: 'navNetwork', disks: 'navDisk', vms: 'navVms' } as const
const stageKeys = {
  validation: 'backupStageValidation',
  networks: 'navNetwork',
  vm_disks: 'backupStageVmDisks',
} as const
const bytes = (value: number) => value.toLocaleString(locale.value)
function select(event: Event) {
  const input = event.target as HTMLInputElement
  void model.select(input.files?.[0] ?? null)
  input.value = ''
}
onBeforeUnmount(model.leave)
</script>
<template>
  <div class="backup-panel">
    <OperationTrackingNotice :problem="model.recoveryProblem.value" @clear="model.clearTracking" />
    <h1>{{ t('backupTitle') }}</h1>
    <p>{{ t('backupScope') }}</p>
    <AppNotice v-if="!model.supported.value" tone="warning" :title="t('backupUnavailable')" />
    <template v-else>
      <section>
        <h2>{{ t('backupExportTitle') }}</h2>
        <p>{{ t('backupExportHint') }}</p>
        <a
          class="btn tonal download"
          :href="configurationBackupDownloadHref"
          download="DroidVM_backup.json"
          @click="handedOff = true"
          >{{ t('backupDownload') }}</a
        >
        <p v-if="handedOff" role="status">{{ t('transferHandedOff') }}</p>
      </section>
      <section>
        <h2>{{ t('backupImportTitle') }}</h2>
        <p>{{ t('backupMergeHint') }}</p>
        <p>{{ t('backupSizeHint', { bytes: bytes(backupMaximumBytes) }) }}</p>
        <p>{{ t('backupReloadHint') }}</p>
        <label
          >{{ t('backupSelect')
          }}<input
            type="file"
            accept="application/json,.json"
            :disabled="model.pending.value || model.recoveryRequired.value"
            @change="select"
        /></label>
        <p v-if="model.name.value">{{ model.name.value }} · {{ bytes(model.size.value) }} B</p>
        <p v-if="model.reading.value || model.staging.value" role="status">
          {{ t(model.reading.value ? 'backupReading' : 'backupPreparing') }}
        </p>
        <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
          ><p>{{ t(model.problem.value.descriptionKey) }}</p>
          <p>{{ t('backupFileHint') }}</p></AppNotice
        >
        <AppButton :disabled="!model.canPreview.value" @click="model.prepare">{{
          t('backupPreview')
        }}</AppButton>
        <div v-if="model.preview.value" class="preview">
          <h3>{{ t('backupPreviewTitle') }}</h3>
          <p>{{ t('backupPreviewHint') }}</p>
          <div class="categories">
            <section v-for="category in backupCategories" :key="category" class="category">
              <h4>{{ t(categoryKeys[category]) }}</h4>
              <template v-if="model.preview.value.categories[category].present">
                <p>
                  {{
                    t('backupCategoryCounts', {
                      count: model.preview.value.categories[category].count,
                      added: model.preview.value.categories[category].added,
                      replaced: model.preview.value.categories[category].replaced,
                    })
                  }}
                </p>
                <p v-if="model.preview.value.categories[category].count === 0">
                  {{ t('backupEmptyRetained') }}
                </p>
              </template>
              <p v-else>{{ t('backupCategoryAbsent') }}</p>
            </section>
          </div>
          <p>{{ t('backupOrderHint') }}</p>
          <label class="check"
            ><input v-model="model.acknowledged.value" type="checkbox" /><span>{{
              t('backupConfirm')
            }}</span></label
          >
          <AppButton tone="primary" :disabled="!model.canCommit.value" @click="model.commit">{{
            t('backupCommit')
          }}</AppButton>
        </div>
      </section>
      <section v-if="model.entry.value" class="status" aria-live="polite">
        <p v-if="model.entry.value.restored">{{ t('configurationRestoredReceipt') }}</p>
        <h2>{{ t('backupImportStatus') }}</h2>
        <p v-if="model.entry.value.state === 'posting'">{{ t('processing') }}</p>
        <p v-if="model.entry.value.state === 'unknown'">{{ t('backupUnknown') }}</p>
        <p v-if="model.entry.value.state === 'unknown'">{{ t('configurationMissingReceipt') }}</p>
        <p v-if="model.entry.value.task">{{ t(taskStateKeys[model.entry.value.task.state]) }}</p>
        <AppProgress
          v-if="model.entry.value.task && model.pending.value"
          :label="t('backupImportStatus')"
          :value="taskPercent(model.entry.value.task)"
        />
        <AppNotice
          v-if="model.entry.value.problem"
          tone="error"
          :title="t(model.entry.value.problem.titleKey)"
          ><p>{{ t(model.entry.value.problem.descriptionKey) }}</p></AppNotice
        >
        <template v-if="model.result.value">
          <p>
            {{ t('backupCompleted') }}:
            {{
              model.result.value.completed.length
                ? model.result.value.completed
                    .map((category) => t(categoryKeys[category]))
                    .join(' / ')
                : t('backupNoneCompleted')
            }}
          </p>
          <p v-if="model.result.value.failedStage">
            {{ t('backupFailedStage') }}: {{ t(stageKeys[model.result.value.failedStage]) }}
          </p>
          <p v-if="model.result.value.uncertainStage">
            {{ t('backupUncertainStage') }}: {{ t(stageKeys[model.result.value.uncertainStage]) }}
          </p>
          <p v-if="model.result.value.recoveryRequired">{{ t('backupRecoveryRequired') }}</p>
          <p v-if="model.result.value.errorCode">{{ model.result.value.errorCode }}</p>
          <p
            v-if="
              model.entry.value.task?.state === 'succeeded' && model.entry.value.state === 'done'
            "
          >
            {{ t('backupSucceeded') }}
          </p>
        </template>
        <p v-else-if="model.entry.value.task?.errorCode">{{ model.entry.value.task.errorCode }}</p>
        <div class="buttons">
          <AppButton
            v-if="model.pending.value"
            :disabled="model.checking.value || model.entry.value.state === 'posting'"
            @click="model.reconcile"
            >{{ t('queryStatus') }}</AppButton
          ><RouterLink class="btn tonal" to="/tasks">{{ t('diskTaskLink') }}</RouterLink>
        </div>
        <div v-if="model.recoveryRequired.value" class="recovery">
          <p v-if="!model.result.value">{{ t('backupUnknownResult') }}</p>
          <p>{{ t('backupPartialHint') }}</p>
          <div class="buttons">
            <RouterLink class="btn tonal" to="/vms">{{ t('navVms') }}</RouterLink
            ><RouterLink class="btn tonal" to="/resources/network">{{ t('navNetwork') }}</RouterLink
            ><RouterLink class="btn tonal" to="/resources/disk">{{ t('navDisk') }}</RouterLink>
          </div>
          <label class="check"
            ><input
              v-model="model.recoveryAcknowledged.value"
              type="checkbox"
              :disabled="model.pending.value"
            /><span>{{ t('backupRecoveryConfirm') }}</span></label
          >
          <AppButton
            :disabled="model.pending.value || !model.recoveryAcknowledged.value"
            @click="model.restartAfterReview"
            >{{ t('backupRestart') }}</AppButton
          >
        </div>
      </section>
    </template>
  </div>
</template>
<style scoped>
.backup-panel,
section,
label,
.preview,
.recovery {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  overflow-wrap: anywhere;
}
h1,
h2,
h3,
h4,
p {
  margin: 0;
}
h2,
h3 {
  font-size: var(--font-heading);
}
section,
.recovery {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
}
.categories {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: var(--space-3);
  min-width: 0;
}
.category {
  align-content: start;
}
input[type='file'] {
  width: 100%;
  min-width: 0;
  font: inherit;
}
input::file-selector-button {
  padding: 12px;
  max-width: 100%;
  margin: 0 8px 8px 0;
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
@media (max-width: 480px) {
  .buttons > *,
  .preview > .btn {
    width: 100%;
  }
}
</style>
