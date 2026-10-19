<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { WebServicePanel } from '../modules/webService'
const { t } = useI18n()
</script>
<template>
  <div class="service-page">
    <RouterLink to="/more">{{ t('navMore') }}</RouterLink
    ><WebServicePanel />
  </div>
</template>
<style scoped>
.service-page {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
