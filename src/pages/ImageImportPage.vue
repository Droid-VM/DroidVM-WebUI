<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ImageImportPanel, ImageTransfersPanel } from '../modules/images'
const { t } = useI18n()
</script>
<template>
  <div class="image-import-page">
    <RouterLink to="/resources/disk">{{ t('navDisk') }}</RouterLink
    ><ImageTransfersPanel /><ImageImportPanel />
  </div>
</template>
<style scoped>
.image-import-page {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
