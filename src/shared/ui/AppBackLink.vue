<script setup lang="ts">
import AppLinkButton from './AppLinkButton.vue'
import type { RouteLocationRaw } from 'vue-router'
import AppIcon from './AppIcon.vue'

defineProps<{ to: RouteLocationRaw }>()
</script>

<template>
  <AppLinkButton :to="to" class="back-link"><AppIcon name="back" /><slot /></AppLinkButton>
</template>
