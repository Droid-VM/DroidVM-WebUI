<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useConfigurationEditor, VmConfiguration } from '../modules/configuration'
import { useInventory } from '../modules/vm'
import { useVisiblePolling } from '../shared/model/visiblePolling'
import ConfirmDialog from '../shared/ui/ConfirmDialog.vue'
import EmptyState from '../shared/ui/EmptyState.vue'
const route = useRoute(),
  router = useRouter(),
  editor = useConfigurationEditor(),
  inventory = useInventory()
const { t } = useI18n()
const id = computed(() => String(route.params.id || ''))
const available = computed(() =>
  route.meta.create ? editor.canCreate.value : editor.supported.value,
)
const editable = computed(
  () =>
    inventory.status.value === 'ready' &&
    (editor.newDraft.value ||
      inventory.items.value.some((vm) => vm.id === editor.target.value && vm.state === 'STOPPED')),
)
const leaving = ref('')
let allowLeave = false
watch(editor.state, (value) => {
  if (value !== 'saved') return
  void inventory.refresh()
  if (route.meta.copy || route.meta.create)
    void router.replace(`/vms/${encodeURIComponent(editor.target.value)}/edit`)
})
watch(
  () => [id.value, route.meta.copy, route.meta.create] as const,
  ([value, copy, create]) => {
    allowLeave = false
    leaving.value = ''
    // Canonicalize a saved copy's URL without clearing the success notice or
    // opening another draft. Refresh now opens the saved VM, not another copy.
    if (!copy && !create && editor.state.value === 'saved' && value === editor.target.value) return
    if (create) void editor.create(t('configNewName'))
    else void editor.open(value, copy ? (name) => t('configCopyName', { name }) : undefined)
  },
  { immediate: true },
)
useVisiblePolling(
  () => editor.supported.value,
  async () => {
    await editor.reconcile()
    return (await inventory.refresh()) && !editor.problem.value
  },
  ['vms', 'tasks'],
)
const needsConfirmation = () =>
  editor.dirty.value || ['staging', 'pending', 'unknown'].includes(editor.state.value)
function guard(to: { fullPath: string }) {
  if (!allowLeave && needsConfirmation()) {
    leaving.value = to.fullPath
    return false
  }
}
onBeforeRouteLeave(guard)
onBeforeRouteUpdate(guard)
const unload = (event: BeforeUnloadEvent) => {
  if (needsConfirmation()) {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', unload)
onUnmounted(() => {
  window.removeEventListener('beforeunload', unload)
  editor.reset(true)
})
function leave() {
  allowLeave = true
  void router.push(leaving.value)
}
</script>

<template>
  <h1>{{ t(route.meta.create ? 'createVm' : route.meta.copy ? 'configCopy' : 'configEdit') }}</h1>

  <VmConfiguration v-if="available" :editable="editable" />
  <EmptyState v-else :title="t('configUnavailable')" />
  <ConfirmDialog
    :open="!!leaving"
    :title="t('configLeave')"
    :description="t('configLeaveHint')"
    :confirm-label="t('close')"
    @cancel="leaving = ''"
    @confirm="leave"
  />
</template>
