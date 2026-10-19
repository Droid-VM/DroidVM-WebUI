<script setup lang="ts">
import AppLinkButton from '../../../shared/ui/AppLinkButton.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { usePackageExport } from '../model/export'
import { usePackageTransfers } from '../model/transfers'
import { taskPercent, taskStateKeys } from '../../tasks'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppCheckbox from '../../../shared/ui/AppCheckbox.vue'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppProgress from '../../../shared/ui/AppProgress.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
defineProps<{ vms: readonly { id: string; name: string }[] }>()
const emit = defineEmits<{ select: [id: string]; refreshVms: [] }>()
const model = usePackageExport(),
  { t } = useI18n()
const transfers = usePackageTransfers(),
  router = useRouter()
function prepareDownload() {
  const entry = model.entry.value
  if (entry?.task?.state !== 'succeeded' || !entry.task.packageExport) return
  void transfers.prepareDownload(entry.request.requestId)
  void router.push('/packages/transfers')
}
const staleDisks = computed(() =>
  model.draft.disks.filter(
    (index) => !model.plan.value?.disks.some((disk) => disk.index === index),
  ),
)
function toggleDisk(index: number, checked: boolean) {
  const disks = model.draft.disks.filter((item) => item !== index)
  // Keep the order a native checkbox group would produce: appended on check.
  model.draft.disks = checked ? [...disks, index] : disks
}
function select(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  if (id) emit('select', id)
}
</script>
<template>
  <div class="export-form">
    <h1>{{ t('packageExportTitle') }}</h1>
    <p>{{ t('packageExportHostHint') }}</p>
    <p>{{ t('packageExportLeaveHint') }}</p>
    <OperationTrackingNotice :problem="model.recoveryProblem.value" @clear="model.clearTracking" />
    <AppNotice
      v-if="!model.supported.value"
      tone="warning"
      :title="t('packageExportUnavailable')"
    />
    <template v-else>
      <AppSelect
        :label="t('packageExportVm')"
        :value="model.target.value ?? ''"
        :disabled="model.pending.value || model.loading.value"
        @change="select"
      >
        <AppOption value="" disabled>{{ t('selectVmHint') }}</AppOption>
        <AppOption
          v-if="model.target.value && !vms.some((vm) => vm.id === model.target.value)"
          :value="model.target.value"
        >
          {{ model.target.value }}
        </AppOption>
        <AppOption v-for="vm in vms" :key="vm.id" :value="vm.id">{{ vm.name || vm.id }}</AppOption>
      </AppSelect>
      <div class="buttons">
        <AppButton @click="emit('refreshVms')">{{ t('refreshList') }}</AppButton
        ><AppButton
          v-if="model.target.value"
          :disabled="!model.allowed.value"
          @click="model.prepare()"
          >{{ t('packageExportReadPlan') }}</AppButton
        >
      </div>
      <p v-if="model.loading.value" role="status">{{ t('processing') }}</p>
      <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
        ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p v-if="model.pending.value">{{ t('packageExportPending') }}</p>
      <form v-if="model.plan.value && !model.review.value" @submit.prevent="model.reviewDraft">
        <strong>{{ model.plan.value.vmName || model.plan.value.vmId }}</strong>
        <AppTextField
          v-model="model.draft.destination"
          :label="t('packageExportDestination')"
          :supporting-text="t('packageExportPathHint')"
          required
          autocomplete="off"
          placeholder="/storage/emulated/0/DroidVM/export.vmpkg"
        />
        <AppSelect v-model="model.draft.compression" :label="t('packageExportCompression')">
          <AppOption
            v-for="compression in model.plan.value.compressions"
            :key="compression"
            :value="compression"
          >
            {{ compression === 'NONE' ? t('packageExportCompressionNone') : compression }}
          </AppOption>
        </AppSelect>
        <AppTextField
          v-model="model.draft.volumeBytes"
          :label="t('packageExportVolume')"
          :supporting-text="t('packageExportVolumeHint')"
          inputmode="numeric"
          autocomplete="off"
          required
        />
        <fieldset>
          <legend>{{ t('packageExportDisks') }}</legend>
          <p>{{ t('packageExportDisksHint') }}</p>
          <AppCheckbox
            v-for="disk in model.plan.value.disks"
            :key="disk.index"
            :checked="model.draft.disks.includes(disk.index)"
            @update:model-value="toggleDisk(disk.index, $event)"
            ><span
              >{{ t('diskSlot', { slot: disk.index + 1 }) }} ·
              {{ t(disk.readonly ? 'diskReadOnly' : 'diskReadWrite')
              }}<small>{{ disk.path }}</small></span
            ></AppCheckbox
          >
          <p v-if="staleDisks.length">
            {{ t('packageExportStaleDisks', { indexes: staleDisks.join(', ') }) }}
          </p>
          <div class="buttons">
            <AppButton
              @click="model.draft.disks = model.plan.value.disks.map((disk) => disk.index)"
              >{{ t('packageExportAllDisks') }}</AppButton
            ><AppButton @click="model.draft.disks = []">{{ t('packageExportNoDisks') }}</AppButton>
          </div>
        </fieldset>
        <p v-if="!model.valid.value">{{ t('packageExportInvalid') }}</p>
        <AppButton
          type="submit"
          tone="primary"
          :disabled="!model.valid.value || !model.allowed.value"
          >{{ t('packageExportReview') }}</AppButton
        >
      </form>
      <section v-if="model.review.value" class="review">
        <h2>{{ t('packageExportReview') }}</h2>
        <dl>
          <dt>{{ t('packageExportVm') }}</dt>
          <dd>{{ model.plan.value?.vmName || model.review.value.vmId }}</dd>
          <dt>{{ t('packageExportDestination') }}</dt>
          <dd>{{ model.review.value.operation.destination }}</dd>
          <dt>{{ t('packageExportCompression') }}</dt>
          <dd>{{ model.review.value.operation.compression }}</dd>
          <dt>{{ t('packageExportVolume') }}</dt>
          <dd>{{ model.review.value.operation.volumeBytes }}</dd>
          <dt>{{ t('packageExportDisks') }}</dt>
          <dd>
            {{
              model.review.value.operation.disks.length
                ? model.review.value.operation.disks.map((index) => index + 1).join(', ')
                : t('packageExportNoDisks')
            }}
          </dd>
        </dl>
        <p>{{ t('packageExportOverwriteWarning') }}</p>
        <p>{{ t('packageExportHostHint') }}</p>
        <AppCheckbox v-model="model.acknowledged.value">{{
          t('packageExportOverwriteConfirm')
        }}</AppCheckbox>
        <div class="buttons">
          <AppButton @click="model.cancelReview">{{ t('diskBackToForm') }}</AppButton
          ><AppButton
            tone="primary"
            :disabled="!model.acknowledged.value || !model.allowed.value"
            @click="model.submit"
            >{{ t('packageExportStart') }}</AppButton
          >
        </div>
      </section>
      <section
        v-if="model.entry.value"
        class="export-status"
        aria-live="polite"
        data-testid="package-export-receipt"
      >
        <p v-if="model.entry.value.restored">{{ t('packageExportRecoveryHint') }}</p>
        <h2>{{ t('packageExportStatus') }}</h2>
        <p>{{ model.entry.value.request.operation.destination }}</p>
        <p v-if="model.entry.value.state === 'posting'">{{ t('processing') }}</p>
        <p v-if="model.entry.value.state === 'unknown'">{{ t('packageExportUnknown') }}</p>
        <p v-if="model.entry.value.task">{{ t(taskStateKeys[model.entry.value.task.state]) }}</p>
        <AppProgress
          v-if="model.entry.value.task && model.entry.value.state === 'waiting'"
          :label="t('packageExportStatus')"
          :value="taskPercent(model.entry.value.task)"
        />
        <p v-if="model.entry.value.task?.errorCode">{{ model.entry.value.task.errorCode }}</p>
        <AppNotice
          v-if="model.entry.value.problem"
          tone="error"
          :title="t(model.entry.value.problem.titleKey)"
          ><p>{{ t(model.entry.value.problem.descriptionKey) }}</p></AppNotice
        >
        <template
          v-if="
            model.entry.value.task?.state === 'succeeded' && model.entry.value.task.packageExport
          "
        >
          <p>
            {{
              model.entry.value.task.packageExport.volumeCount === 0
                ? t('packageExportSingleResult')
                : t('packageExportVolumesResult', {
                    count: model.entry.value.task.packageExport.volumeCount,
                  })
            }}
          </p>
          <p>{{ t('packageExportResultHint') }}</p>
          <AppButton
            v-if="transfers.supported.value && !transfers.downloadId.value"
            :disabled="!transfers.canPrepareDownload.value"
            @click="prepareDownload"
            >{{ t('transferPrepareDownload') }}</AppButton
          >
          <AppLinkButton
            v-else-if="transfers.downloadId.value"
            tone="tonal"
            to="/packages/transfers"
            >{{ t('transferExistingDownload') }}</AppLinkButton
          >
        </template>
        <p v-else-if="model.entry.value.state === 'done'">{{ t('packageExportRetryHint') }}</p>
        <div class="buttons">
          <AppButton
            v-if="model.entry.value.state !== 'done'"
            data-testid="package-export-query"
            :disabled="model.checking.value || model.entry.value.state === 'posting'"
            @click="model.reconcile"
            >{{ t('queryStatus') }}</AppButton
          ><AppButton v-else :disabled="!model.allowed.value" @click="model.prepare()">{{
            t('packageExportReadPlan')
          }}</AppButton
          ><AppLinkButton tone="tonal" to="/tasks">{{ t('diskTaskLink') }}</AppLinkButton>
        </div>
      </section>
    </template>
  </div>
</template>
<style scoped>
.export-form,
form,
.review,
.export-status,
fieldset {
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
fieldset,
.review,
.export-status {
  padding: var(--space-3);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
}
small {
  display: block;
  overflow-wrap: anywhere;
  margin-top: var(--space-1);
}
.buttons {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
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
@media (width < 480px) {
  .buttons > *,
  form > .btn {
    width: 100%;
  }
}
</style>
