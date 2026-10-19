<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { UsbRulesEditor, useUsbRulesEditor } from '../modules/usbRules'
import { useResourceCatalog } from '../modules/resources'
import { useVisiblePolling } from '../shared/model/visiblePolling'
import AppButton from '../shared/ui/AppButton.vue'
import ConfirmDialog from '../shared/ui/ConfirmDialog.vue'
import EmptyState from '../shared/ui/EmptyState.vue'

const editor = useUsbRulesEditor(),
  resources = useResourceCatalog(),
  router = useRouter(),
  { t } = useI18n()
const leaving = ref('')
let allowLeave = false
onMounted(() => {
  if (editor.supported.value) void editor.open()
})
useVisiblePolling(
  () => editor.supported.value,
  async () => {
    await editor.reconcile()
    return !editor.entry.value?.problem
  },
  ['tasks'],
)
useVisiblePolling(() => resources.usb.supported.value, resources.usb.refresh)
onBeforeRouteLeave((to) => {
  if (!allowLeave && editor.protectedDraft.value) {
    leaving.value = to.fullPath
    return false
  }
})
function leave() {
  allowLeave = true
  void router.push(leaving.value)
}
</script>

<template>
  <div class="page-heading">
    <h1 class="desktop-only">{{ t('usbRulesTitle') }}</h1>
    <AppButton @click="router.push('/resources/usb')">{{ t('close') }}</AppButton>
  </div>
  <UsbRulesEditor v-if="editor.supported.value" />
  <EmptyState v-else :title="t('usbRulesUnavailable')" :description="t('errorUnsupportedHint')" />
  <ConfirmDialog
    :open="!!leaving"
    :title="t('configLeave')"
    :description="t('usbRulesLeaveHint')"
    :confirm-label="t('usbRulesLeave')"
    @cancel="leaving = ''"
    @confirm="leave"
  />
</template>

<style scoped>
.page-heading {
  flex-wrap: wrap;
  gap: var(--space-2);
}
.page-heading > .btn {
  margin-left: auto;
}
</style>
