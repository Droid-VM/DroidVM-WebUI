<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { fieldText, object } from '../model/document'
import {
  soundAttributes,
  soundChoices,
  soundTitles,
  soundValue,
  type SoundAttribute,
} from '../model/soundPurpose'

const props = defineProps<{ endpoint: unknown; disabled: boolean }>()
const emit = defineEmits<{ change: [value: { attribute: SoundAttribute; value: string }] }>()
const { t } = useI18n()
const hintId = useId()
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
    <label v-for="field in fields" :key="field.attribute">
      <span>{{ t(soundTitles[field.attribute]) }}</span>
      <select
        :value="field.value"
        :disabled="disabled"
        :aria-label="t(soundTitles[field.attribute])"
        :aria-describedby="field.unknown ? `${hintId}-${field.attribute}` : undefined"
        @change="change(field.attribute, $event)"
      >
        <option value="">{{ t('soundPurposeDefault') }}</option>
        <option v-if="field.unknown" :value="field.value" disabled>{{ field.value }}</option>
        <option v-for="choice in field.choices" :key="choice.value" :value="choice.value">
          {{ t(choice.label) }}
        </option>
      </select>
      <small v-if="field.unknown" :id="`${hintId}-${field.attribute}`" class="muted">{{
        t('soundPurposeUnknown')
      }}</small>
    </label>
    <small class="muted">{{ t(input ? 'soundPurposeInputHint' : 'soundPurposeOutputHint') }}</small>
  </div>
</template>

<style scoped>
.sound-purpose,
label {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.sound-purpose {
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
