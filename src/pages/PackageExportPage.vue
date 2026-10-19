<script setup lang="ts">
import AppBackLink from '../shared/ui/AppBackLink.vue'
import { onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PackageExportForm, usePackageExport } from '../modules/packages'
import { useInventory } from '../modules/vm'
import AppNotice from '../shared/ui/AppNotice.vue'
const route = useRoute(),
  router = useRouter(),
  model = usePackageExport(),
  inventory = useInventory(),
  { t } = useI18n()
watch(
  () => route.params.id,
  (value) => {
    if (model.pending.value) return
    const id = typeof value === 'string' && value ? value : model.target.value
    if (id) void model.prepare(id)
  },
  { immediate: true },
)
function select(id: string) {
  if (!model.pending.value) void router.replace(`/packages/export/${encodeURIComponent(id)}`)
}
onBeforeUnmount(model.leave)
</script>
<template>
  <div class="package-page">
    <AppBackLink to="/vms">{{ t('navVms') }}</AppBackLink>
    <AppNotice
      v-if="inventory.problem.value"
      tone="error"
      :title="t(inventory.problem.value.titleKey)"
      ><p>{{ t(inventory.problem.value.descriptionKey) }}</p></AppNotice
    >
    <PackageExportForm
      :vms="inventory.items.value"
      @select="select"
      @refresh-vms="inventory.reload"
    />
  </div>
</template>
<style scoped>
.package-page {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
  max-width: var(--app-content-width);
}
</style>
