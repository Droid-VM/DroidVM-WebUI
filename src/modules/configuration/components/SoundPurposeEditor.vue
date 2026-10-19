<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { fieldText, object } from '../model/document'
import {
  soundAttributes,
  soundChoices,
  soundTitles,
  soundValue,
  type SoundAttribute,
} from '../model/soundPurpose'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'

const props = defineProps<{ endpoint: unknown; disabled: boolean }>()
const emit = defineEmits<{ change: [value: { attribute: SoundAttribute; value: string }] }>()
const { t } = useI18n()
const input = computed(
  () => object(props.endpoint) && fieldText(props.endpoint.mode).toLowerCase() === 'microphone',
)
const fields = computed(() => {
  const key = object(props.endpoint) ? fieldText(props.endpoint.host_device) : ''
  return soundAttributes(input.value).map((attribute) => {
    const value = soundValue(key, attribute)
    return {
      attribute,
      value,
      choices: soundChoices[attribute],
      unknown: value !== '' && !soundChoices[attribute].some((choice) => choice.value === value),
    }
  })
})
function change(attribute: SoundAttribute, event: Event) {
  if (props.disabled) return
  emit('change', { attribute, value: (event.target as HTMLSelectElement).value })
}
</script>

<template>
  <div class="sound-purpose">
    <AppSelect
      v-for="field in fields"
      :key="field.attribute"
      :label="t(soundTitles[field.attribute])"
      :supporting-text="field.unknown ? t('soundPurposeUnknown') : ''"
      :value="field.value"
      :disabled="disabled"
      @change="change(field.attribute, $event)"
    >
      <AppOption value="">{{ t('soundPurposeDefault') }}</AppOption>
      <AppOption v-if="field.unknown" :value="field.value" disabled>{{ field.value }}</AppOption>
      <AppOption v-for="choice in field.choices" :key="choice.value" :value="choice.value">
        {{ t(choice.label) }}
      </AppOption>
    </AppSelect>
    <small class="muted">{{ t(input ? 'soundPurposeInputHint' : 'soundPurposeOutputHint') }}</small>
  </div>
</template>

<style scoped>
.sound-purpose {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  margin-bottom: var(--space-3);
}
small {
  overflow-wrap: anywhere;
}
</style>
