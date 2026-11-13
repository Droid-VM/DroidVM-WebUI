<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Hugepages } from '../model/hugepages'
import AppIcon from '../../../shared/ui/AppIcon.vue'
const props = defineProps<{ model: Hugepages }>()
const { t } = useI18n()
// Rarely needed actions; each opens the shared confirmation. Migration only when needed.
const actions = computed(() =>
  (
    [
      { kind: 'reconcile', label: 'hugepagesReconcile', icon: 'refresh' },
      { kind: 'migrate-settings', label: 'hugepagesMigrate', icon: 'import' },
      { kind: 'unload', label: 'hugepagesUnload', icon: 'delete' },
    ] as const
  ).filter(
    (action) =>
      action.kind !== 'migrate-settings' || props.model.status.value?.hasLegacySettings === true,
  ),
)
</script>

<template>
  <section
    class="card out rows"
    data-testid="hugepages-group-maintenance"
    :aria-label="t('hugepagesGroupMaintenance')"
  >
    <button
      v-for="action in actions"
      :key="action.kind"
      type="button"
      class="row"
      :class="{ danger: action.kind === 'unload' }"
      :data-testid="`hugepages-${action.kind}`"
      :disabled="!model.canPrepare({ kind: action.kind })"
      @click="model.prepare({ kind: action.kind })"
    >
      <span class="lead"><AppIcon :name="action.icon" /></span>
      <span class="rt"
        ><span class="a">{{ t(action.label) }}</span></span
      >
    </button>
  </section>
</template>

<style scoped>
.rows .row + .row {
  border-top: 1px solid var(--md-sys-color-outline-variant);
}
button.row:disabled {
  cursor: default;
  opacity: 0.5;
}
.row.danger,
.row.danger .lead {
  color: var(--md-sys-color-error);
}
</style>
