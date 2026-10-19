<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { parse } from 'lossless-json'
import { useConfigurationEditor } from '../model/editor'
import { configGroups, type ConfigField } from '../model/fields'
import { configurationSections } from '../model/sections'
import { screenInactive, screenIssues } from '../model/screens'
import { storageInactive, storageIssues, storageValue } from '../model/storage'
import {
  canAddDevice,
  audioDeviceKey,
  editDevice,
  endpointCount,
  hasMissingSerials,
  peripheralInactive,
  peripheralIssues,
  peripheralValueLabel,
  PeripheralEditError,
  selectSerialConsole,
  type DeviceEdit,
  type DeviceKind,
} from '../model/peripherals'
import {
  editForward,
  forwardPath,
  networkInactive,
  networkIssues,
  offsetSlot,
  suggestLeaseOffset,
  type LeaseSlot,
} from '../model/networks'
import type { MessageKey } from '../../../shared/i18n'
import {
  graphicsInactive,
  graphicsIssues,
  graphicsValue,
  gpuCoreOverlap,
  normalizeGraphics,
} from '../model/graphics'
import { newMacAddress } from '../model/identity'
import {
  basicInactive,
  basicIssue,
  basicOptions,
  basicSelection,
  normalizeProtection,
} from '../model/basic'
import BasicAdvanced from './BasicAdvanced.vue'
import HostCapabilities from './HostCapabilities.vue'
import SoundPurposeEditor from './SoundPurposeEditor.vue'
import {
  bootDiskIndex,
  diskChoices,
  editAttachment,
  remapAttachmentInputs,
  remapIndexedInputs,
  selectBootDisk,
  type AttachmentEdit,
  type AttachmentSlot,
} from '../model/attachments'
import { cloneConfiguration, fieldText, getPath, object, setPath } from '../model/document'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppCheckbox from '../../../shared/ui/AppCheckbox.vue'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog.vue'
import FilterGroup from '../../../shared/ui/FilterGroup.vue'
import { useVisiblePolling } from '../../../shared/model/visiblePolling'
import {
  ResourcePicker,
  AudioDevicePicker,
  CpuCorePicker,
  useResourceCatalog,
  type DiskResource,
  type NetworkResource,
} from '../../resources'

const props = defineProps<{ editable: boolean }>()
const { t } = useI18n()
const editor = useConfigurationEditor()
const catalog = useResourceCatalog()
const { draft, state, problem, task, dirty } = editor
const confirm = ref<'save' | 'delete' | 'reload' | null>(null)
const category = ref('configBasic')
const gpuCpuField: ConfigField = {
  path: ['gpu_cgroup_cpus'],
  label: 'configGpuCores',
  type: 'text',
}
function chooseGpuCpus(value: string) {
  if (disabled.value || rawOpen.value) return
  const input = form.value?.querySelector<HTMLInputElement>('[data-config-path="gpu_cgroup_cpus"]')
  if (!input) return
  input.value = value
  commitField(gpuCpuField, input)
}
useVisiblePolling(
  () => category.value === 'configPeripheral' && catalog.audio.supported.value,
  () => catalog.audio.refresh(),
)
const replacement = ref<AttachmentSlot | null>(null)
const bootChanged = ref(false)
const protectionChanged = ref(false)
const graphicsChanged = ref(false)
const deviceKind = ref<DeviceKind>('virtio_sound')
// Material fields are form-associated, so they match :invalid like native controls.
const invalidControls =
  ':is(input, select, textarea, md-outlined-text-field, md-outlined-select, md-checkbox):invalid'
const peripheralProblem = ref<MessageKey | null>(null)
const basicAdvanced = ref<InstanceType<typeof BasicAdvanced>[]>([])
const bootDisks = computed(() => (draft.value ? diskChoices(draft.value) : []))
const selectedBootDisk = computed(() => (draft.value ? bootDiskIndex(draft.value) : null))
const imageBoot = computed(
  () =>
    draft.value &&
    fieldText(getPath(draft.value, ['boot', 'protocol'])).toLowerCase() === 'linux' &&
    fieldText(getPath(draft.value, ['boot', 'linux', 'source'])).toLowerCase() === 'image',
)
watch(category, () => {
  replacement.value = null
})
const categories = computed(() =>
  configGroups.map((group) => ({
    value: group.label,
    label: t(group.label),
  })),
)
const rawOpen = ref(false),
  raw = ref(''),
  invalid = ref(false),
  rawInvalid = ref(false)
