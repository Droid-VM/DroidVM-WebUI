<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'primary' | 'quiet' | 'tonal' }>(), { tone: 'quiet' })
</script>

<template>
  <button type="button" class="btn" :class="tone"><slot /></button>
</template>
