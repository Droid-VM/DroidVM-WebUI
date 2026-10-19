<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Hugepages } from '../model/hugepages'
import AppButton from '../../../shared/ui/AppButton.vue'
defineProps<{ model: Hugepages }>()
const { t } = useI18n()
const actions = [
  { kind: 'reconcile', label: 'hugepagesReconcile', hint: 'hugepagesReconcileHint' },
  { kind: 'migrate-settings', label: 'hugepagesMigrate', hint: 'hugepagesMigrateHint' },
  { kind: 'dismiss-crash', label: 'hugepagesDismissCrash', hint: 'hugepagesDismissCrashHint' },
] as const
</script>
<template>
  <section
    id="hugepages-maintenance"
    class="panel"
    data-testid="hugepages-group-maintenance"
    aria-labelledby="hugepages-maintenance-heading"
  >
    <h2 id="hugepages-maintenance-heading">{{ t('hugepagesGroupMaintenance') }}</h2>
    <p>{{ t('hugepagesMaintenanceHint') }}</p>
    <div v-for="action in actions" :key="action.kind" class="setting-card">
      <h3>{{ t(action.label) }}</h3>
      <p>{{ t(action.hint) }}</p>
      <AppButton
        :data-testid="`hugepages-${action.kind}`"
        :disabled="!model.canPrepare({ kind: action.kind })"
        @click="model.prepare({ kind: action.kind })"
        >{{ t(action.label) }}</AppButton
      >
    </div>
    <p v-if="model.status.value?.hasLegacySettings === false">
      {{ t('hugepagesNoLegacySettings') }}
    </p>
    <p v-if="model.status.value?.hasCrash === false">{{ t('hugepagesNoCrash') }}</p>
  </section>
</template>
