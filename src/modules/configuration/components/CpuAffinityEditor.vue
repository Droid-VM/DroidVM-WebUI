<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CpuCorePicker, useResourceCatalog } from '../../resources'
import { affinityRows, setCpuAffinity } from '../model/cpuAffinity'
import { cloneConfiguration, type ConfigObject } from '../model/document'
import { oneToOnePlacement, simpleHostSelection, vcpuCount } from '../model/cpuPlacement'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog.vue'
const props = defineProps<{ document: ConfigObject; disabled: boolean }>()
const emit = defineEmits<{ change: [document: ConfigObject] }>()
const { t } = useI18n()
const source = useResourceCatalog().cpus
const count = computed(() => vcpuCount(props.document))
const mapping = computed(() => affinityRows(props.document.cpu_affinity))
const simple = computed(() => simpleHostSelection(props.document, source.items.value))
const proposed = ref<ReturnType<typeof oneToOnePlacement>>(null)
watch([() => props.document, () => props.disabled], () => {
  proposed.value = null
})
function propose(cores: string) {
  if (!props.disabled) proposed.value = oneToOnePlacement(cores)
}
function applySimple() {
  if (props.disabled || !proposed.value) return
  const row = cloneConfiguration(props.document)
  row.cpu_count = proposed.value.count
  row.cpu_affinity = proposed.value.affinity
  row.cpu_topology_auto = true
  row.cpu_capacity = ''
  row.cpu_clusters = ''
  proposed.value = null
  emit('change', row)
}
function select(vcpu: number, cores: string) {
  if (props.disabled) return
  const affinity = setCpuAffinity(props.document.cpu_affinity, vcpu, cores)
  if (affinity === null) return
  const row = cloneConfiguration(props.document)
  row.cpu_affinity = affinity
  emit('change', row)
}
</script>

<template>
  <details v-if="source.supported.value" class="cpu-affinity">
    <summary>{{ t('cpuAffinityPicker') }}</summary>
    <p v-if="!mapping || !count">{{ t('cpuFixText') }}</p>
    <template v-else>
      <CpuCorePicker
        :current="simple"
        :title="t('cpuOneToOne')"
        :disabled="disabled || source.status.value !== 'ready'"
        :selection-limit="{ minimum: 1, maximum: 64 }"
        :hint="t('cpuOneToOneHint')"
        confirm-unchanged
        @select="propose"
      />
      <div class="vcpu-list">
        <div v-for="number in count" :key="number" class="vcpu-row">
          <p>vCPU{{ number - 1 }} · {{ mapping.get(number - 1) || t('cpuUnbound') }}</p>
          <CpuCorePicker
            :current="mapping.get(number - 1) ?? ''"
            :title="t('cpuChooseVcpu', { number: number - 1 })"
            :disabled="disabled"
            @select="select(number - 1, $event)"
          />
        </div>
      </div>
    </template>
    <ConfirmDialog
      :open="!!proposed"
      :title="t('cpuOneToOneConfirm')"
      :description="
        proposed
          ? t('cpuOneToOneChanges', { before: count, after: proposed.count, hosts: proposed.hosts })
          : ''
      "
      @cancel="proposed = null"
      @confirm="applySimple"
    />
  </details>
</template>

<style scoped>
.cpu-affinity {
  min-width: 0;
}
summary {
  cursor: pointer;
  padding: var(--space-2) 0;
}
.vcpu-list {
  margin-top: var(--space-3);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: var(--space-3);
}
.vcpu-row {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
}
p {
  overflow-wrap: anywhere;
}
</style>
