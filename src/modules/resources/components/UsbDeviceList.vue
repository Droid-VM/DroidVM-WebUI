<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MessageKey } from '../../../shared/i18n'
import { useResourceCatalog } from '../model/catalog'
import { useUsbActions } from '../model/usbOperations'
import type { UsbDevice } from '../api/gateway'
import type { UsbTarget } from '../api/usbOperations'
import UsbTargetDialog from './UsbTargetDialog.vue'
import UsbOperationStatus from './UsbOperationStatus.vue'
import { useVisiblePolling } from '../../../shared/model/visiblePolling'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import SearchField from '../../../shared/ui/SearchField.vue'
import EmptyState from '../../../shared/ui/EmptyState.vue'

const { t } = useI18n(),
  source = useResourceCatalog().usb,
  query = ref('')
const actions = useUsbActions(),
  selected = ref<UsbDevice | null>(null)
async function refresh() {
  await actions.reconcile()
  return source.refresh()
}
function submit(device: UsbDevice, target: UsbTarget) {
  selected.value = null
  void actions.submit(device, target)
}
const states: Record<string, MessageKey> = {
  host: 'usbStateHost',
  claimed: 'usbStateClaimed',
  idle: 'usbStateIdle',
  unknown: 'usbStateUnknown',
}
const visible = computed(() =>
  source.items.value.filter((device) =>
    [
      device.product,
      device.manufacturer,
      device.serial,
      device.sysfs,
      `${device.vendorId}:${device.productId}`,
      device.owner?.vmName,
      device.owner?.vmId,
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.value.trim().toLocaleLowerCase()),
  ),
)
useVisiblePolling(() => source.supported.value, refresh)
</script>

<template>
  <section class="usb-list" :aria-label="t('usbDevices')">
    <UsbOperationStatus />
    <EmptyState
      v-if="!source.supported.value"
      :title="t('resourceUnavailable', { resource: t('usbDevices') })"
      :description="t('resourcesUnavailableHint')"
      icon="usb"
    />
    <template v-else>
      <p class="muted">{{ t('usbCatalogHint') }}</p>
      <div class="list-tools">
        <SearchField
          v-model="query"
          :label="t('resourceSearch')"
          :placeholder="t('resourceSearch')"
        />
        <AppButton
          tone="icon"
          :aria-label="t('refreshList')"
          :title="t('refreshList')"
          @click="refresh"
          ><AppIcon name="refresh"
        /></AppButton>
      </div>
      <AppNotice v-if="source.problem.value" tone="error" :title="t(source.problem.value.titleKey)">
        <p>{{ t(source.problem.value.descriptionKey) }}</p>
      </AppNotice>
      <p v-if="source.status.value === 'loading'" role="status">{{ t('processing') }}</p>
      <p v-else-if="source.status.value === 'ready' && !visible.length" class="muted">
        {{ t(query.trim() ? 'usbNoMatches' : 'usbNoDevices') }}
      </p>
      <article v-for="device in visible" :key="device.id" class="usb-card" :data-usb-id="device.id">
        <h2>{{ device.product || `${device.vendorId}:${device.productId}` }}</h2>
        <p v-if="device.manufacturer" class="muted">{{ device.manufacturer }}</p>
        <p>
          {{ t(states[device.state]!) }}<span v-if="device.locked"> · {{ t('usbLocked') }}</span>
        </p>
        <dl>
          <dt>{{ t('usbLocation') }}</dt>
          <dd>{{ device.sysfs }}</dd>
          <dt>VID:PID</dt>
          <dd>{{ device.vendorId }}:{{ device.productId }}</dd>
          <template v-if="device.serial"
            ><dt>{{ t('usbSerial') }}</dt>
            <dd>{{ device.serial }}</dd></template
          >
          <template v-if="device.speed"
            ><dt>{{ t('usbSpeed') }}</dt>
            <dd>{{ device.speed }} Mbps</dd></template
          >
          <template v-if="device.owner">
            <dt>{{ t('usbOwner') }}</dt>
            <dd>{{ device.owner.vmName || device.owner.vmId }}</dd>
            <dt v-if="device.owner.controllerId">{{ t('configControllerId') }}</dt>
            <dd v-if="device.owner.controllerId">{{ device.owner.controllerId }}</dd>
            <dt v-if="device.owner.port !== null">{{ t('usbGuestPort') }}</dt>
            <dd v-if="device.owner.port !== null">{{ device.owner.port }}</dd>
          </template>
        </dl>
        <p v-if="device.state === 'claimed' && !device.owner" class="muted">
          {{ t('usbOwnerUnknown') }}
        </p>
        <AppButton
          v-if="actions.supported.value"
          :disabled="!actions.allowed(device) || source.status.value !== 'ready'"
          @click="selected = { ...device, owner: device.owner ? { ...device.owner } : null }"
          >{{ t('usbChangeTarget') }}</AppButton
        >
      </article>
    </template>
    <UsbTargetDialog
      :device="selected"
      :targets="source.targets.value"
      :enabled="!!selected && source.status.value === 'ready' && actions.allowed(selected)"
      @close="selected = null"
      @submit="submit"
    />
  </section>
</template>

<style scoped>
.usb-list {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.list-tools {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.list-tools .search-field {
  flex: 1;
}
.btn {
  justify-self: start;
}
.usb-card {
  padding: var(--space-4);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--app-color-card);
  overflow-wrap: anywhere;
}
h2 {
  font-size: var(--md-sys-typescale-title-medium-size);
  margin: 0;
}
p {
  margin: var(--space-2) 0;
}
dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: var(--space-2);
}
dt {
  color: var(--md-sys-color-on-surface-variant);
}
dd {
  margin: 0;
}
</style>
