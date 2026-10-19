<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ConfigurationBackupPanel } from '../modules/backups'
const { t } = useI18n()
</script>
<template>
  <div class="backup-page">
    <RouterLink to="/more">{{ t('navMore') }}</RouterLink
    ><ConfigurationBackupPanel />
  </div>
</template>
<style scoped>
.backup-page {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
