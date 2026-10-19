<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'
defineProps<{ label: string; placeholder?: string }>()
const model = defineModel<string>({ required: true })
const input = ref<HTMLInputElement>()
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <label class="search-field"
    ><AppIcon name="search" /><input
      ref="input"
      v-model="model"
      type="search"
      :aria-label="label"
      :placeholder="placeholder"
  /></label>
</template>

<style scoped>
/* M3 search bar, 48px tall so it lines up with the filter chips in toolbars. */
.search-field {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface-variant);
  border-radius: var(--md-sys-shape-corner-full);
  padding: 0 var(--space-4);
  min-height: 48px;
  min-width: 0;
}
input {
  width: 100%;
  min-width: 0;
  min-height: 48px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  font: inherit;
  font-size: var(--md-sys-typescale-title-medium-size);
}
input::placeholder {
  color: var(--md-sys-color-on-surface-variant);
}
.search-field:focus-within {
  outline: var(--focus-ring);
  outline-offset: 3px;
}
.icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
</style>
