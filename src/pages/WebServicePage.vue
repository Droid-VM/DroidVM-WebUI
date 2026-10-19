<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { useI18n } from 'vue-i18n'
import { WebServicePanel } from '../modules/webService'
const { t } = useI18n()
</script>
<template>
  <div class="service-page">
    <AppBackLink to="/more">{{ t('navMore') }}</AppBackLink
    ><WebServicePanel />
  </div>
</template>
<style scoped>
.service-page {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
  max-width: var(--app-content-width);
}
</style>
