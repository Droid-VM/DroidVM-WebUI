<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppButton from './AppButton.vue'
import AppIcon from './AppIcon.vue'
const { t } = useI18n()
withDefaults(
  defineProps<{ title: string; tone?: 'info' | 'warning' | 'error'; dismissible?: boolean }>(),
  { tone: 'info', dismissible: false },
)
defineEmits<{ dismiss: [] }>()
</script>

<template>
  <section class="notice" :class="tone" :role="tone === 'error' ? 'alert' : 'status'">
    <div class="grow">
      <h2>{{ title }}</h2>
      <div class="notice-body"><slot /></div>
    </div>
    <AppButton
      v-if="dismissible"
      tone="icon"
      :aria-label="t('dismissNotice')"
      @click="$emit('dismiss')"
      ><AppIcon name="close"
    /></AppButton>
  </section>
</template>

<style scoped>
.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  border-radius: var(--md-sys-shape-corner-large);
  padding: var(--space-4);
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  margin-bottom: var(--space-4);
  overflow-wrap: anywhere;
}
.warning {
  background: var(--app-color-warning-container);
  color: var(--app-color-warning);
}
.error {
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-error);
}
h2 {
  font-size: var(--md-sys-typescale-body-medium-size);
  margin: 0 0 var(--space-2);
}
.notice-body {
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: 1.6;
}
.notice-body :deep(p) {
  margin: 0 0 var(--space-3);
}
.notice .btn {
  color: inherit;
  flex-shrink: 0;
}
</style>
