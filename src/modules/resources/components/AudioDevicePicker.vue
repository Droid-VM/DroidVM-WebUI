<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AudioDevice } from '../api/gateway'
import { useResourceCatalog } from '../model/catalog'
import type { MessageKey } from '../../../shared/i18n'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'

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
  <AppSelect
    class="audio-picker"
    :label="t('configAudioHost')"
    :supporting-text="missing && source.status.value === 'ready' ? t('audioDeviceMissingHint') : ''"
    :value="selected"
    :disabled="disabled"
    @change="change"
  >
    <AppOption :value="defaultKey">{{ t('configAudioSystemDefault') }}</AppOption>
    <AppOption v-if="missing" :value="selected">
      {{ savedLabel || selected }} ·
      {{ t(source.status.value === 'ready' ? 'audioDeviceMissing' : 'audioDeviceSaved') }}
    </AppOption>
    <AppOption v-for="device in devices" :key="device.id" :value="device.key">
      {{ label(device) }}
    </AppOption>
  </AppSelect>
</template>

<style scoped>
.audio-picker {
  margin-bottom: var(--space-3);
}
</style>
