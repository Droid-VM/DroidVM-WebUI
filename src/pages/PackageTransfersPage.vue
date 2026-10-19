<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { useI18n } from 'vue-i18n'
import { PackageTransfersPanel } from '../modules/packages'
const { t } = useI18n()
</script>
<template>
  <div class="package-page">
    <AppBackLink to="/packages/import">{{ t('packageImportTitle') }}</AppBackLink
    ><PackageTransfersPanel />
  </div>
</template>
<style scoped>
.package-page {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
