<script setup lang="ts" generic="T extends string | number = string">
import '@material/web/select/outlined-select.js'
import { computed, provide } from 'vue'
import { selectedValue } from './selectContext'

// Use either v-model or `:value` + `@change` (the event target's `value` is a string).
const props = withDefaults(
  defineProps<{
    label?: string
    modelValue?: T | null
    value?: string | number | null
    supportingText?: string
    errorText?: string
  }>(),
  { label: '', modelValue: undefined, value: undefined, supportingText: '', errorText: '' },
)
// v-model.number converts the emitted string for numeric models.
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
const current = computed(() => String(props.modelValue ?? props.value ?? ''))
provide(selectedValue, current)
</script>

<template>
  <md-outlined-select
    class="app-select"
    :label="label"
    :value="current"
    :supporting-text="supportingText"
    :error="Boolean(errorText)"
    :error-text="errorText"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value as T)"
    ><slot
  /></md-outlined-select>
</template>

<style scoped>
.app-select {
  width: 100%;
  min-width: 0;
}
</style>
