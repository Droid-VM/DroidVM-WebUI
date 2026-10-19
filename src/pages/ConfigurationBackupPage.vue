<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { useI18n } from 'vue-i18n'
import { ConfigurationBackupPanel } from '../modules/backups'
const { t } = useI18n()
</script>
<template>
  <div class="backup-page">
    <AppBackLink to="/more">{{ t('navMore') }}</AppBackLink
    ><ConfigurationBackupPanel />
  </div>
</template>
<style scoped>
.backup-page {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
  max-width: var(--app-content-width);
}
</style>
