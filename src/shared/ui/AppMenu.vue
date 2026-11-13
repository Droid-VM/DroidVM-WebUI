<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'
// Overflow menu of the top app bar (the App's ⋮). Items are buttons in the default slot;
// choosing one, Escape or a click elsewhere closes it.
defineProps<{ label: string }>()
const root = ref<HTMLDetailsElement>()
function close() {
  if (root.value) root.value.open = false
}
function outside(event: Event) {
  if (root.value?.open && !root.value.contains(event.target as Node)) close()
}
document.addEventListener('click', outside, true)
onBeforeUnmount(() => document.removeEventListener('click', outside, true))
</script>

<template>
  <details ref="root" class="app-menu" @keydown.escape="close">
    <summary :aria-label="label" :title="label"><AppIcon name="more" /></summary>
    <div class="app-menu-list" role="menu" @click="close"><slot /></div>
  </details>
</template>

<style scoped>
.app-menu {
  position: relative;
  flex-shrink: 0;
}
.app-menu > summary {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  min-height: 48px;
  border-radius: 50%;
  color: var(--md-sys-color-on-surface-variant);
  list-style: none;
}
.app-menu > summary::before {
  display: none;
}
.app-menu > summary:hover {
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
}
.app-menu-list {
  position: absolute;
  right: 4px;
  top: 44px;
  z-index: 10;
  min-width: 200px;
  padding: 8px 0;
  border-radius: 4px;
  background: var(--md-sys-color-surface-container);
  box-shadow: var(--md-sys-elevation-level3);
}
.app-menu-list :slotted(button) {
  display: block;
  width: 100%;
  height: 48px;
  padding: 0 12px;
  border: 0;
  background: none;
  color: var(--md-sys-color-on-surface);
  font: inherit;
  font-size: 14px;
  text-align: start;
  white-space: nowrap;
}
.app-menu-list :slotted(button:hover) {
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
}
.app-menu-list :slotted(button:disabled) {
  opacity: 0.38;
}
.app-menu-list :slotted(button.danger) {
  color: var(--md-sys-color-error);
}
</style>
