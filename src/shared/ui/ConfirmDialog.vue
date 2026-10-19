<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, watch } from 'vue'
import AppDialog from './AppDialog.vue'
import AppButton from './AppButton.vue'
const { t } = useI18n()
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description: string
    confirmLabel?: string
    busy?: boolean
    error?: string
  }>(),
  { confirmLabel: undefined, busy: false, error: '' },
)
const emit = defineEmits<{ cancel: []; confirm: [] }>()
const submitted = ref(false)
const locked = computed(() => props.busy || submitted.value)
watch(
  [() => props.open, () => props.busy, () => props.error],
  ([open, busy, error], [wasOpen, wasBusy, wasError]) => {
    if (open !== wasOpen || (wasBusy && !busy) || error !== wasError) submitted.value = false
  },
)
function confirm() {
  if (locked.value) return
  submitted.value = true
  emit('confirm')
}
</script>

<template>
  <AppDialog :open="open" :title="title" :dismissible="!locked" @close="emit('cancel')"
    ><p>{{ description }}</p>
    <p v-if="error" role="alert" class="confirmation-error">{{ error }}</p>
    <div class="confirmation-actions">
      <AppButton :disabled="locked" @click="emit('cancel')">{{ t('cancel') }}</AppButton
      ><AppButton tone="primary" :disabled="locked" @click="confirm">{{
        locked ? t('processing') : (confirmLabel ?? t('confirm'))
      }}</AppButton>
    </div></AppDialog
  >
</template>

<style scoped>
.confirmation-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.confirmation-error {
  color: var(--danger);
}
</style>
