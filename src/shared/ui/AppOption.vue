<script setup lang="ts">
import '@material/web/select/select-option.js'
import { inject } from 'vue'
import { selectedValue } from './selectContext'

defineProps<{ value: string | number; disabled?: boolean }>()
const current = inject(selectedValue)
</script>

<template>
  <md-select-option
    :value="String(value)"
    :disabled="disabled"
    :selected="current === String(value)"
    ><div slot="headline"><slot /></div
  ></md-select-option>
</template>
