<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'
defineProps<{ title: string; description: string; icon: string; to: string; current?: boolean }>()
</script>

<template>
  <RouterLink :to="to" class="menu-row" :aria-current="current ? 'page' : undefined"
    ><span class="menu-icon"><AppIcon :name="icon" /></span
    ><span class="grow"
      ><strong>{{ title }}</strong
      ><small>{{ description }}</small></span
    ><AppIcon name="chevron"
  /></RouterLink>
</template>
