<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { Vm } from '../api/gateway'
import { stateLabelKeys } from '../model/inventory'
import VmActionControls from './VmActionControls.vue'
import { useLogViewer } from '../../logs'
import { useVmTerminal } from '../../terminal'
import { useConfigurationEditor } from '../../configuration'
const { t, n } = useI18n()
const logs = useLogViewer()
const terminal = useVmTerminal()
const configuration = useConfigurationEditor()
const props = defineProps<{ vm: Vm }>()
const uptime = computed(() => {
  if (props.vm.uptimeMs == null) return t('notAvailable')
  const seconds = BigInt(props.vm.uptimeMs) / 1000n
  return t('vmObservedUptime', {
    days: n(Number(seconds / 86400n)),
    hours: n(Number((seconds / 3600n) % 24n)),
    minutes: n(Number((seconds / 60n) % 60n)),
    seconds: n(Number(seconds % 60n)),
  })
})
</script>

<template>
  <dl class="details">
    <div>
      <dt>{{ t('name') }}</dt>
      <dd>{{ vm.name }}</dd>
    </div>
    <div>
      <dt>{{ t('status') }}</dt>
      <dd>{{ t(vm.lifecycle?.uncertain ? 'vmStateUncertain' : stateLabelKeys[vm.state]) }}</dd>
    </div>
    <div>
      <dt>{{ t('backend') }}</dt>
      <dd>{{ vm.backend || t('notAvailable') }}</dd>
    </div>
    <div>
      <dt>{{ t('resourceId') }}</dt>
      <dd>{{ vm.id }}</dd>
    </div>
    <div>
      <dt>{{ t('processor') }}</dt>
      <dd>{{ vm.cpuCount === null ? t('notAvailable') : `${n(vm.cpuCount)} vCPU` }}</dd>
    </div>
    <div>
      <dt>{{ t('memory') }}</dt>
      <dd>{{ vm.memoryMiB === null ? t('notAvailable') : `${n(vm.memoryMiB)} MiB` }}</dd>
    </div>
    <div>
      <dt>{{ t('ipAddress') }}</dt>
      <dd>
        {{
          vm.ipAddresses?.length
            ? vm.ipAddresses.join(' · ')
            : t(vm.ipAddresses == null ? 'notAvailable' : 'vmIpNoLease')
        }}
      </dd>
      <small>{{ t('vmIpObservedHint') }}</small>
    </div>
    <div>
      <dt>{{ t('uptime') }}</dt>
      <dd>{{ uptime }}</dd>
      <small>{{ t('vmUptimeHint') }}</small>
    </div>
    <div>
      <dt>{{ t('systemDisk') }}</dt>
      <dd>{{ t('unavailable') }}</dd>
    </div>
  </dl>
  <div class="detail-actions">
    <RouterLink
      v-if="configuration.supported.value"
      class="btn tonal"
      :to="`/vms/${encodeURIComponent(vm.id)}/edit`"
      >{{ t('configEdit') }}</RouterLink
    >
    <RouterLink
      v-if="configuration.supported.value"
      class="btn tonal"
      :to="`/vms/${encodeURIComponent(vm.id)}/copy`"
      >{{ t('configCopy') }}</RouterLink
    >
    <RouterLink
      v-if="logs.supported.value"
      class="btn tonal"
      :to="`/vms/${encodeURIComponent(vm.id)}/logs`"
      >{{ t('vmLogs') }}</RouterLink
    >
    <RouterLink class="btn tonal" :to="`/vms/${encodeURIComponent(vm.id)}/console`">{{
      t('graphicalConsole')
    }}</RouterLink>
    <RouterLink
      v-if="terminal.supported.value"
      class="btn quiet"
      :to="`/vms/${encodeURIComponent(vm.id)}/terminal`"
      >{{ t('terminal') }}</RouterLink
    >
  </div>
  <VmActionControls :vm="vm" expanded />
  <p class="muted">{{ t('sessionEntryHint') }}</p>
</template>

<style scoped>
.details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-5);
  margin: 0 0 var(--space-6);
}
.details > div {
  min-width: 0;
}
dt {
  font-size: var(--font-xs);
  color: var(--muted);
  margin-bottom: 6px;
}
dd {
  margin: 0;
  font-size: var(--font-body);
  overflow-wrap: anywhere;
}
small {
  color: var(--muted);
  font-size: var(--font-xs);
}
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
