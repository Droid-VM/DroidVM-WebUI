<script setup lang="ts" generic="T extends string">
import { useI18n } from 'vue-i18n'
const { n } = useI18n()
defineProps<{ label: string; options: readonly { value: T; label: string; count?: number }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="filter-group" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :class="{ active: model === option.value }"
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}<span v-if="option.count !== undefined">{{ n(option.count) }}</span>
    </button>
  </div>
</template>

<style scoped>
.filter-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--touch-target);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: transparent;
  padding: var(--space-2) var(--space-3);
  color: var(--muted);
  font-size: var(--font-sm);
}
button.active {
  color: var(--on-tint);
  background: var(--tint);
  border-color: var(--tint);
}
span {
  font-size: var(--font-xs);
}
@media (max-width: 650px) {
  button {
    padding: var(--space-2) 9px;
  }
}
</style>
