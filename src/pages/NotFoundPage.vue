<script setup lang="ts">
import AppLinkButton from '../shared/ui/AppLinkButton.vue'
import { useI18n } from 'vue-i18n'
import EmptyState from '../shared/ui/EmptyState.vue'
const { t } = useI18n()
</script>

<template>
  <EmptyState :title="t('notFound')" :description="t('notFoundHint')"
    ><AppLinkButton to="/vms" tone="tonal">{{ t('backVms') }}</AppLinkButton></EmptyState
  >
</template>
