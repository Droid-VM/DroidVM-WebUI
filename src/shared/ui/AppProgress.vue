<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { n } = useI18n()
import { computed } from 'vue'
const props = defineProps<{ label: string; value?: number | null }>()
const progress = computed(() =>
  typeof props.value === 'number' && Number.isFinite(props.value)
    ? Math.min(100, Math.max(0, props.value))
    : undefined,
)
</script>

<template>
  <div class="progress-field">
    <div class="progress-label">
      <span>{{ label }}</span
      ><span v-if="progress !== undefined">{{
        n(progress / 100, { style: 'percent', maximumFractionDigits: 0 })
      }}</span>
    </div>
    <progress max="100" :value="progress" :aria-label="label" />
  </div>
</template>

<style scoped>
.progress-field {
  width: 100%;
  min-width: 0;
}
.progress-label {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--font-sm);
  color: var(--muted);
  margin-bottom: var(--space-2);
}
progress {
  width: 100%;
  height: 8px;
  accent-color: var(--accent);
  display: block;
}
</style>
