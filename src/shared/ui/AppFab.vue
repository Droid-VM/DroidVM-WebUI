<script setup lang="ts">
import '@material/web/fab/fab.js'
import AppIcon from './AppIcon.vue'

// Without `label` this is an icon-only FAB; give it an aria-label.
defineProps<{ icon: string; label?: string }>()
</script>

<template>
  <md-fab variant="primary" :label="label"><AppIcon slot="icon" :name="icon" /></md-fab>
</template>