const form = ref<HTMLFormElement>()
const fieldInputs = ref<Record<string, string>>({})
// Keep live text separate from committed/invalid numeric values. Resource
// refreshes may rerender the form before the focused input emits change.
const pendingInputs = ref<Record<string, string>>({})
const leaseFeedback = ref<{ path: string; message: MessageKey } | null>(null)
watch(state, (value) => {
  if (value === 'loading' || value === 'idle') {
    rawOpen.value = false
    raw.value = ''
    invalid.value = false
    rawInvalid.value = false
    fieldInputs.value = {}
    pendingInputs.value = {}
    leaseFeedback.value = null
    replacement.value = null
    bootChanged.value = false
    protectionChanged.value = false
    graphicsChanged.value = false
    peripheralProblem.value = null
  }
})
const disabled = computed(() => !props.editable || state.value !== 'editing')
const read = (field: ConfigField) =>
  draft.value
    ? field.path[0] === 'shared_dirs'
      ? storageValue(field, draft.value)
      : graphicsValue(field, draft.value)
    : undefined
const inactive = (field: ConfigField) =>
  !!draft.value &&
  (basicInactive(field, draft.value) ||
    screenInactive(field, draft.value) ||
    graphicsInactive(field, draft.value) ||
    peripheralInactive(field, draft.value) ||
    storageInactive(field, draft.value) ||
    networkInactive(field, draft.value, catalog.networks.items.value))
