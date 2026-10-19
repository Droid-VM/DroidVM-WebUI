<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { useI18n } from 'vue-i18n'
import { HostOverviewPanel } from '../modules/host'
const { t } = useI18n()
</script>
<template>
  <div class="host-page">
    <AppBackLink to="/more">{{ t('navMore') }}</AppBackLink
    ><HostOverviewPanel />
  </div>
</template>
<style scoped>
.host-page {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  min-width: 0;
}
</style>
