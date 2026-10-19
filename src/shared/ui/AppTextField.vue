<script setup lang="ts">
import '@material/web/textfield/outlined-text-field.js'
import { computed } from 'vue'

// Use either v-model (modifiers such as .number and .trim work) or `:value` + `@input`
// / `@change` (the event target's `value` is a string). Native attributes such as
// `type`, `rows`, `min` and `required` pass through to md-outlined-text-field.
const props = withDefaults(
  defineProps<{
    label?: string
    modelValue?: string | number | null
    value?: string | number | null
    supportingText?: string
    errorText?: string
  }>(),
  { label: '', modelValue: undefined, value: undefined, supportingText: '', errorText: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const current = computed(() => String(props.modelValue ?? props.value ?? ''))
</script>

<template>
  <md-outlined-text-field
    class="app-text-field"
    :label="label"
    :value="current"
    :supporting-text="supportingText"
    :error="Boolean(errorText)"
    :error-text="errorText"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.app-text-field {
  width: 100%;
  min-width: 0;
}
</style>
