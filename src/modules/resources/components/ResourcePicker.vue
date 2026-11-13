<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DiskResource, NetworkResource, ResourceKind } from '../api/gateway'
import { useResourceCatalog } from '../model/catalog'
import { useVisiblePolling } from '../../../shared/model/visiblePolling'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'
const props = defineProps<{
  kind: Extract<ResourceKind, 'disk' | 'network'>
  disabled: boolean
  replacing?: boolean
}>()
const emit = defineEmits<{
  disk: [value: DiskResource]
  network: [value: NetworkResource]
  cancel: []
}>()
const { t } = useI18n(),
  catalog = useResourceCatalog(),
  selected = ref('')
const source = computed(() => (props.kind === 'disk' ? catalog.disks : catalog.networks))
watch(
  () => [props.kind, props.replacing],
  () => {
    selected.value = ''
  },
)
useVisiblePolling(
  () => source.value.supported.value,
  () => source.value.refresh(),
  ['disks', 'networks'],
)
const choices = computed(() =>
  props.kind === 'disk'
    ? catalog.disks.items.value.filter((row) => row.selectable)
    : catalog.networks.items.value,
)
const canAdd = computed(
  () =>
    !props.disabled &&
    source.value.status.value === 'ready' &&
    choices.value.some((row) => row.id === selected.value),
)
function add() {
  if (!canAdd.value) return
  if (props.kind === 'disk') {
    const value = catalog.disks.items.value.find(
      (row) => row.id === selected.value && row.selectable,
    )
    if (value) emit('disk', value)
  } else {
    const value = catalog.networks.items.value.find((row) => row.id === selected.value)
    if (value) emit('network', value)
  }
  selected.value = ''
}
</script>
<template>
  <section v-if="source.supported.value" class="resource-picker">
    <AppNotice v-if="source.problem.value" tone="error" :title="t(source.problem.value.titleKey)">
      <p>{{ t(source.problem.value.descriptionKey) }}</p>
      <AppButton @click="source.refresh">{{ t('refreshList') }}</AppButton>
    </AppNotice>
    <AppSelect
      v-model="selected"
      :label="t(kind === 'disk' ? 'resourceChooseDisk' : 'resourceChooseNetwork')"
      :disabled="disabled || source.status.value !== 'ready'"
    >
      <AppOption value="" disabled>
        {{ t(source.status.value === 'loading' ? 'processing' : 'resourceChoose') }}
      </AppOption>
      <AppOption v-for="item in choices" :key="item.id" :value="item.id">
        {{ item.name || item.id }}
      </AppOption>
    </AppSelect>
    <p v-if="source.status.value === 'ready' && !choices.length" class="muted">
      {{ t('resourceNoneSelectable') }}
    </p>
    <AppButton :disabled="!canAdd" @click="add">{{
      t(
        replacing
          ? kind === 'disk'
            ? 'resourceReplaceDisk'
            : 'resourceReplaceNetwork'
          : kind === 'disk'
            ? 'resourceAttachDisk'
            : 'resourceAttachNetwork',
      )
    }}</AppButton>
    <AppButton v-if="replacing" :disabled="disabled" @click="emit('cancel')">{{
      t('cancel')
    }}</AppButton>
  </section>
</template>
<style scoped>
.resource-picker {
  display: grid;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  min-width: 0;
}
.btn {
  justify-self: start;
}
</style>
