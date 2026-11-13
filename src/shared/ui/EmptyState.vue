<script setup lang="ts">
import AppIcon from './AppIcon.vue'
defineProps<{ title: string; description?: string; icon?: string }>()
</script>

<template>
  <section class="empty-state" role="status">
    <AppIcon :name="icon || 'vm'" />
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <slot />
  </section>
</template>
