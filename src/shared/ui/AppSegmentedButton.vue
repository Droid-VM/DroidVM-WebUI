<script setup lang="ts" generic="T extends string">
import '@material/web/focus/md-focus-ring.js'
import '@material/web/ripple/ripple.js'
import AppIcon from './AppIcon.vue'

// M3 single-select segmented button; material-web does not provide one.
defineProps<{
  label: string
  options: readonly { value: T; label: string; icon?: string }[]
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="segmented" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      <md-focus-ring /><md-ripple /><AppIcon
        v-if="model === option.value || option.icon"
        :name="model === option.value ? 'check' : option.icon!"
      />{{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  max-width: 100%;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-full);
}
button {
  position: relative;
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-width: 0;
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 0;
  background: none;
  color: var(--md-sys-color-on-surface);
  font-size: var(--md-sys-typescale-body-medium-size);
  font-weight: 500;
  outline: none;
}
button:first-child {
  border-radius: var(--md-sys-shape-corner-full) 0 0 var(--md-sys-shape-corner-full);
}
button:last-child {
  border-radius: 0 var(--md-sys-shape-corner-full) var(--md-sys-shape-corner-full) 0;
}
button + button {
  border-inline-start: 1px solid var(--md-sys-color-outline);
}
button[aria-pressed='true'] {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}
.icon {
  width: 18px;
  height: 18px;
}
</style>
