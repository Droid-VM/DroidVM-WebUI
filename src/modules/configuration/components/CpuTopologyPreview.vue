<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResourceCatalog } from '../../resources'
import { cpuPlacementPreview, guestCpuSet } from '../model/cpuPlacement'
import { fieldText, type ConfigObject } from '../model/document'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'

const props = defineProps<{ document: ConfigObject; active: boolean }>()
const { t } = useI18n()
const source = useResourceCatalog().cpus
const crosvm = computed(() => fieldText(props.document.backend).toLowerCase() === 'crosvm')
watch(
  () => props.active && crosvm.value && source.supported.value,
  (value) => {
    if (value) void source.refresh()
  },
  { immediate: true },
)
const preview = computed(() =>
  source.status.value === 'ready' ? cpuPlacementPreview(props.document, source.items.value) : null,
)
const groups = computed(() => {
  const entries = new Map<number, number[]>()
  for (const { vcpu, value } of preview.value?.capacity ?? [])
    entries.set(value, [...(entries.get(value) ?? []), vcpu])
  return [...entries].sort((a, b) => a[0] - b[0])
})
</script>

<template>
  <section v-if="source.supported.value" class="cpu-preview" :aria-label="t('cpuTopologyPreview')">
    <h4>{{ t('cpuTopologyPreview') }}</h4>
    <p v-if="!crosvm">{{ t('cpuTopologyCrosvmOnly') }}</p>
    <template v-else>
      <p>{{ t('cpuTopologyHint') }}</p>
      <AppNotice v-if="source.problem.value" tone="error" :title="t(source.problem.value.titleKey)">
        <p>{{ t(source.problem.value.descriptionKey) }}</p>
      </AppNotice>
      <AppButton @click="source.refresh">{{ t('cpuRefreshTopology') }}</AppButton>
      <p v-if="source.status.value !== 'ready'">{{ t('cpuTopologyWaiting') }}</p>
      <p v-else-if="!preview">{{ t('cpuTopologyInvalid') }}</p>
      <p v-else-if="!preview.capacity.length">{{ t('cpuTopologyUnset') }}</p>
      <template v-else>
        <p v-if="preview.incomplete" class="cpu-warning">{{ t('cpuTopologyIncomplete') }}</p>
        <table>
          <thead>
            <tr>
              <th scope="col">vCPU</th>
              <th scope="col">{{ t('cpuTopologyCapacity') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="[capacity, ids] in groups" :key="capacity">
              <td>{{ guestCpuSet(ids) }}</td>
              <td>{{ capacity }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="preview.clusters.length < 2">{{ t('cpuTopologySingleCluster') }}</p>
        <ul v-else>
          <li v-for="(cluster, index) in preview.clusters" :key="index">
            {{ t('cpuTopologyCluster', { number: index + 1, cpus: guestCpuSet(cluster) }) }}
          </li>
        </ul>
      </template>
    </template>
  </section>
</template>

<style scoped>
.cpu-preview {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
h4 {
  margin: 0;
}
p,
li {
  overflow-wrap: anywhere;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  text-align: start;
  padding: var(--space-2);
  border-bottom: 1px solid var(--line);
  overflow-wrap: anywhere;
}
.cpu-warning {
  color: var(--muted);
}
</style>
