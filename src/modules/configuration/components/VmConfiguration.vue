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
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog.vue'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import AppMenu from '../../../shared/ui/AppMenu.vue'
import AppSwitch from '../../../shared/ui/AppSwitch.vue'
import { useMediaQuery } from '../../../shared/lib/mediaQuery'
import { useRoute, useRouter } from 'vue-router'
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
const stateHints = new Set<MessageKey>([
  'configLeaseL3Required',
  'configLeaseVlanMissing',
  'configLeaseDhcpDisabled',
  'configLeaseUnknown',
  'configForwards6Gvisor',
  'configForwardSnatDisabled',
  'configPeripheralUnsupported',
])
function stateHint(key: MessageKey | undefined) {
  return key !== undefined && stateHints.has(key)
}
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
// md-switch reports selected; commitField reads booleans from checked.
function changeSwitch(field: ConfigField, event: Event) {
  const control = event.target as HTMLInputElement & { selected: boolean }
  commitField(field, Object.assign(control, { checked: control.selected }))
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
// >= 1200: vertical categories and Cancel / Save under the form (the design's edit page).
const wide = useMediaQuery('(width >= 1200px)')
const route = useRoute(),
  router = useRouter()
// The VM page's Delete button opens the editor with ?delete=1.
watch(
  () => [state.value, route.query.delete] as const,
  ([value, remove]) => {
    if (value !== 'editing' || remove !== '1' || editor.newDraft.value) return
    void router.replace({ path: route.path })
    if (props.editable) confirm.value = 'delete'
  },
  { immediate: true },
)
const sectionTitle = (group: { label: MessageKey }, label?: MessageKey) => t(label ?? group.label)
</script>

<template>
  <section class="configuration" :aria-busy="['loading', 'staging', 'pending'].includes(state)">
    <Teleport v-if="draft" defer to="#top-actions">
      <button
        v-if="!wide"
        type="button"
        class="btn text"
        :disabled="disabled || !dirty || rawOpen"
        @click="requestSave"
      >
        {{ t('save') }}
      </button>
      <AppMenu :label="t('moreActions')">
        <button
          type="button"
          role="menuitem"
          :disabled="['staging', 'pending', 'unknown'].includes(state)"
          @click="confirm = 'reload'"
        >
          {{ t('configReload') }}
        </button>
        <button type="button" role="menuitem" @click="download">{{ t('configExport') }}</button>
        <button type="button" role="menuitem" :disabled="disabled || rawOpen" @click="editRaw">
          {{ t('configEditJson') }}
        </button>
        <button
          v-if="!editor.newDraft.value"
          type="button"
          role="menuitem"
          class="danger"
          :disabled="disabled || rawOpen"
          @click="confirm = 'delete'"
        >
          {{ t('configDelete') }}
        </button>
      </AppMenu>
    </Teleport>
    <OperationTrackingNotice
      :problem="editor.recoveryProblem.value"
      @clear="editor.clearTracking"
    />
    <p v-if="editor.restored.value" role="status">{{ t('configurationRestoredReceipt') }}</p>
    <AppNotice v-if="editor.creating.value && draft" tone="info" :title="t('createVm')" />
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
    <section v-if="draft && rawOpen" class="card out config-advanced">
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
      <div class="cc-actions">
        <button type="button" class="btn text" @click="cancelRaw">{{ t('cancel') }}</button>
        <button type="button" class="btn filled" :disabled="disabled" @click="applyRaw">
          {{ t('configApplyDraft') }}
        </button>
      </div>
    </section>
    <div v-if="draft" class="edit-wrap">
      <div class="config-categories" role="group" :aria-label="t('configCategories')">
        <button
          v-for="item in categories"
          :key="item.value"
          type="button"
          :class="{ on: category === item.value }"
          :aria-pressed="category === item.value"
          @click="category = item.value"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="edit-main">
        <form ref="form" novalidate @submit.prevent="requestSave">
          <button type="submit" hidden :disabled="disabled || rawOpen || !dirty">
            {{ t('configSave') }}
          </button>
          <fieldset
            v-for="group in configGroups"
            v-show="category === group.label"
            :key="group.label"
            class="card out"
            :data-category="group.label"
            :disabled="disabled || rawOpen"
          >
            <legend class="sr-only">{{ t(group.label) }}</legend>
            <div v-if="group.label !== 'configBasic'" class="group-intro">
              <HostCapabilities
                v-if="group.label === 'configGraphics'"
                :document="draft"
                section="graphics"
                :active="category === group.label"
              />
              <AppNotice
                v-if="group.label === 'configGraphics' && gpuCoreOverlap(draft)"
                tone="warning"
                :title="t('configGpuCoreOverlap')"
              />
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
              <button
                v-if="group.label === 'configStorage'"
                type="button"
                class="btn outlined icon-lead"
                :disabled="disabled || rawOpen"
                @click="addDirectory"
              >
                <AppIcon name="plus" />{{ t('configAddDirectory') }}
              </button>
              <template v-if="group.label === 'configPeripheral'">
                <p
                  v-if="
                    !catalog.audio.supported.value ||
                    catalog.audio.status.value === 'error' ||
                    catalog.audio.status.value === 'loading'
                  "
                  class="muted"
                >
                  {{
                    t(
                      !catalog.audio.supported.value || catalog.audio.status.value === 'error'
                        ? 'audioCatalogueUnavailable'
                        : 'processing',
                    )
                  }}
                </p>
                <AppButton
                  v-if="catalog.audio.supported.value"
                  :disabled="catalog.audio.status.value === 'loading'"
                  @click="catalog.audio.refresh()"
                  >{{ t('audioRefreshDevices') }}</AppButton
                >
                <div class="add-device">
                  <AppSelect
                    v-model="deviceKind"
                    :label="t('configAddDevice')"
                    :disabled="disabled || rawOpen"
                  >
                    <AppOption value="virtio_sound">{{ t('configDeviceSound') }}</AppOption>
                    <AppOption value="xhci_usb">{{ t('configDeviceXhci') }}</AppOption>
                    <AppOption value="sbsa">{{ t('configDeviceSbsa') }}</AppOption>
                    <AppOption value="virtio_console">{{
                      t('configDeviceVirtioConsole')
                    }}</AppOption>
                  </AppSelect>
                  <button
                    type="button"
                    class="btn outlined icon-lead"
                    :disabled="disabled || rawOpen || !canAddDevice(draft, deviceKind)"
                    @click="mutateDevice({ type: 'add', kind: deviceKind })"
                  >
                    <AppIcon name="plus" />{{ t('configAddDevice') }}
                  </button>
                </div>
                <AppButton
                  v-if="hasMissingSerials(draft)"
                  :disabled="disabled || rawOpen"
                  @click="mutateDevice({ type: 'serial-defaults' })"
                  >{{ t('configRestoreSerials') }}</AppButton
                >
              </template>
            </div>
            <details
              v-for="section in configurationSections(group, draft, catalog.networks.items.value)"
              :key="section.key"
              class="cc config-section"
              open
              :data-attachment="section.slot ? section.key : undefined"
              :data-section="section.key"
            >
              <summary>
                <span
                  >{{ sectionTitle(group, section.label) }}
                  <template v-if="section.identity">{{ section.identity }}</template></span
                >
              </summary>
              <div class="cc-body">
                <HostCapabilities
                  v-if="group.label === 'configBasic' && !section.label"
                  :document="draft"
                  section="basic"
                  :active="category === group.label"
                />
                <div
                  v-if="
                    section.slot ||
                    section.device ||
                    section.endpoint ||
                    section.soundCard !== undefined
                  "
                  class="cc-actions"
                >
                  <template v-if="section.slot">
                    <AppButton
                      v-if="section.slot.collection !== 'shared_dirs' && section.fields.length"
                      :disabled="disabled || rawOpen"
                      @click="beginReplacement(section.slot)"
                      >{{ t('configReplaceAttachment') }}</AppButton
                    >
                    <AppButton
                      v-if="section.slot.collection === 'disks'"
                      :disabled="disabled || rawOpen || section.slot.index === 0"
                      @click="
                        mutateAttachment(section.slot, { type: 'move', to: section.slot.index - 1 })
                      "
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
                      @click="
                        mutateAttachment(section.slot, { type: 'move', to: section.slot.index + 1 })
                      "
                      >{{ t('configMoveDown') }}</AppButton
                    >
                    <AppButton
                      class="danger"
                      :disabled="disabled || rawOpen"
                      @click="mutateAttachment(section.slot, { type: 'remove' })"
                      >{{ t('configRemoveAttachment') }}</AppButton
                    >
                  </template>
                  <AppButton
                    v-if="section.device"
                    class="danger"
                    :disabled="disabled || rawOpen"
                    @click="mutateDevice({ type: 'remove', slot: section.device })"
                    >{{ t('configRemoveAttachment') }}</AppButton
                  >
                  <template v-if="section.soundCard !== undefined">
                    <AppButton
                      :disabled="
                        disabled ||
                        rawOpen ||
                        endpointCount(draft, section.soundCard, 'speaker') >= 4
                      "
                      @click="
                        mutateDevice({
                          type: 'endpoint-add',
                          card: section.soundCard,
                          mode: 'speaker',
                        })
                      "
                      >{{ t('configAddSpeaker') }}</AppButton
                    >
                    <AppButton
                      :disabled="
                        disabled ||
                        rawOpen ||
                        endpointCount(draft, section.soundCard, 'microphone') >= 4
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
                  <AppButton
                    v-if="section.endpoint"
                    class="danger"
                    :disabled="disabled || rawOpen"
                    @click="mutateDevice({ type: 'endpoint-remove', slot: section.endpoint })"
                    >{{ t('configRemoveAttachment') }}</AppButton
                  >
                </div>
                <p v-if="stateHint(section.hint)" class="muted">{{ t(section.hint!) }}</p>
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
                  @change="
                    mutateDevice({ type: 'endpoint-purpose', slot: section.endpoint!, ...$event })
                  "
                />
                <button
                  v-if="section.lease"
                  type="button"
                  class="btn outlined icon-lead"
                  :disabled="disabled || rawOpen"
                  @click="mutateForward(section.lease)"
                >
                  <AppIcon name="plus" />{{ t('configAddForward') }}
                </button>
                <AppButton
                  v-if="section.forward"
                  class="danger"
                  :disabled="disabled || rawOpen"
                  @click="mutateForward(section.forward, section.forward.index)"
                  >{{ t('configRemoveForward') }}</AppButton
                >
                <template v-if="section.raw !== undefined">
                  <p class="muted">{{ t('configUnsupportedShape') }}</p>
                  <pre class="config-unsupported">{{ section.raw }}</pre>
                </template>
                <p
                  v-else-if="!section.fields.length && !section.lease && !stateHint(section.hint)"
                  class="muted"
                >
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
                    :class="{ 'switch-field': field.type === 'boolean' }"
                  >
                    <AppSwitch
                      v-if="field.type === 'boolean'"
                      class="switch-row"
                      :data-config-path="field.path.join('.')"
                      :disabled="inactive(field)"
                      :selected="read(field) === true"
                      @change="changeSwitch(field, $event)"
                      ><span class="a">{{ t(field.label) }}</span
                      ><span v-if="typeof read(field) !== 'boolean'" class="b">{{
                        t('configNativeDefault')
                      }}</span></AppSwitch
                    >
                    <AppSelect
                      v-else-if="field.type === 'boot-disk'"
                      :label="t(field.label)"
                      :value="selectedBootDisk === null ? '' : String(selectedBootDisk)"
                      :required="!!imageBoot"
                      @change="selectBoot"
                    >
                      <AppOption value="" disabled>{{ t('configNoBootDisk') }}</AppOption>
                      <AppOption
                        v-for="disk in bootDisks"
                        :key="disk.index"
                        :value="String(disk.index)"
                      >
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
                    <small v-if="stateHint(field.hint)" class="help">{{ t(field.hint!) }}</small>
                    <AppButton
                      v-if="offsetSlot(field)"
                      :disabled="disabled || rawOpen || inactive(field)"
                      @click.prevent="chooseLeaseOffset(field)"
                      >{{ t('configChooseLeaseOffset') }}</AppButton
                    >
                    <small v-if="leaseFeedback?.path === field.path.join('.')" role="status">{{
                      t(leaseFeedback.message)
                    }}</small>
                    <small v-if="basicInactive(field, draft)" class="help">{{
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
                    (draft.gpu_cgroup_cpus !== undefined &&
                      typeof draft.gpu_cgroup_cpus !== 'string')
                  "
                  @select="chooseGpuCpus"
                />
              </div>
            </details>
            <details v-if="group.label === 'configBasic'" class="cc" open>
              <summary>
                <span>{{ t('configBasicAdvanced') }}</span>
              </summary>
              <div class="cc-body">
                <BasicAdvanced
                  ref="basicAdvanced"
                  :document="draft"
                  :active="category === 'configBasic'"
                  :disabled="disabled || rawOpen"
                  @change="changeAdvanced"
                  @dirty="editor.markDirty"
                />
              </div>
            </details>
          </fieldset>
        </form>
        <p v-if="category !== 'configBasic'" class="muted host-paths">
          {{ t('configHostPaths') }}
        </p>
        <div v-if="wide" class="edit-actions">
          <button type="button" class="btn text" @click="router.back()">{{ t('cancel') }}</button>
          <button
            type="button"
            class="btn filled"
            :disabled="disabled || !dirty || rawOpen"
            @click="requestSave"
          >
            {{ t('save') }}
          </button>
        </div>
      </div>
    </div>
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
/* docs/webui/app-style/app.html vmEdit: tabs (vertical from 1200px), one outlined card of
   collapsible groups, single-column fields and switch rows. */
.configuration {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.edit-wrap {
  display: block;
  min-width: 0;
}
.config-categories {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  margin: 0 -16px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  background: var(--app-color-background);
  position: sticky;
  top: 64px;
  z-index: 2;
}
.config-categories::-webkit-scrollbar {
  display: none;
}
.config-categories > button {
  position: relative;
  flex: 1 0 auto;
  min-width: 72px;
  height: 48px;
  padding: 0 16px;
  border: 0;
  background: none;
  color: var(--md-sys-color-on-surface-variant);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}
.config-categories > button.on {
  color: var(--md-sys-color-primary);
}
.config-categories > button.on::after {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--md-sys-color-primary);
}
.edit-main {
  min-width: 0;
}
fieldset.card.out {
  margin: 12px 0 0;
  padding: 0;
  min-width: 0;
  border-radius: 12px;
}
.group-intro {
  display: grid;
  gap: 12px;
  padding: 16px;
}
.group-intro:empty {
  display: none;
}
.add-device {
  display: grid;
  gap: 8px;
  justify-items: start;
}
.cc-body {
  display: grid;
  gap: 16px;
  padding: 8px 16px 16px;
  min-width: 0;
}
.cc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.config-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}
.config-field {
  display: grid;
  gap: 4px;
  align-content: start;
  min-width: 0;
}
.config-field.switch-field {
  margin: 0 -16px;
}
.switch-row {
  min-height: 56px;
  padding: 8px 16px;
}
.switch-row :deep(.app-switch-label) {
  display: grid;
}
.switch-row .a {
  font-size: 16px;
  line-height: 24px;
}
.switch-row .b {
  font-size: 14px;
  line-height: 20px;
  color: var(--md-sys-color-on-surface-variant);
}
.help {
  padding: 0 16px;
  font-size: 12px;
  line-height: 16px;
  color: var(--md-sys-color-on-surface-variant);
}
.config-unsupported {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 16rem;
  overflow: auto;
}
.config-advanced {
  display: grid;
  gap: 12px;
  padding: 16px;
}
.raw-label {
  display: grid;
  gap: 8px;
  min-width: 0;
}
textarea {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: 4px;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  font: 14px/20px var(--app-font-mono);
  resize: vertical;
}
.host-paths {
  margin: 12px 0 0;
}
.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 0;
}
@media (width >= 600px) {
  .config-categories {
    margin: 0 -24px;
  }
}
@media (width >= 1200px) {
  .edit-wrap {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 24px;
    max-width: 1100px;
  }
  .config-categories {
    flex-direction: column;
    gap: 4px;
    margin: 0;
    border: 0;
    position: sticky;
    top: 72px;
    align-self: start;
    overflow: visible;
  }
  .config-categories > button {
    flex: none;
    height: 48px;
    border-radius: 24px;
    padding: 0 20px;
    text-align: left;
  }
  .config-categories > button.on {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }
  .config-categories > button.on::after {
    display: none;
  }
  fieldset.card.out {
    margin-top: 0;
  }
}
</style>
