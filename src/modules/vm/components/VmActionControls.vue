<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Vm } from '../api/gateway'
import type { VmAction } from '../api/operations'
import { useVmActions, vmActionKeys } from '../model/operations'
import { useInventory } from '../model/inventory'
import AppButton from '../../../shared/ui/AppButton.vue'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog.vue'
const props = defineProps<{ vm: Vm; expanded?: boolean }>()
const { t } = useI18n()
const model = useVmActions()
const inventory = useInventory()
const entry = computed(() => model.entries.value[props.vm.id])
const selected = ref<{ vm: Vm; action: VmAction } | null>(null)
const choices = computed(() =>
  (props.vm.lifecycle?.actions ?? []).filter(
    (action) => props.expanded || ['start', 'stop', 'resume'].includes(action),
  ),
)
const locked = computed(() => !!entry.value && entry.value.state !== 'done')
async function confirm() {
  if (!selected.value) return
  const { vm, action } = selected.value
  await model.submit(vm, action)
  selected.value = null
}
</script>

<template>
  <section
    v-if="model.supported.value && vm.lifecycle"
    class="vm-actions"
    :aria-label="t('vmActions')"
  >
    <div class="buttons">
      <AppButton
        v-for="action in choices"
        :key="action"
        :tone="action === 'start' ? 'tonal' : 'quiet'"
        :disabled="inventory.status.value !== 'ready' || !model.allowed(vm, action)"
        @click="selected = { vm, action }"
      >
        {{ t(vmActionKeys[action]) }}
      </AppButton>
      <AppButton
        v-if="entry?.state === 'unknown' || entry?.state === 'waiting'"
        :disabled="model.checking.value"
        @click="model.reconcile"
        >{{ t('queryStatus') }}</AppButton
      >
    </div>
    <p v-if="vm.lifecycle.uncertain" class="warning" role="status">{{ t('vmControlUncertain') }}</p>
    <p v-if="entry?.restored" data-testid="operation-tracking-restored">
      {{ t('operationTrackingHint') }}
    </p>
    <p
      v-if="entry"
      :class="{ warning: entry.state === 'unknown' || entry.task?.state === 'failed' }"
      role="status"
    >
      <template v-if="entry.state === 'posting'">{{ t('processing') }}</template>
      <template v-else-if="entry.state === 'unknown'">{{ t('vmOperationUnknown') }}</template>
      <template v-else-if="entry.task?.state === 'failed'"
        >{{ t('taskFailed') }} · {{ entry.task.errorCode }}</template
      >
      <template v-else-if="entry.task?.state === 'cancelled'">{{ t('taskCancelled') }}</template>
      <template v-else-if="entry.state === 'done' && entry.task?.state === 'succeeded'">{{
        t('vmOperationAdmitted')
      }}</template>
      <template v-else-if="locked">{{ t('vmOperationWaiting') }}</template>
      <template v-else-if="entry.problem">{{ t(entry.problem.descriptionKey) }}</template>
    </p>
    <ConfirmDialog
      :open="!!selected"
      :title="selected ? t(vmActionKeys[selected.action]) : t('vmActions')"
      :description="
        t('vmOperationConfirm', {
          name: selected?.vm.name ?? '',
          action: selected ? t(vmActionKeys[selected.action]) : '',
        })
      "
      :confirm-label="selected ? t(vmActionKeys[selected.action]) : undefined"
      :busy="entry?.state === 'posting'"
      @cancel="selected = null"
      @confirm="confirm"
    />
  </section>
</template>

<style scoped>
.vm-actions {
  margin-block: var(--space-3);
  min-width: 0;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
p {
  margin: var(--space-2) 0;
  font-size: var(--font-sm);
  color: var(--muted);
  overflow-wrap: anywhere;
}
.warning {
  color: var(--warn);
}
</style>
