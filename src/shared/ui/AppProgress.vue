<script setup lang="ts">
import '@material/web/progress/linear-progress.js'
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
    <md-linear-progress
      :max="100"
      :value="progress ?? 0"
      :indeterminate="progress === undefined"
      :aria-label="label"
    />
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
  font-size: var(--md-sys-typescale-body-medium-size);
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: var(--space-2);
}
md-linear-progress {
  width: 100%;
  display: block;
  --md-linear-progress-track-height: 4px;
  --md-linear-progress-active-indicator-height: 4px;
  --md-linear-progress-track-shape: var(--md-sys-shape-corner-full);
}
</style>
