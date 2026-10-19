<script setup lang="ts">
import '@material/web/button/filled-button.js'
import '@material/web/button/filled-tonal-button.js'
import '@material/web/button/text-button.js'
import '@material/web/iconbutton/icon-button.js'

// `icon` is for buttons whose only content is an AppIcon; give them an aria-label.
withDefaults(defineProps<{ tone?: 'primary' | 'quiet' | 'tonal' | 'icon' }>(), { tone: 'quiet' })
const tags = {
  primary: 'md-filled-button',
  tonal: 'md-filled-tonal-button',
  quiet: 'md-text-button',
  icon: 'md-icon-button',
} as const
</script>

<template>
  <!-- `.icon` already styles SVG glyphs, so the icon tone uses its own class. -->
  <component
    :is="tags[tone]"
    type="button"
    class="btn"
    :class="tone === 'icon' ? 'icon-button' : tone"
    ><slot
  /></component>
</template>
