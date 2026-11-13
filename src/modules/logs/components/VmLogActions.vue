<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLogViewer } from '../model/viewer'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog.vue'
// Top bar of the console page, as the App's VMConsoleActivity: save, share, clear.
const props = defineProps<{ vmId: string }>()
const { t } = useI18n()
const viewer = useLogViewer()
const clearing = ref(false)
function file() {
  return new File([viewer.exportBytes()], `droidvm-${props.vmId}-${viewer.stream.value}.log`, {
    type: 'text/plain',
  })
}
function save() {
  const url = URL.createObjectURL(file())
  const link = document.createElement('a')
  link.href = url
  link.download = file().name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
// Browsers without file sharing fall back to saving the file.
async function share() {
  const shared = { files: [file()] }
  if (!navigator.canShare?.(shared)) return save()
  try {
    await navigator.share(shared)
  } catch {
    /* Dismissing the share sheet is not an error. */
  }
}
async function clear() {
  await viewer.clear()
  clearing.value = false
}
</script>

<template>
  <AppButton
    tone="icon"
    :aria-label="t('vmLogSave')"
    :title="t('vmLogSave')"
    :disabled="!viewer.byteCount.value"
    @click="save"
    ><AppIcon name="save"
  /></AppButton>
  <AppButton
    tone="icon"
    :aria-label="t('vmLogShare')"
    :title="t('vmLogShare')"
    :disabled="!viewer.byteCount.value"
    @click="share"
    ><AppIcon name="share"
  /></AppButton>
  <AppButton
    v-if="viewer.clearSupported.value"
    tone="icon"
    :aria-label="t('vmLogClear')"
    :title="t('vmLogClear')"
    :disabled="!viewer.target.value || viewer.busy.value"
    @click="clearing = true"
    ><AppIcon name="sweep"
  /></AppButton>
  <ConfirmDialog
    :open="clearing"
    :title="t('vmLogClearTitle')"
    :description="t('vmLogClearHint')"
    :confirm-label="t('vmLogClear')"
    @cancel="clearing = false"
    @confirm="clear"
  />
</template>
