<script setup lang="ts" generic="T extends string">
import '@material/web/ripple/ripple.js'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'
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
      <!-- M3 filter chip drawn inside a 44px hit area. -->
      <span class="chip"
        ><md-ripple /><AppIcon v-if="model === option.value" name="check" />{{ option.label
        }}<span v-if="option.count !== undefined" class="count">{{ n(option.count) }}</span></span
      >
    </button>
  </div>
</template>

<style scoped>
.filter-group {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
button {
  display: flex;
  align-items: center;
  min-height: var(--touch-target);
  border: 0;
  background: none;
  padding: 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium-size);
  font-weight: 500;
}
button:focus-visible {
  outline: none;
}
button:focus-visible .chip {
  outline: var(--focus-ring);
  outline-offset: 2px;
}
.chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 32px;
  padding: 0 var(--space-4);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-small);
}
button.active {
  color: var(--md-sys-color-on-secondary-container);
}
button.active .chip {
  padding-inline-start: var(--space-2);
  border-color: transparent;
  background: var(--md-sys-color-secondary-container);
}
.chip .icon {
  width: 18px;
  height: 18px;
}
.count {
  font-size: var(--md-sys-typescale-body-small-size);
}
@media (width < 600px) {
  .chip {
    padding-inline: var(--space-3);
  }
}
</style>
