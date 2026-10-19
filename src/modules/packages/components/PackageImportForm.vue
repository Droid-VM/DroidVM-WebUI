<script setup lang="ts">
import AppLinkButton from '../../../shared/ui/AppLinkButton.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePackageImport } from '../model/import'
import { usePackageTransfers } from '../model/transfers'
import type { PackageImportNetworkChoice } from '../model/importForm'
import { taskPercent, taskStateKeys } from '../../tasks'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppCheckbox from '../../../shared/ui/AppCheckbox.vue'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppProgress from '../../../shared/ui/AppProgress.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
const model = usePackageImport(),
  { t, locale } = useI18n()
const result = computed(() => model.entry.value?.task?.packageImport)
const transfers = usePackageTransfers()
const statuses = computed(() => [
  {
    key: 'preview',
    title: 'packageImportPreviewTask',
    entry: model.previewEntry.value,
    description: model.previewEntry.value?.request.source,
  },
  {
    key: 'import',
    title: 'packageImportTask',
    entry: model.entry.value,
    description: model.entry.value?.request.operation.targetDirectory,
  },
])
const staleChoices = computed(() =>
  model.draft.networks.some(
    (choice) => !model.plan.value?.networks.some((row) => row.ref === choice.ref),
  ),
)
const choice = (ref: string) => model.draft.networks.find((row) => row.ref === ref)
const joinedId = (ref: string) => {
  const current = choice(ref)
  return current && 'networkId' in current ? current.networkId : ''
}
function setChoice(value: PackageImportNetworkChoice) {
  const index = model.draft.networks.findIndex((row) => row.ref === value.ref)
  if (index === -1) model.draft.networks.push(value)
  else model.draft.networks[index] = value
}
function action(ref: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value,
    network = model.plan.value?.networks.find((row) => row.ref === ref)
  if (!network) return
  if (value === 'join' && network.candidates[0])
    setChoice({ ref, action: 'join', networkId: network.candidates[0].id })
  else if (value === 'create' && network.createAllowed) setChoice({ ref, action: 'create' })
  else if (value === 'skip') setChoice({ ref, action: 'skip' })
}
function join(ref: string, event: Event) {
  setChoice({ ref, action: 'join', networkId: (event.target as HTMLSelectElement).value })
}
function networkName(ref: string) {
  return model.plan.value?.networks.find((row) => row.ref === ref)?.name || ref
}
function joinedName(ref: string, networkId: string | undefined) {
  return (
    model.plan.value?.networks
      .find((row) => row.ref === ref)
      ?.candidates.find((row) => row.id === networkId)?.name || networkId
  )
}
const actionKeys = {
  join: 'packageImportJoin',
  create: 'packageImportCreate',
  skip: 'packageImportSkip',
} as const
const conflictKeys = {
  ipv4: 'packageImportConflictIpv4',
  ipv6: 'packageImportConflictIpv6',
  uplink: 'packageImportConflictUplink',
  '': 'packageImportCreateUnavailable',
} as const
function bytes(value: string) {
  return BigInt(value).toLocaleString(locale.value)
}
</script>
<template>
  <div class="import-form">
    <h1>{{ t('packageImportTitle') }}</h1>
    <p>{{ t('packageImportHostHint') }}</p>
    <AppLinkButton v-if="transfers.supported.value" tone="tonal" to="/packages/transfers">{{
      t('transferUpload')
    }}</AppLinkButton>
    <p>{{ t('packageExportLeaveHint') }}</p>
    <section v-if="model.previewRecoveryProblem.value">
      <h2>{{ t('packageImportPreviewTask') }}</h2>
      <OperationTrackingNotice
        :problem="model.previewRecoveryProblem.value"
        @clear="model.clearPreviewTracking"
      />
    </section>
    <fieldset
      v-if="model.recoveryProblem.value"
      class="tracking-guard"
      :disabled="model.unresolved.value"
    >
      <h2>{{ t('packageImportTask') }}</h2>
      <OperationTrackingNotice
        :problem="model.recoveryProblem.value"
        @clear="model.clearTracking"
      />
    </fieldset>
    <AppNotice
      v-if="!model.supported.value"
      tone="warning"
      :title="t('packageImportUnavailable')"
    />
    <template v-else>
      <AppTextField
        v-model="model.draft.source"
        :label="t('packageImportSource')"
        :supporting-text="t('packageImportSourceHint')"
        data-testid="package-import-source"
        autocomplete="off"
        placeholder="/storage/emulated/0/DroidVM/export.vmpkg"
        :disabled="!!model.entry.value && model.entry.value.state !== 'done'"
      />
      <AppButton
        data-testid="package-import-preview"
        :disabled="!model.canPreview.value"
        @click="model.readPreview"
        >{{ t('packageImportReadPreview') }}</AppButton
      >
      <p v-if="model.pending.value">{{ t('packageImportPending') }}</p>
      <AppNotice
        v-if="model.recoveryRequired.value"
        tone="warning"
        :title="t('packageImportRecovery')"
      >
        <p>{{ t('packageImportRecoveryHint') }}</p>
        <template v-if="model.entry.value?.state === 'done' && !model.pending.value">
          <AppCheckbox v-model="model.recoveryAcknowledged.value">{{
            t('packageImportRecoveryConfirm')
          }}</AppCheckbox>
          <AppButton
            :disabled="!model.recoveryAcknowledged.value"
            @click="model.restartAfterReview"
            >{{ t('packageImportNewFlow') }}</AppButton
          >
        </template>
      </AppNotice>
      <template v-if="model.plan.value">
        <section class="summary">
          <h2>{{ t('packageImportSummary') }}</h2>
          <dl>
            <dt>{{ t('packageExportVm') }}</dt>
            <dd>{{ model.plan.value.vmName || t('packageImportUnnamed') }}</dd>
            <dt>{{ t('packageImportMasterSource') }}</dt>
            <dd>{{ model.plan.value.source }}</dd>
            <dt>{{ t('packageImportAppVersion') }}</dt>
            <dd>{{ model.plan.value.appVersion }}</dd>
            <dt>{{ t('packageImportManifestVersion') }}</dt>
            <dd>{{ model.plan.value.manifestVersion }}</dd>
            <dt>{{ t('packageExportCompression') }}</dt>
            <dd>{{ model.plan.value.compression }}</dd>
            <dt>{{ t('packageImportVolumes') }}</dt>
            <dd>{{ model.plan.value.volumeCount }}</dd>
            <template v-if="model.plan.value.backend"
              ><dt>{{ t('packageImportBackend') }}</dt>
              <dd>{{ model.plan.value.backend }}</dd></template
            >
            <template v-if="model.plan.value.cpuCount !== undefined"
              ><dt>{{ t('cpu') }}</dt>
              <dd>{{ model.plan.value.cpuCount }}</dd></template
            >
            <template v-if="model.plan.value.memoryMiB !== undefined"
              ><dt>{{ t('memory') }}</dt>
              <dd>{{ model.plan.value.memoryMiB }} MiB</dd></template
            >
          </dl>
          <p v-if="model.plan.value.notes" class="notes">{{ model.plan.value.notes }}</p>
          <h3>{{ t('packageExportDisks') }}</h3>
          <ul>
            <li v-for="(disk, index) in model.plan.value.disks" :key="index">
              {{ disk.name || t('packageImportUnnamed') }} ·
              {{ t('diskBytes', { value: bytes(disk.sizeBytes) }) }} ·
              {{ t(disk.attached ? 'packageImportAttached' : 'packageImportDetached') }} ·
              {{ t(disk.readonly ? 'diskReadOnly' : 'diskReadWrite') }}
            </li>
          </ul>
          <p v-if="!model.plan.value.disks.length">{{ t('packageExportNoDisks') }}</p>
          <h3>{{ t('packageImportBootFiles') }}</h3>
          <ul>
            <li v-for="(boot, index) in model.plan.value.boots" :key="index">
              {{ boot.name || t('packageImportUnnamed') }} · {{ boot.kind }} ·
              {{ t('diskBytes', { value: bytes(boot.sizeBytes) }) }}
            </li>
          </ul>
        </section>
        <form v-if="!model.review.value" @submit.prevent="model.reviewDraft">
          <AppTextField
            v-model="model.draft.targetDirectory"
            :label="t('packageImportTarget')"
            :supporting-text="t('packageImportTargetHint')"
            autocomplete="off"
            placeholder="/storage/emulated/0/DroidVM/imported-vm"
            required
          />
          <fieldset v-for="network in model.plan.value.networks" :key="network.ref">
            <legend>{{ network.name || network.ref }}</legend>
            <p>{{ network.bridgeType }} · {{ network.uplinkMode }}</p>
            <p v-if="!network.createAllowed">{{ t(conflictKeys[network.conflictKind]) }}</p>
            <AppSelect
              :label="t('packageImportNetworkAction')"
              :value="choice(network.ref)?.action ?? ''"
              @change="action(network.ref, $event)"
            >
              <AppOption disabled value="">{{ t('packageImportChooseNetwork') }}</AppOption>
              <AppOption value="join" :disabled="!network.candidates.length">
                {{ t('packageImportJoin') }}
              </AppOption>
              <AppOption value="create" :disabled="!network.createAllowed">
                {{ t('packageImportCreate') }}
              </AppOption>
              <AppOption value="skip">{{ t('packageImportSkip') }}</AppOption>
            </AppSelect>
            <AppSelect
              v-if="choice(network.ref)?.action === 'join'"
              :label="t('packageImportJoinTarget')"
              :value="joinedId(network.ref)"
              @change="join(network.ref, $event)"
            >
              <AppOption disabled value="">{{ t('packageImportChooseNetwork') }}</AppOption>
              <AppOption
                v-for="candidate in network.candidates"
                :key="candidate.id"
                :value="candidate.id"
              >
                {{ candidate.name || candidate.id }}
              </AppOption>
            </AppSelect>
          </fieldset>
          <p v-if="!model.plan.value.networks.length">{{ t('packageImportNoNetworks') }}</p>
          <p v-if="staleChoices">{{ t('packageImportStaleNetworks') }}</p>
          <AppButton
            v-if="model.plan.value.networks.length || staleChoices"
            @click="model.resetNetworks"
            >{{ t('packageImportResetNetworks') }}</AppButton
          >
          <p v-if="!model.valid.value">{{ t('packageImportInvalid') }}</p>
          <AppButton
            type="submit"
            tone="primary"
            :disabled="!model.valid.value || !model.allowed.value"
            >{{ t('packageImportReview') }}</AppButton
          >
        </form>
        <section v-else class="review">
          <h2>{{ t('packageImportReview') }}</h2>
          <dl>
            <dt>{{ t('packageImportMasterSource') }}</dt>
            <dd>{{ model.plan.value.source }}</dd>
            <dt>{{ t('packageImportTarget') }}</dt>
            <dd>{{ model.review.value.operation.targetDirectory }}</dd>
          </dl>
          <ul>
            <li v-for="network in model.review.value.operation.networks" :key="network.ref">
              {{ networkName(network.ref) }} · {{ t(actionKeys[network.action])
              }}<span v-if="network.action === 'join'">
                · {{ joinedName(network.ref, network.networkId) }}</span
              >
            </li>
          </ul>
          <p>{{ t('packageImportConfirmHint') }}</p>
          <AppCheckbox v-model="model.acknowledged.value">{{
            t('packageImportConfirm')
          }}</AppCheckbox>
          <div class="buttons">
            <AppButton @click="model.cancelReview">{{ t('diskBackToForm') }}</AppButton
            ><AppButton
              tone="primary"
              :disabled="!model.acknowledged.value || !model.allowed.value"
              @click="model.submit"
              >{{ t('packageImportStart') }}</AppButton
            >
          </div>
        </section>
      </template>
      <template v-for="status in statuses" :key="status.key">
        <section
          v-if="status.entry"
          class="status"
          aria-live="polite"
          :data-testid="`package-${status.key}-receipt`"
        >
          <h2>{{ t(status.title) }}</h2>
          <p v-if="status.entry.restored">
            {{
              t(
                status.key === 'preview'
                  ? 'packagePreviewRecoveryHint'
                  : 'packageImportRecoveryHintRestored',
              )
            }}
          </p>
          <p>{{ status.description }}</p>
          <p v-if="status.entry.state === 'posting'">{{ t('processing') }}</p>
          <p v-if="status.entry.state === 'unknown'">{{ t('packageImportUnknown') }}</p>
          <p v-if="status.entry.task">{{ t(taskStateKeys[status.entry.task.state]) }}</p>
          <AppProgress
            v-if="status.entry.task && status.entry.state === 'waiting'"
            :label="t(status.title)"
            :value="taskPercent(status.entry.task)"
          />
          <p v-if="status.entry.task?.errorCode">{{ status.entry.task.errorCode }}</p>
          <AppNotice
            v-if="status.entry.problem"
            tone="error"
            :title="t(status.entry.problem.titleKey)"
            ><p>{{ t(status.entry.problem.descriptionKey) }}</p></AppNotice
          >
          <AppButton
            v-if="status.entry.state !== 'done'"
            :data-testid="`package-${status.key}-query`"
            :disabled="model.checking.value || status.entry.state === 'posting'"
            @click="model.reconcile"
            >{{ t('queryStatus') }}</AppButton
          >
          <template v-if="status.key === 'import'">
            <template v-if="result">
              <p>
                {{ t('packageImportFileProgress', { done: result.done, total: result.total }) }}
              </p>
              <p>
                {{
                  t(
                    result.registered
                      ? 'packageImportRegistered'
                      : result.registrationUncertain
                        ? 'packageImportRegistrationUnknown'
                        : 'packageImportNotRegistered',
                  )
                }}
              </p>
              <p>
                {{
                  t(
                    result.cleanupComplete
                      ? 'packageImportCleanupComplete'
                      : 'packageImportCleanupIncomplete',
                  )
                }}
              </p>
              <p v-if="result.retainedDirectory">
                {{ t('packageImportRetained') }}: {{ result.retainedDirectory }}
              </p>
              <p v-if="result.recoveryRequired">{{ t('packageImportRecoveryHint') }}</p>
              <AppLinkButton
                v-if="result.registered && !result.registrationUncertain && result.vmId"
                tone="tonal"
                :to="`/vms/${encodeURIComponent(result.vmId)}`"
                >{{ t('packageImportOpenVm') }}</AppLinkButton
              >
              <AppLinkButton
                v-else-if="result.registrationUncertain && result.vmId"
                tone="tonal"
                :to="`/vms/${encodeURIComponent(result.vmId)}`"
                >{{ t('packageImportInspectVm') }}</AppLinkButton
              >
            </template>
            <p
              v-if="
                status.entry.task?.state === 'failed' || status.entry.task?.state === 'cancelled'
              "
            >
              {{ t('packageImportFailureHint') }}
            </p>
          </template>
          <AppLinkButton tone="tonal" to="/tasks">{{ t('diskTaskLink') }}</AppLinkButton>
        </section>
      </template>
    </template>
  </div>
</template>
<style scoped>
.import-form,
form,
section,
fieldset {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
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
  font-size: var(--md-sys-typescale-title-medium-size);
}
.summary,
.review,
.status,
fieldset {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: var(--space-3);
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
ul {
  padding-inline-start: var(--space-4);
  margin: 0;
}
.notes {
  white-space: pre-wrap;
}
.tracking-guard {
  border: 0;
  margin: 0;
  padding: 0;
}
@media (width < 480px) {
  .buttons > *,
  .import-form > .btn,
  form > .btn {
    width: 100%;
  }
}
</style>
