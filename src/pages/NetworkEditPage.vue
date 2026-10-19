<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NetworkConfiguration, useNetworkEditor } from '../modules/networks'
import { useVisiblePolling } from '../shared/model/visiblePolling'
import AppButton from '../shared/ui/AppButton.vue'
import ConfirmDialog from '../shared/ui/ConfirmDialog.vue'
import EmptyState from '../shared/ui/EmptyState.vue'
const editor = useNetworkEditor(),
  route = useRoute(),
  router = useRouter(),
  { t } = useI18n()
const target = computed(() => (route.meta.create ? 'new' : String(route.params.id))),
  leaving = ref('')
let allowLeave = false
watch(
  target,
  async (id) => {
    if (!editor.supported.value) return
    if (!(await editor.open(id)) && editor.target.value && editor.target.value !== id) {
      allowLeave = true
      await router.replace(
        editor.target.value === 'new'
          ? '/resources/network/new'
          : `/resources/network/${encodeURIComponent(editor.target.value)}/edit`,
      )
    }
  },
  { immediate: true },
)
useVisiblePolling(
  () => editor.supported.value,
  async () => {
    await editor.reconcile()
    return !editor.entry.value?.problem
  },
  ['tasks'],
)
function guard(path: string) {
  if (!allowLeave && editor.protectedDraft.value) {
    leaving.value = path
    return false
  }
  if (!editor.protectedDraft.value) editor.reset()
  allowLeave = false
}
onBeforeRouteLeave((to) => guard(to.fullPath))
onBeforeRouteUpdate((to) => {
  const nextTarget = to.meta.create ? 'new' : String(to.params.id)
  if (nextTarget !== target.value) return guard(to.fullPath)
})
function leave() {
  allowLeave = true
  void router.push(leaving.value)
  leaving.value = ''
}
</script>
<template>
  <div class="page-heading">
    <h1 class="desktop-only">{{ t(route.meta.create ? 'networkCreate' : 'networkEdit') }}</h1>
    <AppButton @click="router.push('/resources/network')">{{ t('close') }}</AppButton>
  </div>
  <NetworkConfiguration v-if="editor.supported.value" />
  <EmptyState v-else :title="t('networkUnavailable')" :description="t('errorUnsupportedHint')" />
  <ConfirmDialog
    :open="!!leaving"
    :title="t('configLeave')"
    :description="t('networkLeaveHint')"
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
