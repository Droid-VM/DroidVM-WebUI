<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResourceCatalog } from '../model/catalog'
import { bigCpuSet, cpuFrequencies, missingCpuSet } from '../model/cpus'
import {
  compactCpuSet,
  cpuSet,
  hasCpu,
  toggleCpu,
  type CpuInterval,
} from '../../../shared/lib/cpuSet'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'

const props = defineProps<{
  current: string
  title: string
  disabled: boolean
  selectionLimit?: { minimum: number; maximum: number }
  confirmUnchanged?: boolean
  hint?: string
}>()
const emit = defineEmits<{ select: [value: string] }>()
const { t, locale } = useI18n()
const source = useResourceCatalog().cpus
const open = ref(false),
  touched = ref(false),
  selection = ref<CpuInterval[]>([])
const frequencies = computed(() => cpuFrequencies(source.items.value))
const selectedText = computed(() => compactCpuSet(selection.value))
const missing = computed(() => missingCpuSet(selectedText.value, source.items.value))
const valid = computed(() => !props.current.trim() || cpuSet(props.current) !== null)
const selectionValid = computed(() => {
  if (!props.selectionLimit) return true
  const size = (selectedText.value ? cpuSet(selectedText.value)! : []).reduce(
    (count, [a, b]) => count + b - a + 1,
    0,
  )
  return size >= props.selectionLimit.minimum && size <= props.selectionLimit.maximum
})
async function begin() {
  // Let a focused text field's change event reach the shared draft first.
  await nextTick()
  if (props.disabled || !source.supported.value || !valid.value) return
  selection.value = props.current.trim() ? cpuSet(props.current)! : []
  touched.value = false
  open.value = true
  void source.refresh()
}
watch([() => props.current, () => props.disabled, source.supported], () => {
  open.value = false
})
function replace(value: string) {
  selection.value = value ? cpuSet(value)! : []
  touched.value = true
}
function toggle(id: number) {
  selection.value = toggleCpu(selection.value, id)
  touched.value = true
}
function apply() {
  if (props.disabled || !selectionValid.value) return
  if (touched.value || props.confirmUnchanged) emit('select', selectedText.value)
  open.value = false
}
function frequency(khz: number | null) {
  if (khz === null) return t('cpuFrequencyUnknown')
  const ghz = khz >= 1000000
  return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(khz / (ghz ? 1000000 : 1000))} ${ghz ? 'GHz' : 'MHz'}`
}
function tier(khz: number | null) {
  if (khz === null || frequencies.value.length < 2) return ''
  const index = frequencies.value.indexOf(khz)
  return t(
    index === 0
      ? 'cpuLittle'
      : frequencies.value.length > 2 && index === frequencies.value.length - 1
        ? 'cpuPrime'
        : 'cpuBig',
  )
}
</script>

<template>
  <div v-if="source.supported.value" class="cpu-picker">
    <AppButton :disabled="disabled || !valid" :aria-label="title" @click="begin">{{
      title
    }}</AppButton>
    <small v-if="!valid">{{ t('cpuFixText') }}</small>
    <AppDialog v-if="open" :open="open" :title="title" @close="open = false">
      <p class="cpu-hint">{{ t('cpuPickerHint') }}</p>
      <p v-if="hint">{{ hint }}</p>
      <AppNotice v-if="source.problem.value" tone="error" :title="t(source.problem.value.titleKey)">
        <p>{{ t(source.problem.value.descriptionKey) }}</p>
      </AppNotice>
      <div class="cpu-actions">
        <AppButton @click="source.refresh">{{ t('refreshList') }}</AppButton>
        <AppButton
          :disabled="source.status.value !== 'ready'"
          @click="replace(bigCpuSet(source.items.value))"
          >{{ t('cpuOnlyBig') }}</AppButton
        >
        <AppButton @click="replace('')">{{ t('cpuUnbind') }}</AppButton>
      </div>
      <p v-if="source.status.value === 'loading'" role="status">{{ t('processing') }}</p>
      <p class="cpu-selection">
        {{ t('cpuSelected', { cores: selectedText || t('cpuUnbound') }) }}
      </p>
      <p v-if="source.status.value === 'ready' && missing" class="cpu-selection">
        {{ t('cpuMissing', { cores: missing }) }}
      </p>
      <div class="cpu-cores">
        <label v-for="core in source.items.value" :key="core.id">
          <input
            type="checkbox"
            :aria-label="`CPU${core.id}`"
            :checked="hasCpu(selection, core.id)"
            :disabled="disabled || source.status.value !== 'ready'"
            @change="toggle(core.id)"
          />
          <span
            ><strong>CPU{{ core.id }}</strong> · {{ frequency(core.maxFrequencyKHz) }}
            <span v-if="tier(core.maxFrequencyKHz)">· {{ tier(core.maxFrequencyKHz) }}</span>
            <small
              >{{
                t(
                  core.online === true
                    ? 'cpuOnline'
                    : core.online === false
                      ? 'cpuOffline'
                      : 'cpuOnlineUnknown',
                )
              }}
              · {{ t('cpuCapacityValue', { value: core.capacity ?? t('cpuUnknown') })
              }}{{ core.capacityEstimated ? ` · ${t('cpuEstimated')}` : '' }}</small
            >
          </span>
        </label>
      </div>
      <div class="cpu-actions cpu-footer">
        <p v-if="!selectionValid && selectionLimit" role="status">
          {{ t('cpuSelectionLimit', selectionLimit) }}
        </p>
        <AppButton @click="open = false">{{ t('cancel') }}</AppButton>
        <AppButton tone="primary" :disabled="disabled || !selectionValid" @click="apply">{{
          t('confirm')
        }}</AppButton>
      </div>
    </AppDialog>
  </div>
</template>

<style scoped>
.cpu-picker,
.cpu-cores {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.cpu-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.cpu-cores {
  max-height: 45dvh;
  overflow-y: auto;
}
.cpu-cores label {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow-wrap: anywhere;
}
small {
  display: block;
  color: var(--muted);
}
.cpu-selection,
.cpu-hint {
  overflow-wrap: anywhere;
}
.cpu-footer {
  margin-top: var(--space-4);
  justify-content: flex-end;
}
</style>
