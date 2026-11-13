<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Vm } from '../api/gateway'
import type { VmAction } from '../api/operations'
import { useVmActions, vmActionKeys } from '../model/operations'
import { useInventory } from '../model/inventory'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog.vue'
// `compact` is the list item's single trailing icon; `expanded` is the detail control grid
// laid out like the App: run, reboot and suspend, then the power and sleep keys, all as
// equal-width labelled buttons.
const props = defineProps<{ vm: Vm; expanded?: boolean; compact?: boolean }>()
const icons: Record<VmAction, string> = {
  start: 'play',
  stop: 'stop',
  reboot: 'refresh',
  suspend: 'pause',
  resume: 'play',
  powerbtn: 'power',
  sleepbtn: 'sleep',
}
const { t } = useI18n()
const model = useVmActions()
const inventory = useInventory()
const entry = computed(() => model.entries.value[props.vm.id])
const selected = ref<{ vm: Vm; action: VmAction } | null>(null)
const offered = computed(() => props.vm.lifecycle?.actions ?? [])
// The list offers one control: resume a suspended VM, start a stopped one, else stop.
const trailing = computed<VmAction | null>(
  () =>
    (['resume', 'start', 'stop'] as const).find((action) => offered.value.includes(action)) ?? null,
)
const running = computed(() => props.vm.state !== 'STOPPED')
// Fixed slots keep the grid stable; actions the daemon does not offer are disabled.
const grid = computed(() => {
  const toggle: VmAction = offered.value.includes('start') || !running.value ? 'start' : 'stop'
  const pause: VmAction = props.vm.state === 'SUSPENDED' ? 'resume' : 'suspend'
  return {
    lead: [toggle, 'reboot', pause] as VmAction[],
    keys: ['powerbtn', 'sleepbtn'] as VmAction[],
  }
})
const enabled = (action: VmAction) =>
  inventory.status.value === 'ready' && model.allowed(props.vm, action)
const tone = (action: VmAction, index: number) =>
  index === 0 ? (action === 'stop' ? 'filled-danger' : 'filled') : 'tonal'
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
    :class="{ compact, expanded }"
    :aria-label="t('vmActions')"
  >
    <div class="buttons">
      <AppButton
        v-if="compact && trailing"
        tone="icon"
        :aria-label="t(vmActionKeys[trailing])"
        :title="t(vmActionKeys[trailing])"
        :disabled="!enabled(trailing)"
        @click="selected = { vm, action: trailing }"
        ><AppIcon :name="icons[trailing]"
      /></AppButton>
      <div v-else-if="expanded" class="grid">
        <div class="grid-row">
          <button
            v-for="(action, index) in grid.lead"
            :key="action"
            type="button"
            class="btn icon-lead"
            :class="tone(action, index)"
            :disabled="!enabled(action)"
            @click="selected = { vm, action }"
          >
            <AppIcon :name="icons[action]" />{{ t(vmActionKeys[action]) }}
          </button>
        </div>
        <div class="grid-row">
          <button
            v-for="action in grid.keys"
            :key="action"
            type="button"
            class="btn tonal icon-lead"
            :disabled="!enabled(action)"
            @click="selected = { vm, action }"
          >
            <AppIcon :name="icons[action]" />{{ t(vmActionKeys[action]) }}
          </button>
        </div>
      </div>
      <AppButton
        v-for="action in offered"
        v-else-if="!compact"
        :key="action"
        :tone="action === 'start' || action === 'resume' ? 'primary' : 'tonal'"
        :disabled="!enabled(action)"
        @click="selected = { vm, action }"
      >
        <AppIcon :name="icons[action]" />{{ t(vmActionKeys[action]) }}
      </AppButton>
      <AppButton
        v-if="entry?.state === 'unknown' || entry?.state === 'waiting'"
        :disabled="model.checking.value"
        @click="model.reconcile"
        >{{ t('queryStatus') }}</AppButton
      >
    </div>
    <p v-if="vm.lifecycle.uncertain" class="warning" role="status">{{ t('vmControlUncertain') }}</p>
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
  min-width: 0;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.grid {
  display: grid;
  flex: 1 1 100%;
  gap: 8px;
  min-width: 0;
}
.grid-row {
  display: grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  gap: 8px;
}
.grid-row > .btn {
  width: 100%;
  min-width: 0;
  padding-inline: 12px;
}
p {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  overflow-wrap: anywhere;
}
.warning {
  color: var(--app-color-warning);
}
.compact .buttons {
  flex-wrap: nowrap;
  gap: 0;
}
</style>