function inputText(field: ConfigField) {
  const label = draft.value && peripheralValueLabel(field, draft.value)
  if (label) return t(label)
  const stored = fieldText(read(field))
  return (
    pendingInputs.value[field.path.join('.')] ??
    fieldInputs.value[field.path.join('.')] ??
    (field.emptyValue !== undefined && stored === String(field.emptyValue) ? '' : stored)
  )
}
function appendResource(key: 'disks' | 'networks', value: Record<string, unknown>) {
  if (!draft.value || disabled.value || rawOpen.value) return
  const existing = draft.value[key]
  if (existing !== undefined && !Array.isArray(existing)) {
    invalid.value = true
    return
  }
  const row = cloneConfiguration(draft.value)
  setPath(row, [key], [...(Array.isArray(row[key]) ? row[key] : []), value])
  editor.replace(row)
}
function attachDisk(value: DiskResource) {
  if (replacement.value?.collection === 'disks' && value.selectable) {
    const fields: Record<string, unknown> = { path: value.path, readonly: true }
    const bus = draft.value
      ? fieldText(
          getPath(draft.value, ['disks', String(replacement.value.index), 'bus']),
        ).toLowerCase()
      : ''
    if (/\.iso$/i.test(value.path)) fields.bus = 'cdrom'
    else if (bus === 'cdrom') fields.bus = 'virtio'
    void mutateAttachment(replacement.value, { type: 'replace', fields })
    return
  }
  if (value.selectable)
    appendResource('disks', {
      path: value.path,
      bus: /\.iso$/i.test(value.path) ? 'cdrom' : 'virtio',
      readonly: true,
    })
}
function attachNetwork(value: NetworkResource) {
  if (replacement.value?.collection === 'networks') {
    void mutateAttachment(replacement.value, { type: 'replace', fields: { network_id: value.id } })
    return
  }
  appendResource('networks', {
    network_id: value.id,
    mac_address: newMacAddress(),
  })
}
async function syncValidity() {
  await nextTick()
  const issues = draft.value
    ? {
        ...screenIssues(draft.value),
        ...graphicsIssues(draft.value),
        ...peripheralIssues(draft.value),
        ...storageIssues(draft.value),
        ...networkIssues(draft.value, catalog.networks.items.value, editor.peerLeases.value),
      }
    : {}
  form.value
    ?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-config-path]')
    .forEach((input) => {
      const issue = draft.value
        ? (basicIssue(draft.value, input.dataset.configPath!) ?? issues[input.dataset.configPath!])
        : undefined
      input.setCustomValidity(
        Object.hasOwn(fieldInputs.value, input.dataset.configPath!)
          ? t('configInvalid')
          : issue
            ? t(issue)
            : '',
      )
    })
  for (const component of basicAdvanced.value) component.validate()
  invalid.value = !(form.value?.checkValidity() ?? true)
}
watch(catalog.networks.items, () => {
  void syncValidity()
})
async function mutateForward(slot: LeaseSlot, remove?: number) {
  if (
    !draft.value ||
    disabled.value ||
    rawOpen.value ||
    networkInactive(
      { path: [...forwardPath(slot), '0', 'host'], label: 'configForwardHost', type: 'text' },
      draft.value,
      catalog.networks.items.value,
    )
  )
    return
  const changed = editForward(draft.value, slot, remove)
  fieldInputs.value = remapIndexedInputs(
    fieldInputs.value,
    forwardPath(slot).join('.') + '.',
    changed.order,
  )
  pendingInputs.value = remapIndexedInputs(
    pendingInputs.value,
    forwardPath(slot).join('.') + '.',
    changed.order,
  )
  editor.replace(changed.document)
  await syncValidity()
}
async function mutateDevice(operation: DeviceEdit) {
  if (!draft.value || disabled.value || rawOpen.value) return
  peripheralProblem.value = null
  try {
    const changed = editDevice(draft.value, operation)
    fieldInputs.value = remapIndexedInputs(fieldInputs.value, changed.prefix, changed.order)
    pendingInputs.value = remapIndexedInputs(pendingInputs.value, changed.prefix, changed.order)
    editor.replace(changed.document)
    await syncValidity()
  } catch (cause) {
    if (!(cause instanceof PeripheralEditError)) throw cause
    peripheralProblem.value = cause.key
  }
}
function changeAdvanced(row: Record<string, unknown>) {
  if (disabled.value || rawOpen.value) return
  editor.replace(row)
  void syncValidity()
}
async function mutateAttachment(slot: AttachmentSlot, operation: AttachmentEdit) {
  if (!draft.value || disabled.value || rawOpen.value) return
  const changed = editAttachment(draft.value, slot, operation)
  leaseFeedback.value = null
  fieldInputs.value = remapAttachmentInputs(fieldInputs.value, slot.collection, changed.order)
  pendingInputs.value = remapAttachmentInputs(pendingInputs.value, slot.collection, changed.order)
  bootChanged.value ||= changed.bootChanged
  replacement.value = null
  editor.replace(changed.document)
  await syncValidity()
}
function addDirectory() {
  if (!draft.value || disabled.value || rawOpen.value) return
  const current = draft.value.shared_dirs
  if (current !== undefined && !Array.isArray(current)) {
    invalid.value = true
    return
  }
  const row = cloneConfiguration(draft.value)
  setPath(
    row,
    ['shared_dirs'],
    [...(Array.isArray(row.shared_dirs) ? row.shared_dirs : []), { path: '', tag: '', type: 'fs' }],
  )
  editor.replace(row)
}
function selectBoot(event: Event) {
  if (!draft.value || disabled.value || rawOpen.value) return
  editor.replace(selectBootDisk(draft.value, Number((event.target as HTMLSelectElement).value)))
  void syncValidity()
}
async function beginReplacement(slot: AttachmentSlot) {
  if (disabled.value || rawOpen.value) return
  replacement.value = slot
  await nextTick()
  form.value
    ?.querySelector<HTMLSelectElement>(
      `fieldset[data-category="${category.value}"] .resource-picker :is(select, md-outlined-select)`,
    )
    ?.focus()
}
function captureInput(field: ConfigField, event: Event) {
  if (disabled.value || rawOpen.value || field.readonly || inactive(field)) return
  pendingInputs.value[field.path.join('.')] = (event.target as HTMLInputElement).value
  editor.markDirty()
}
function change(field: ConfigField, event: Event) {
  commitField(field, event.target as HTMLInputElement)
}
async function chooseLeaseOffset(field: ConfigField) {
  if (!draft.value || disabled.value || rawOpen.value || inactive(field)) return
  const slot = offsetSlot(field)
  if (!slot) return
  const suggestion = suggestLeaseOffset(
    draft.value,
    slot,
    catalog.networks.items.value,
    editor.peerLeases.value,
  )
  const path = field.path.join('.')
  if ('problem' in suggestion) {
    leaseFeedback.value = { path, message: suggestion.problem }
    return
  }
  const row = cloneConfiguration(draft.value)
  setPath(row, field.path, parse(suggestion.offset))
  delete fieldInputs.value[path]
  delete pendingInputs.value[path]
  editor.replace(row)
  leaseFeedback.value = { path, message: 'configLeaseOffsetChosen' }
  await syncValidity()
}
function commitField(field: ConfigField, input: HTMLInputElement) {
  if (!draft.value || disabled.value || field.readonly || inactive(field)) return
  leaseFeedback.value = null
  delete pendingInputs.value[field.path.join('.')]
  let value: unknown = field.type === 'boolean' ? input.checked : input.value
  if (
    field.path[0] === 'shared_dirs' &&
    ['path', 'tag'].includes(field.path[2] ?? '') &&
    typeof value === 'string'
  )
    value = value.trim()
  if (field.path[0] === 'networks' && field.path[3] === 'forwards' && typeof value === 'string')
    value = value.trim()
  if (field.type === 'number') {
    const key = field.path.join('.')
    fieldInputs.value[key] = input.value
    if (input.value === '' && field.emptyValue !== undefined) {
      value = field.emptyValue
    } else if (
      !/^(0|[1-9][0-9]*)$/.test(input.value) ||
      BigInt(input.value) < BigInt(field.min ?? 0) ||
      BigInt(input.value) > BigInt(field.max ?? '9223372036854775807')
    ) {
      input.setCustomValidity(t('configInvalid'))
      invalid.value = true
      editor.markDirty()
      return
    } else value = parse(input.value)
    delete fieldInputs.value[key]
  }
  if (field.path[0] === 'disks' && field.path[2] === 'path') {
    void mutateAttachment(
      { collection: 'disks', index: Number(field.path[1]) },
      { type: 'replace', fields: { path: value } },
    )
    return
  }
  const row = cloneConfiguration(draft.value)
  setPath(row, field.path, value)
  selectSerialConsole(row, field.path, value)
  if (field.path[0] === 'networks' && field.path[3] === 'enabled' && value === true) {
    const offsetPath = [...field.path.slice(0, 3), 'offset'],
      key = offsetPath.join('.')
    const slot = offsetSlot({ ...field, path: offsetPath })
    const currentOffset = getPath(row, offsetPath)
    // Match App's first-enable convenience, without overwriting a typed value
    // or changing an existing assignment just because its network refreshed.
    if (
      slot &&
      (currentOffset === undefined || currentOffset === null) &&
      !Object.hasOwn(fieldInputs.value, key) &&
      !Object.hasOwn(pendingInputs.value, key)
    ) {
      const suggestion = suggestLeaseOffset(
        row,
        slot,
        catalog.networks.items.value,
        editor.peerLeases.value,
      )
      if ('offset' in suggestion) setPath(row, offsetPath, parse(suggestion.offset))
      else leaseFeedback.value = { path: key, message: suggestion.problem }
    }
  }
  if (field.path.length === 1 && ['backend', 'hypervisor'].includes(field.path[0]!)) {
    const adjusted = normalizeProtection(row)
    protectionChanged.value ||= adjusted
  }
  if (field.path[0] === 'protected_vm') protectionChanged.value = false
  if (field.path.length === 1) {
    const { adjusted, resetInputs } = normalizeGraphics(row, field.path[0]!)
    for (const path of resetInputs) {
      delete fieldInputs.value[path]
      delete pendingInputs.value[path]
    }
    graphicsChanged.value ||= adjusted
  }
  editor.replace(row)
  input.setCustomValidity('')
  void syncValidity()
}
async function requestSave() {
  if (disabled.value || rawOpen.value || !form.value) return
  // Enter can submit while an input is still focused, before a change event.
  if (draft.value) {
    const fields = configGroups.flatMap((group) =>
      configurationSections(group, draft.value!, catalog.networks.items.value).flatMap(
        (section) => section.fields,
      ),
    )
    for (const field of fields) {
      const path = field.path.join('.')
      if (!Object.hasOwn(pendingInputs.value, path)) continue
      const input = Array.from(
        form.value.querySelectorAll<HTMLInputElement>('[data-config-path]'),
      ).find((element) => element.dataset.configPath === path)
      if (input && !input.disabled) commitField(field, input)
    }
  }
  await syncValidity()
  if (disabled.value || rawOpen.value || !form.value) return
  const firstInvalid = form.value.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(invalidControls)
  if (firstInvalid) {
    category.value = firstInvalid.closest<HTMLElement>('[data-category]')!.dataset.category!
    await nextTick()
    firstInvalid.reportValidity()
    firstInvalid.focus()
    invalid.value = true
    return
  }
  if (
    form.value?.reportValidity() &&
    draft.value &&
    typeof draft.value.name === 'string' &&
    draft.value.name.trim()
  )
    confirm.value = 'save'
}
function editRaw() {
  peripheralProblem.value = null
  leaseFeedback.value = null
  replacement.value = null
  raw.value = editor.exportJson()
  rawOpen.value = true
  rawInvalid.value = false
}
function cancelRaw() {
  rawOpen.value = false
  rawInvalid.value = false
}
async function applyRaw() {
  try {
    const row = parse(raw.value)
    if (
      !object(row) ||
      row.id !== editor.target.value ||
      typeof row.name !== 'string' ||
      !row.name.trim()
    )
      throw new Error('Invalid VM')
    editor.replace(row)
    replacement.value = null
    bootChanged.value = false
    protectionChanged.value = false
    graphicsChanged.value = false
    fieldInputs.value = {}
    pendingInputs.value = {}
    rawOpen.value = false
    rawInvalid.value = false
    await nextTick()
    await syncValidity()
  } catch {
    rawInvalid.value = true
  }
}
function download() {
  const url = URL.createObjectURL(new Blob([editor.exportJson()], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `droidvm-${editor.target.value}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function confirmed() {
  const operation = confirm.value
  confirm.value = null
  if (operation === 'reload') await editor.reload()
  else await editor.save(operation === 'delete')
}
</script>

<template>
  <section class="configuration" :aria-busy="['loading', 'staging', 'pending'].includes(state)">
    <OperationTrackingNotice
      :problem="editor.recoveryProblem.value"
      @clear="editor.clearTracking"
    />
    <p v-if="editor.restored.value" role="status">{{ t('configurationRestoredReceipt') }}</p>
    <AppNotice v-if="editor.creating.value && draft" tone="info" :title="t('createVm')">
      <p>{{ t('configNewHint') }}</p>
    </AppNotice>
    <AppNotice v-if="editor.copying.value && draft" tone="info" :title="t('configCopyReview')">
      <p>{{ t('configCopyIdentityHint') }}</p>
      <p>{{ t('configCopyResourcesHint') }}</p>
    </AppNotice>
    <AppNotice v-if="!editable" tone="warning" :title="t('configStoppedOnly')" />
    <AppNotice v-if="problem" tone="error" :title="t(problem.titleKey)"
      ><p>{{ t(problem.descriptionKey) }}</p></AppNotice
    >
    <AppNotice v-if="invalid || rawInvalid" tone="error" :title="t('configInvalid')" />
    <AppNotice v-if="peripheralProblem" tone="error" :title="t(peripheralProblem)" />
    <AppNotice v-if="state === 'saved'" tone="info" :title="t('configSaved')" />
    <AppNotice v-if="protectionChanged" tone="info" :title="t('configProtectionChanged')" />
    <AppNotice v-if="graphicsChanged" tone="info" :title="t('configGraphicsAdjusted')" />
    <AppNotice v-if="bootChanged" tone="warning" :title="t('configBootDiskChanged')">
      <AppButton @click="category = 'configBoot'">{{ t('configReviewBoot') }}</AppButton>
    </AppNotice>
    <AppNotice
      v-if="state === 'unknown' || state === 'blocked'"
      tone="warning"
      :title="t(state === 'unknown' ? 'configUnknown' : 'configBlocked')"
    >
      <p v-if="draft">{{ t('configKeepDraft') }}</p>
      <p v-if="state === 'unknown'">{{ t('configurationMissingReceipt') }}</p>
      <p v-if="task?.errorCode">{{ task.errorCode }}</p>
      <AppButton v-if="state === 'unknown'" @click="editor.reconcile">{{
        t('queryStatus')
      }}</AppButton>
    </AppNotice>
    <p v-if="['loading', 'staging', 'pending'].includes(state)" role="status">
      {{ t('processing') }}
    </p>
    <AppButton v-if="state === 'error'" @click="editor.reload">{{ t('configReload') }}</AppButton>
    <AppButton
      v-if="state === 'blocked' && !draft && task && ['failed', 'cancelled'].includes(task.state)"
      @click="editor.reload"
      >{{ t('configReload') }}</AppButton
    >
    <div v-if="draft" class="config-toolbar">
      <AppButton tone="primary" :disabled="disabled || !dirty || rawOpen" @click="requestSave">{{
        t('configSave')
      }}</AppButton>
      <AppButton
        :disabled="['staging', 'pending', 'unknown'].includes(state)"
        @click="confirm = 'reload'"
        >{{ t('configReload') }}</AppButton
      >
      <AppButton @click="download">{{ t('configExport') }}</AppButton>
      <AppButton :disabled="disabled || rawOpen" @click="editRaw">{{
        t('configEditJson')
      }}</AppButton>
      <AppButton
        v-if="!editor.newDraft.value"
        :disabled="disabled || rawOpen"
        @click="confirm = 'delete'"
        >{{ t('configDelete') }}</AppButton
      >
    </div>
    <section v-if="draft && rawOpen" class="config-advanced">
      <label class="raw-label"
        ><span>{{ t('configAdvanced') }}</span
        ><textarea
          v-model="raw"
          rows="18"
          spellcheck="false"
          :disabled="disabled"
          @input="editor.markDirty"
        />
      </label>
      <p class="muted">{{ t('configAdvancedHint') }}</p>
      <AppButton :disabled="disabled" @click="applyRaw">{{ t('configApplyDraft') }}</AppButton>
      <AppButton @click="cancelRaw">{{ t('cancel') }}</AppButton>
    </section>
    <FilterGroup
      v-if="draft"
      v-model="category"
      class="config-categories"
      :label="t('configCategories')"
      :options="categories"
    />
    <form v-if="draft" ref="form" novalidate @submit.prevent="requestSave">
      <button type="submit" hidden :disabled="disabled || rawOpen || !dirty">
        {{ t('configSave') }}
      </button>
      <fieldset
        v-for="group in configGroups"
        v-show="category === group.label"
        :key="group.label"
        :data-category="group.label"
        :disabled="disabled || rawOpen"
      >
        <legend>{{ t(group.label) }}</legend>
        <HostCapabilities
          v-if="group.label === 'configBasic' || group.label === 'configGraphics'"
          :document="draft"
          :section="group.label === 'configBasic' ? 'basic' : 'graphics'"
          :active="category === group.label"
        />
        <p v-if="group.label === 'configNetwork'" class="muted">
          {{ t('configNetworkLeaseHint') }}
        </p>
        <AppNotice
          v-if="group.label === 'configGraphics' && gpuCoreOverlap(draft)"
          tone="warning"
          :title="t('configGpuCoreOverlap')"
        />
        <p v-if="group.label === 'configStorage' || group.label === 'configNetwork'" class="muted">
          {{ t('configDetachHint') }}
        </p>
        <p v-if="replacement && category === group.label" role="status">
          {{ t('configReplaceTarget', { index: replacement.index + 1 }) }}
        </p>
        <ResourcePicker
          v-if="group.label === 'configStorage' && category === group.label"
          :key="`disk-${replacement?.index ?? 'add'}`"
          kind="disk"
          :replacing="replacement?.collection === 'disks'"
          :disabled="disabled || rawOpen"
          @disk="attachDisk"
          @cancel="replacement = null"
        />
        <ResourcePicker
          v-if="group.label === 'configNetwork' && category === group.label"
          :key="`network-${replacement?.index ?? 'add'}`"
          kind="network"
          :replacing="replacement?.collection === 'networks'"
          :disabled="disabled || rawOpen"
          @network="attachNetwork"
          @cancel="replacement = null"
        />
        <p v-if="group.label === 'configNetwork'" class="muted">
          {{ t('configLeaseAllocationHint') }}
        </p>
        <AppButton
          v-if="group.label === 'configStorage'"
          :disabled="disabled || rawOpen"
          @click="addDirectory"
          >{{ t('configAddDirectory') }}</AppButton
        >
        <div v-if="group.label === 'configPeripheral'" class="config-fields">
          <div>
            <p class="muted">
              {{
                t(
                  !catalog.audio.supported.value || catalog.audio.status.value === 'error'
                    ? 'audioCatalogueUnavailable'
                    : catalog.audio.status.value === 'loading'
                      ? 'processing'
                      : 'audioCatalogueHint',
                )
              }}
            </p>
            <AppButton
              v-if="catalog.audio.supported.value"
              :disabled="catalog.audio.status.value === 'loading'"
              @click="catalog.audio.refresh()"
              >{{ t('audioRefreshDevices') }}</AppButton
            >
          </div>
          <div class="config-field">
            <AppSelect
              v-model="deviceKind"
              :label="t('configAddDevice')"
              :disabled="disabled || rawOpen"
            >
              <AppOption value="virtio_sound">{{ t('configDeviceSound') }}</AppOption>
              <AppOption value="xhci_usb">{{ t('configDeviceXhci') }}</AppOption>
              <AppOption value="sbsa">{{ t('configDeviceSbsa') }}</AppOption>
              <AppOption value="virtio_console">{{ t('configDeviceVirtioConsole') }}</AppOption>
            </AppSelect>
            <AppButton
              :disabled="disabled || rawOpen || !canAddDevice(draft, deviceKind)"
              @click="mutateDevice({ type: 'add', kind: deviceKind })"
              >{{ t('configAddDevice') }}</AppButton
            >
          </div>
          <AppButton
            v-if="hasMissingSerials(draft)"
            :disabled="disabled || rawOpen"
            @click="mutateDevice({ type: 'serial-defaults' })"
            >{{ t('configRestoreSerials') }}</AppButton
          >
        </div>
        <section
          v-for="section in configurationSections(group, draft, catalog.networks.items.value)"
          :key="section.key"
          class="config-section"
          :data-attachment="section.slot ? section.key : undefined"
          :data-section="section.key"
        >
          <h3 v-if="section.label">
            {{ t(section.label) }} <span v-if="section.identity">{{ section.identity }}</span>
          </h3>
          <div v-if="section.slot" class="config-toolbar">
            <AppButton
              v-if="section.slot.collection !== 'shared_dirs' && section.fields.length"
              :disabled="disabled || rawOpen"
              @click="beginReplacement(section.slot)"
              >{{ t('configReplaceAttachment') }}</AppButton
            >
            <AppButton
              v-if="section.slot.collection === 'disks'"
              :disabled="disabled || rawOpen || section.slot.index === 0"
              @click="mutateAttachment(section.slot, { type: 'move', to: section.slot.index - 1 })"
              >{{ t('configMoveUp') }}</AppButton
            >
            <AppButton
              v-if="section.slot.collection === 'disks'"
              :disabled="
                disabled ||
                rawOpen ||
                !Array.isArray(draft.disks) ||
                section.slot.index === draft.disks.length - 1
              "
              @click="mutateAttachment(section.slot, { type: 'move', to: section.slot.index + 1 })"
              >{{ t('configMoveDown') }}</AppButton
            >
            <AppButton
              :disabled="disabled || rawOpen"
              @click="mutateAttachment(section.slot, { type: 'remove' })"
              >{{ t('configRemoveAttachment') }}</AppButton
            >
          </div>
          <p v-if="section.hint" class="muted">{{ t(section.hint) }}</p>
          <div
            v-if="section.device || section.endpoint || section.soundCard !== undefined"
            class="config-toolbar"
          >
            <AppButton
              v-if="section.device"
              :disabled="disabled || rawOpen"
              @click="mutateDevice({ type: 'remove', slot: section.device })"
              >{{ t('configRemoveAttachment') }}</AppButton
            >
            <template v-if="section.soundCard !== undefined">
              <AppButton
                :disabled="
                  disabled || rawOpen || endpointCount(draft, section.soundCard, 'speaker') >= 4
                "
                @click="
                  mutateDevice({ type: 'endpoint-add', card: section.soundCard, mode: 'speaker' })
                "
                >{{ t('configAddSpeaker') }}</AppButton
              >
              <AppButton
                :disabled="
                  disabled || rawOpen || endpointCount(draft, section.soundCard, 'microphone') >= 4
                "
                @click="
                  mutateDevice({
                    type: 'endpoint-add',
                    card: section.soundCard,
                    mode: 'microphone',
                  })
                "
                >{{ t('configAddMicrophone') }}</AppButton
              >
            </template>
            <template v-if="section.endpoint">
              <AppButton
                :disabled="disabled || rawOpen"
                @click="mutateDevice({ type: 'endpoint-remove', slot: section.endpoint })"
                >{{ t('configRemoveAttachment') }}</AppButton
              >
            </template>
          </div>
          <AudioDevicePicker
            v-if="section.endpoint && section.raw === undefined"
            :current="
              audioDeviceKey(
                getPath(draft, [
                  'peripherals',
                  String(section.endpoint.card),
                  'endpoints',
                  String(section.endpoint.index),
                  'host_device',
                ]),
              )
            "
            :saved-label="
              fieldText(
                getPath(draft, [
                  'peripherals',
                  String(section.endpoint.card),
                  'endpoints',
                  String(section.endpoint.index),
                  'host_label',
                ]),
              )
            "
            :input="
              fieldText(
                getPath(draft, [
                  'peripherals',
                  String(section.endpoint.card),
                  'endpoints',
                  String(section.endpoint.index),
                  'mode',
                ]),
              ).toLowerCase() === 'microphone'
            "
            :disabled="disabled || rawOpen"
            @select="
              mutateDevice({ type: 'endpoint-bind', slot: section.endpoint!, device: $event })
            "
          />
          <SoundPurposeEditor
            v-if="section.endpoint && section.raw === undefined"
            :endpoint="
              getPath(draft, [
                'peripherals',
                String(section.endpoint.card),
                'endpoints',
                String(section.endpoint.index),
              ])
            "
            :disabled="disabled || rawOpen"
            @change="mutateDevice({ type: 'endpoint-purpose', slot: section.endpoint!, ...$event })"
          />
          <AppButton
            v-if="section.lease"
            :disabled="disabled || rawOpen"
            @click="mutateForward(section.lease)"
            >{{ t('configAddForward') }}</AppButton
          >
          <AppButton
            v-if="section.forward"
            :disabled="disabled || rawOpen"
            @click="mutateForward(section.forward, section.forward.index)"
            >{{ t('configRemoveForward') }}</AppButton
          >
          <template v-if="section.raw !== undefined">
            <p class="muted">{{ t('configUnsupportedShape') }}</p>
            <pre class="config-unsupported">{{ section.raw }}</pre>
          </template>
          <p v-else-if="!section.fields.length && !section.lease && !section.hint" class="muted">
            {{ t('configNoEntries') }}
          </p>
          <div class="config-fields">
            <div
              v-for="field in section.fields"
              v-show="
                (field.path[2] === 'enabled' || !screenInactive(field, draft)) &&
                !graphicsInactive(field, draft) &&
                !peripheralInactive(field, draft) &&
                !storageInactive(field, draft) &&
                (field.path[3] === 'enabled' ||
                  !networkInactive(field, draft, catalog.networks.items.value))
              "
              :key="field.path.join('.')"
              class="config-field"
            >
              <AppCheckbox
                v-if="field.type === 'boolean'"
                :data-config-path="field.path.join('.')"
                :disabled="inactive(field)"
                :checked="read(field) === true"
                :indeterminate="typeof read(field) !== 'boolean'"
                :title="typeof read(field) !== 'boolean' ? t('configNativeDefault') : undefined"
                @change="change(field, $event)"
                >{{ t(field.label) }}</AppCheckbox
              >
              <AppSelect
                v-else-if="field.type === 'boot-disk'"
                :label="t(field.label)"
                :value="selectedBootDisk === null ? '' : String(selectedBootDisk)"
                :required="!!imageBoot"
                @change="selectBoot"
              >
                <AppOption value="" disabled>{{ t('configNoBootDisk') }}</AppOption>
                <AppOption v-for="disk in bootDisks" :key="disk.index" :value="String(disk.index)">
                  {{ disk.index + 1 }} · {{ disk.path }}
                </AppOption>
              </AppSelect>
              <AppSelect
                v-else-if="field.type === 'select'"
                :label="t(field.label)"
                :data-config-path="field.path.join('.')"
                :disabled="inactive(field)"
                :value="basicSelection(field, read(field))"
                @change="change(field, $event)"
              >
                <AppOption v-if="!field.options?.includes('')" value="" disabled>
                  {{ t('configNativeDefault') }}
                </AppOption>
                <AppOption
                  v-if="
                    fieldText(read(field)) &&
                    !basicOptions(field, draft).includes(basicSelection(field, read(field)))
                  "
                  :value="basicSelection(field, read(field))"
                >
                  {{ fieldText(read(field)) }}
                </AppOption>
                <AppOption
                  v-for="option in basicOptions(field, draft)"
                  :key="option"
                  :value="option"
                  :disabled="field.disabledOptions?.includes(option)"
                >
                  {{ field.optionLabels?.[option] ? t(field.optionLabels[option]!) : option }}
                </AppOption>
              </AppSelect>
              <AppTextField
                v-else
                :label="t(field.label)"
                :data-config-path="field.path.join('.')"
                :type="field.type"
                :value="inputText(field)"
                :min="field.min"
                :max="field.max"
                :readonly="field.readonly"
                :disabled="inactive(field)"
                :step="field.type === 'number' ? 1 : undefined"
                :required="field.required || field.path[0] === 'name'"
                @input="captureInput(field, $event)"
                @change="change(field, $event)"
              />
              <small v-if="field.hint" class="muted">{{ t(field.hint) }}</small>
              <AppButton
                v-if="offsetSlot(field)"
                :disabled="disabled || rawOpen || inactive(field)"
                @click.prevent="chooseLeaseOffset(field)"
                >{{ t('configChooseLeaseOffset') }}</AppButton
              >
              <small v-if="leaseFeedback?.path === field.path.join('.')" role="status">{{
                t(leaseFeedback.message)
              }}</small>
              <small v-if="basicInactive(field, draft)" class="muted">{{
                t('configSwiotlbInactive')
              }}</small>
            </div>
          </div>
          <CpuCorePicker
            v-if="section.key === 'gpu-worker' && !inactive(gpuCpuField)"
            :current="inputText(gpuCpuField)"
            :title="t('cpuChooseGpu')"
            :disabled="
              disabled ||
              rawOpen ||
              (draft.gpu_cgroup_cpus !== undefined && typeof draft.gpu_cgroup_cpus !== 'string')
            "
            @select="chooseGpuCpus"
          />
        </section>
        <BasicAdvanced
          v-if="group.label === 'configBasic'"
          ref="basicAdvanced"
          :document="draft"
          :active="category === 'configBasic'"
          :disabled="disabled || rawOpen"
          @change="changeAdvanced"
          @dirty="editor.markDirty"
        />
      </fieldset>
    </form>
    <p v-if="draft && category !== 'configBasic'" class="muted">{{ t('configHostPaths') }}</p>
    <ConfirmDialog
      :open="!!confirm"
      :title="
        t(
          confirm === 'delete'
            ? 'configDelete'
            : confirm === 'reload'
              ? 'configReload'
              : 'configSave',
        )
      "
      :description="
        t(
          confirm === 'delete'
            ? 'configDeleteHint'
            : confirm === 'reload'
              ? 'configReloadHint'
              : 'configSaveHint',
        )
      "
      :confirm-label="
        t(
          confirm === 'delete'
            ? 'configDelete'
            : confirm === 'reload'
              ? 'configReload'
              : 'configSave',
        )
      "
      @cancel="confirm = null"
      @confirm="confirmed"
    />
  </section>
</template>

<style scoped>
.configuration {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
.config-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.config-categories {
  min-width: 0;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: var(--space-2);
}
.config-categories :deep(button) {
  flex: 0 0 auto;
  white-space: nowrap;
}
fieldset {
  min-width: 0;
  padding: var(--space-4);
  margin: 0;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--app-color-card);
}
legend {
  padding: 0 var(--space-2);
  font-weight: 650;
}
.config-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
.config-section + .config-section {
  margin-top: var(--space-5);
}
.config-section .config-toolbar {
  margin-bottom: var(--space-3);
}
.config-section h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--md-sys-typescale-title-medium-size);
  overflow-wrap: anywhere;
}
.config-unsupported {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 16rem;
  overflow: auto;
}
.config-field,
.raw-label {
  display: grid;
  gap: var(--space-2);
  align-content: start;
  min-width: 0;
}
textarea {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  background: var(--app-color-card);
  color: var(--md-sys-color-on-surface);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  font: inherit;
}
textarea {
  font-family: monospace;
  resize: vertical;
}
.raw-label {
  margin-bottom: var(--space-3);
}
/* Wide screens: the categories become a sticky section list beside the form. */
@media (width >= 840px) {
  .configuration {
    grid-template-columns: 220px minmax(0, 1fr);
    column-gap: var(--space-6);
  }
  .configuration > * {
    grid-column: 1 / -1;
  }
  .configuration > .config-categories {
    grid-column: 1;
    position: sticky;
    top: var(--space-4);
    align-self: start;
    flex-direction: column;
    gap: 0;
    overflow: visible;
    padding: 0;
  }
  .configuration > form {
    grid-column: 2;
  }
  .config-categories :deep(button) {
    white-space: normal;
  }
  .config-categories :deep(.chip) {
    width: 100%;
    height: auto;
    min-height: 56px;
    padding: var(--space-2) var(--space-4);
    border: 0;
    border-radius: var(--md-sys-shape-corner-full);
    text-align: start;
  }
  .config-categories :deep(.active .chip) {
    padding-inline-start: var(--space-4);
  }
  .config-categories :deep(.chip .icon) {
    display: none;
  }
}
@media (width < 600px) {
  .config-fields {
    grid-template-columns: 1fr;
  }
  fieldset {
    padding: var(--space-3);
  }
}
</style>
