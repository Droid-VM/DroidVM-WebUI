<script setup lang="ts">
defineProps<{ name: string }>()
// Paths reused from docs/webui/style-candidates/preview.js.
const paths: Record<string, string> = {
  vm: 'M3 4h18v13H3z M8 21h8 M12 17v4',
  resources: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  network: 'M9 3h6v6H9z M3 16h6v5H3z M15 16h6v5h-6z M12 9v4 M6 16v-3h12v3',
  disk: 'M4 4h16v16H4z M7 16h1 M11 16h6',
  usb: 'M12 3v17 M8 7l4-4 4 4 M7 10v4l5 3 M17 9v3l-5 3',
  tasks: 'M8 4h12v17H4V4h4 M8 2h8v4H8z M8 10h8 M8 15h6',
  more: 'M5 12h1 M11 12h1 M17 12h1',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  cpu: 'M6 6h12v12H6z M9 9h6v6H9z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4',
  memory: 'M3 6h18v12H3z M7 10v4 M12 10v4 M17 10v4 M6 18v3 M10 18v3 M14 18v3 M18 18v3',
  activity: 'M2 12h5l3-8 4 16 3-8h5',
  chevron: 'M9 5l7 7-7 7',
  terminal: 'M4 6l6 6-6 6 M13 18h7',
  close: 'M6 6l12 12 M18 6L6 18',
  plus: 'M12 5v14 M5 12h14',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 6 M4 12l2 6a7 7 0 0 0 12-1',
}
</script>

<template>
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path :d="paths[name] || paths.vm" />
  </svg>
</template>
