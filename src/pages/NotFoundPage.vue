<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import EmptyState from '../shared/ui/EmptyState.vue'
const { t } = useI18n()
</script>

<template>
  <EmptyState :title="t('notFound')" :description="t('notFoundHint')"
    ><RouterLink to="/vms" class="btn tonal">{{ t('backVms') }}</RouterLink></EmptyState
  >
</template>
