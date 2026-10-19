<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UsbDevice, UsbVmTarget } from '../api/gateway'
import type { UsbTarget } from '../api/usbOperations'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'

const props = defineProps<{
  device: UsbDevice | null
  targets: readonly UsbVmTarget[]
  enabled: boolean
}>()
const emit = defineEmits<{ close: []; submit: [device: UsbDevice, target: UsbTarget] }>()
const { t } = useI18n()
const selected = ref('host')
// Freeze the choices shown at confirmation. Polling must not silently replace
// the selected VM instance or device observation with newer values.
const targetChoices = ref<UsbVmTarget[]>([])
watch(
  () => props.device,
  () => {
    selected.value = 'host'
    targetChoices.value = props.targets.map((target) => ({ ...target }))
  },
)
const target = computed<UsbTarget | null>(() => {
  if (selected.value === 'host' || selected.value === 'idle') return { kind: selected.value }
  const vm = targetChoices.value.find((value) => `vm:${value.vmId}` === selected.value)
  if (!vm) return null
  return {
    kind: 'vm',
    vmId: vm.vmId,
    instanceId: vm.instanceId,
    revision: vm.revision,
    controllerId: vm.controllerId,
  }
})
function submit() {
  if (props.enabled && props.device && target.value) emit('submit', props.device, target.value)
}
</script>

<template>
  <AppDialog :open="!!device" :title="t('usbChangeTarget')" @close="emit('close')">
    <template v-if="device">
      <p>{{ device.product || `${device.vendorId}:${device.productId}` }} · {{ device.sysfs }}</p>
      <p>{{ t('usbTargetConfirm') }}</p>
      <AppSelect v-model="selected" :label="t('usbTarget')" :disabled="!enabled">
        <AppOption value="host">{{ t('usbTargetHost') }}</AppOption>
        <AppOption value="idle">{{ t('usbTargetIdle') }}</AppOption>
        <AppOption v-for="vm in targetChoices" :key="vm.vmId" :value="`vm:${vm.vmId}`">
          {{ vm.vmName || vm.vmId }} · {{ vm.controllerId }}
        </AppOption>
      </AppSelect>
      <p v-if="!targetChoices.length" class="muted">{{ t('usbNoTargets') }}</p>
      <p class="muted">{{ t('usbManualLockHint') }}</p>
      <div class="usb-target-actions">
        <AppButton @click="emit('close')">{{ t('cancel') }}</AppButton>
        <AppButton tone="primary" :disabled="!enabled || !target" @click="submit">{{
          t('confirm')
        }}</AppButton>
      </div>
    </template>
  </AppDialog>
</template>

<style scoped>
.usb-target-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}
p {
  overflow-wrap: anywhere;
}
</style>
