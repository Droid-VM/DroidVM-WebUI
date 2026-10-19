<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { cloneConfiguration, encodeDocument, fieldText, type ConfigObject } from '../model/document'
import { environmentValid, lineArray, stringLines, topologyIssues } from '../model/basic'
import type { MessageKey } from '../../../shared/i18n'
import CpuAffinityEditor from './CpuAffinityEditor.vue'
import CpuTopologyPreview from './CpuTopologyPreview.vue'
import { cpuPlacementPreview, seedManualTopology } from '../model/cpuPlacement'
import { useResourceCatalog } from '../../resources'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppCheckbox from '../../../shared/ui/AppCheckbox.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'

const props = defineProps<{ document: ConfigObject; disabled: boolean; active: boolean }>()
const emit = defineEmits<{ change: [document: ConfigObject]; dirty: [] }>()
const { t } = useI18n()
const root = ref<HTMLElement>()
const cpus = useResourceCatalog().cpus
const preview = computed(() =>
  cpus.status.value === 'ready' && fieldText(props.document.backend).toLowerCase() === 'crosvm'
    ? cpuPlacementPreview(props.document, cpus.items.value)
    : null,
)
const canSeed = computed(() => {
  const empty = (key: string) =>
    props.document[key] === undefined ||
    (typeof props.document[key] === 'string' && !props.document[key].trim())
  return (
    preview.value &&
    ((empty('cpu_capacity') &&
      preview.value.capacity.length > 0 &&
      preview.value.capacity.every((entry) => entry.value <= 1024)) ||
      (empty('cpu_clusters') && preview.value.clusters.length > 1))
  )
})
function changeAuto(event: Event) {
  if (props.disabled) return
  const auto = (event.target as HTMLInputElement).checked
  const row = auto
    ? cloneConfiguration(props.document)
    : seedManualTopology(props.document, preview.value)
  row.cpu_topology_auto = auto
  emit('change', row)
}
function seedManual() {
  if (props.disabled || props.document.cpu_topology_auto !== false || !canSeed.value) return
  emit('change', seedManualTopology(props.document, preview.value))
}
const fields: {
  key: string
  label: MessageKey
  hint?: MessageKey
  lines?: boolean
  multiline?: boolean
  manual?: boolean
}[] = [
  { key: 'notes', label: 'configNotes', hint: 'configNotesHint', multiline: true },
  { key: 'cpu_affinity', label: 'configAffinity', hint: 'configAffinityHint' },
  { key: 'cpu_capacity', label: 'configCapacity', hint: 'configCapacityHint', manual: true },
  { key: 'cpu_clusters', label: 'configClusters', hint: 'configClustersHint', manual: true },
  {
    key: 'extra_options',
    label: 'configExtraOptions',
    hint: 'configExtraOptionsHint',
    lines: true,
  },
  {
    key: 'environment_variables',
    label: 'configEnvironment',
    hint: 'configEnvironmentHint',
    lines: true,
  },
]
function editable(key: string, lines?: boolean) {
  const value = props.document[key]
  return lines ? lineArray(value) : value === undefined || typeof value === 'string'
}
function display(key: string, lines?: boolean) {
  const value = props.document[key]
  if (!editable(key, lines)) return encodeDocument(value, true)
  return lines ? ((value as string[] | undefined) ?? []).join('\n') : fieldText(value)
}
function inactive(manual?: boolean) {
  return (
    manual &&
    (props.document.cpu_topology_auto !== false ||
      typeof props.document.cpu_affinity !== 'string' ||
      !props.document.cpu_affinity.trim())
  )
}
function change(key: string, event: Event, lines?: boolean) {
  if (props.disabled || !editable(key, lines)) return
  const text = (event.target as HTMLInputElement).value
  const row = cloneConfiguration(props.document)
  if (key === 'notes' && !text) delete row.notes
  else row[key] = lines ? stringLines(text) : text
  emit('change', row)
}
function validate() {
  const errors = topologyIssues(props.document)
  if (!environmentValid(props.document.environment_variables))
    errors.environment_variables = 'configEnvironmentInvalid'
  root.value
    ?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-basic-path]')
    .forEach((input) => {
      const error = errors[input.dataset.basicPath!]
      input.setCustomValidity(error ? t(error) : '')
    })
}
watch(
  () => props.document,
  async () => {
    await nextTick()
    validate()
  },
  { immediate: true },
)
function hint(field: (typeof fields)[number]) {
  if (!editable(field.key, field.lines)) return t('configUnsupportedShape')
  return field.hint ? t(field.hint) : ''
}
defineExpose({ validate })
</script>

<template>
  <section ref="root" class="basic-advanced">
    <h3>{{ t('configBasicAdvanced') }}</h3>
    <CpuAffinityEditor :document="document" :disabled="disabled" @change="emit('change', $event)" />
    <AppCheckbox
      :checked="document.cpu_topology_auto !== false"
      :disabled="disabled"
      @change="changeAuto"
      >{{ t('configTopologyAuto') }}</AppCheckbox
    >
    <CpuTopologyPreview :document="document" :active="active" />
    <AppButton
      v-if="document.cpu_topology_auto === false && cpus.supported.value"
      :disabled="disabled || !canSeed"
      @click="seedManual"
      >{{ t('cpuSeedManual') }}</AppButton
    >
    <template v-for="field in fields" :key="field.key">
      <AppTextField
        v-if="field.lines || field.multiline"
        type="textarea"
        rows="4"
        :label="t(field.label)"
        :supporting-text="hint(field)"
        :data-basic-path="field.key"
        :value="display(field.key, field.lines)"
        :disabled="disabled"
        :readonly="!editable(field.key, field.lines)"
        spellcheck="false"
        @input="emit('dirty')"
        @change="change(field.key, $event, field.lines)"
      />
      <AppTextField
        v-else
        :label="t(field.label)"
        :supporting-text="hint(field)"
        :data-basic-path="field.key"
        :value="display(field.key)"
        :disabled="disabled || inactive(field.manual)"
        :readonly="!editable(field.key)"
        spellcheck="false"
        @input="emit('dirty')"
        @change="change(field.key, $event)"
      />
    </template>
  </section>
</template>

<style scoped>
.basic-advanced {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  margin-top: var(--space-5);
}
</style>
