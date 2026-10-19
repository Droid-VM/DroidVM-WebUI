<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'
defineProps<{
  title: string
  description: string
  icon: string
  to: string
  current?: boolean
  disabled?: boolean
}>()
</script>

<template>
  <component
    :is="disabled ? 'div' : RouterLink"
    :to="disabled ? undefined : to"
    class="menu-row"
    :aria-label="disabled ? undefined : title"
    :aria-disabled="disabled ? true : undefined"
    :aria-current="current ? 'page' : undefined"
    ><span class="menu-icon"><AppIcon :name="icon" /></span
    ><span class="grow"
      ><strong>{{ title }}</strong
      ><small>{{ description }}</small></span
    ><AppIcon v-if="!disabled" name="chevron"
  /></component>
</template>
