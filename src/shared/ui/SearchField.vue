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
.search-field {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  background: var(--soft);
  border-radius: var(--radius-pill);
  padding: 0 var(--space-3);
  min-height: var(--touch-target);
  min-width: 0;
}
input {
  width: 100%;
  min-width: 0;
  min-height: var(--touch-target);
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: var(--font-body);
}
.search-field:focus-within {
  outline: var(--focus-ring);
  outline-offset: 3px;
}
.icon {
  width: 18px;
  flex-shrink: 0;
}
@media (max-width: 650px) {
  input {
    font-size: max(16px, 1rem);
  }
}
</style>
