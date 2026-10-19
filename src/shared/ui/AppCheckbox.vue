<script setup lang="ts">
import '@material/web/checkbox/checkbox.js'
import { computed, useAttrs } from 'vue'
import { useSlotLabel } from './slotLabel'

// Use either v-model or `:checked` + `@change` (the event target's `checked` is a boolean).
// `class` and `style` stay on the label; other attributes reach md-checkbox.
defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{ modelValue?: boolean | null; checked?: boolean | null; indeterminate?: boolean }>(),
  { modelValue: undefined, checked: undefined },
)
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const attrs = useAttrs()
const text = useSlotLabel('labelText')
const control = computed(() =>
  Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style')),
)
</script>

<template>
  <label class="app-checkbox" :class="attrs.class" :style="attrs.style as string"
    ><md-checkbox
      v-bind="control"
      touch-target="wrapper"
      :checked="Boolean(props.modelValue ?? props.checked)"
      :indeterminate="indeterminate"
      :aria-label="(attrs['aria-label'] as string | undefined) ?? (text || undefined)"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" /><span
      ref="labelText"
      aria-hidden="true"
      ><slot /></span
  ></label>
</template>

<style scoped>
.app-checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 48px;
  cursor: pointer;
}
</style>
