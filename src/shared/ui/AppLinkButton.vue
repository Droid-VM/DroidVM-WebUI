<script setup lang="ts">
import '@material/web/focus/md-focus-ring.js'
import '@material/web/ripple/ripple.js'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

// A real link styled as an M3 button, so router semantics (aria-current, open in new tab)
// and wrapping of long labels are kept. Use `href` for downloads and other non-route links.
withDefaults(defineProps<{ to?: RouteLocationRaw; tone?: 'primary' | 'quiet' | 'tonal' }>(), {
  to: undefined,
  tone: 'quiet',
})
</script>

<template>
  <component :is="to === undefined ? 'a' : RouterLink" :to="to" class="btn" :class="tone"
    ><md-focus-ring /><md-ripple /><slot
  /></component>
</template>
