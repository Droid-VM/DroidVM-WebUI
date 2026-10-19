<script setup lang="ts">
import '@material/web/switch/switch.js'
import { computed, useAttrs } from 'vue'
import { useSlotLabel } from './slotLabel'

// An on/off setting. Use either v-model or `:selected` + `@change` (the event target's
// `selected` is a boolean). `class` and `style` stay on the row; others reach md-switch.
defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{ modelValue?: boolean | null; selected?: boolean | null }>(),
  { modelValue: undefined, selected: undefined },
)
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const attrs = useAttrs()
const text = useSlotLabel('labelText')
const control = computed(() =>
  Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style')),
)
</script>

<template>
  <label class="app-switch" :class="attrs.class" :style="attrs.style as string"
    ><span ref="labelText" class="app-switch-label" aria-hidden="true"><slot /></span
    ><md-switch
      v-bind="control"
      :selected="Boolean(props.modelValue ?? props.selected)"
      :aria-label="(attrs['aria-label'] as string | undefined) ?? (text || undefined)"
      @change="
        emit(
          'update:modelValue',
          ($event.target as HTMLInputElement & { selected: boolean }).selected,
        )
      "
  /></label>
</template>

<style scoped>
.app-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 48px;
  cursor: pointer;
}
.app-switch-label {
  min-width: 0;
  overflow-wrap: anywhere;
}
md-switch {
  flex-shrink: 0;
}
</style>
