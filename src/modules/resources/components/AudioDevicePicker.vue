<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AudioDevice } from '../api/gateway'
import { useResourceCatalog } from '../model/catalog'
import type { MessageKey } from '../../../shared/i18n'

const props = defineProps<{
  current: string
  savedLabel: string
  input: boolean
  disabled: boolean
}>()
const emit = defineEmits<{ select: [value: AudioDevice | null] }>()
const { t } = useI18n(),
  source = useResourceCatalog().audio
const defaultKey = 'DEFAULT|system default'
const selected = computed(() => props.current || defaultKey)
const kinds: MessageKey[] = [
  'audioKindDevice',
  'audioKindSpeaker',
  'audioKindHeadphones',
  'audioKindHeadset',
  'audioKindLine',
  'audioKindDigital',
  'audioKindMicrophone',
  'audioKindTelephony',
]
const devices = computed(() => source.items.value.filter((device) => device.input === props.input))
const missing = computed(
  () =>
    selected.value !== defaultKey && !devices.value.some((device) => device.key === selected.value),
)
function label(device: AudioDevice) {
  const kind = t(kinds[device.kind] ?? 'audioKindDevice')
  const address = device.key.slice(device.key.indexOf('|') + 1)
  return [kind, device.name !== kind ? device.name : '', address].filter(Boolean).join(' · ')
}
function change(event: Event) {
  if (props.disabled) return
  const key = (event.target as HTMLSelectElement).value
  if (key === defaultKey) emit('select', null)
  else {
    const device = devices.value.find((item) => item.key === key)
    if (device && source.status.value === 'ready') emit('select', device)
  }
}
</script>

<template>
  <label class="audio-picker">
    <span>{{ t('configAudioHost') }}</span>
    <select
      :value="selected"
      :disabled="disabled"
      :aria-label="t('configAudioHost')"
      @change="change"
    >
      <option :value="defaultKey">{{ t('configAudioSystemDefault') }}</option>
      <option v-if="missing" :value="selected">
        {{ savedLabel || selected }} ·
        {{ t(source.status.value === 'ready' ? 'audioDeviceMissing' : 'audioDeviceSaved') }}
      </option>
      <option v-for="device in devices" :key="device.id" :value="device.key">
        {{ label(device) }}
      </option>
    </select>
    <small v-if="missing && source.status.value === 'ready'" class="muted">{{
      t('audioDeviceMissingHint')
    }}</small>
  </label>
</template>

<style scoped>
.audio-picker {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  margin-bottom: var(--space-3);
}
select {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
small {
  overflow-wrap: anywhere;
}
</style>
