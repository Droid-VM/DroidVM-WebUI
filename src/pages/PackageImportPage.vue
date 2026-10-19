<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { PackageImportForm, usePackageImport } from '../modules/packages'
const { t } = useI18n(),
  model = usePackageImport()
onBeforeUnmount(model.leave)
</script>
<template>
  <div class="package-page">
    <AppBackLink to="/vms">{{ t('navVms') }}</AppBackLink
    ><PackageImportForm />
  </div>
</template>
<style scoped>
.package-page {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
  max-width: var(--app-content-width);
}
</style>
