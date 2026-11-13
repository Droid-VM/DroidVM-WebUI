<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import type { Vm } from '../api/gateway'
import { stateLabelKeys } from '../model/inventory'
import { formatVmMemory } from '../model/format'
import { vmRates } from '../model/usage'
import { useVmActions } from '../model/operations'
import VmActionControls from './VmActionControls.vue'
import { useLogViewer } from '../../logs'
import { useVmConfigSummaries } from '../../configuration'

// Status and controls, access shortcuts, live resources while running, then the facts.
// The console output opens from the logs shortcut, as on phones. Empty sections are omitted.
const { t, n } = useI18n()
const logs = useLogViewer()
const actions = useVmActions()
const summaries = useVmConfigSummaries()
const props = defineProps<{ vm: Vm }>()
const path = computed(() => `/vms/${encodeURIComponent(props.vm.id)}`)
const summary = computed(() => summaries.items.value.get(props.vm.id))
const rates = computed(() => vmRates.value.get(props.vm.id))
const running = computed(() => props.vm.state === 'RUNNING' || props.vm.state === 'SUSPENDED')
const stateText = computed(() =>
  t(props.vm.lifecycle?.uncertain ? 'vmStateUncertain' : stateLabelKeys[props.vm.state]),
)
const uptime = computed(() => {
  if (props.vm.uptimeMs == null) return null
  const minutes = BigInt(props.vm.uptimeMs) / 60000n
  return t('vmUptimeShort', {
    hours: n(Number(minutes / 60n)),
    minutes: n(Number(minutes % 60n)),
  })
})
const stateIcons: Partial<Record<Vm['state'], string>> = {
  RUNNING: 'play',
  SUSPENDED: 'pause',
  STOPPED: 'stop',
}
const stateIcon = computed(
  () => (props.vm.lifecycle?.uncertain ? undefined : stateIcons[props.vm.state]) ?? 'refresh',
)
const stateTone = computed(() =>
  props.vm.lifecycle?.uncertain
    ? 'warning'
    : props.vm.state === 'RUNNING'
      ? 'success'
      : props.vm.state === 'SUSPENDED'
        ? 'warning'
        : props.vm.state === 'STOPPED'
          ? undefined
          : 'primary',
)
const protectionKeys: Record<string, string> = {
  protected_normal: 'vmProtectionOn',
  pseudo_unprotected: 'vmProtectionPseudo',
}
const info = computed(() => {
  const vm = props.vm
  const nics = summary.value?.nics ?? []
  return [
    ['vmInfoCpu', vm.cpuCount === null ? t('notAvailable') : n(vm.cpuCount)],
    ['memory', vm.memoryMiB === null ? t('notAvailable') : formatVmMemory(vm.memoryMiB, n)],
    ['backend', vm.backend || t('notAvailable')],
    ['vmInfoKernel', summary.value?.kernel || t('notAvailable')],
    [
      'vmInfoProtection',
      summary.value
        ? t(protectionKeys[summary.value.protection] ?? 'vmProtectionOff')
        : t('notAvailable'),
    ],
    ['vmInfoDisks', summary.value?.disks.join('\n') || t('notAvailable')],
    [
      'vmInfoNetwork',
      nics.length
        ? nics.map((nic) => [nic.network, nic.mac].filter(Boolean).join(' · ')).join('\n')
        : summary.value
          ? t('vmNoNetwork')
          : t('notAvailable'),
    ],
    [
      'ipAddress',
      vm.ipAddresses?.length
        ? vm.ipAddresses.join('\n')
        : t(vm.ipAddresses == null ? 'notAvailable' : 'vmIpNoLease'),
    ],
  ] as const
})
const forwards = computed(() => (summary.value?.nics ?? []).flatMap((nic) => nic.forwards))
const percent = (value: number) => `${n(Math.round(value))}%`
const rate = (bytes: number) =>
  bytes >= 1048576
    ? `${n(bytes / 1048576, { maximumFractionDigits: 1 })} MiB/s`
    : `${n(bytes / 1024, { maximumFractionDigits: 0 })} KiB/s`
</script>

<template>
  <div class="detail-grid">
    <div class="detail-main">
      <section class="status" :aria-label="t('status')">
        <div class="status-head">
          <span class="state-icon" :data-tone="stateTone"><AppIcon :name="stateIcon" /></span>
          <div class="grow">
            <strong>{{ stateText }}</strong>
            <small v-if="uptime">{{ uptime }}</small>
          </div>
        </div>
        <VmActionControls v-if="actions.supported.value && vm.lifecycle" :vm="vm" expanded />
      </section>
      <nav class="access" :aria-label="t('vmAccess')">
        <RouterLink :to="`${path}/terminal`" class="tile"
          ><AppIcon name="terminal" /><span>{{ t('terminal') }}</span></RouterLink
        >
        <RouterLink v-if="running" :to="`${path}/console`" class="tile"
          ><AppIcon name="monitor" /><span>{{ t('graphicalConsole') }}</span></RouterLink
        >
        <RouterLink v-if="logs.supported.value" :to="`${path}/logs`" class="tile"
          ><AppIcon name="logs" /><span>{{ t('vmLogsShort') }}</span></RouterLink
        >
      </nav>
      <section v-if="running && rates" class="card out block" :aria-label="t('vmResources')">
        <h2>{{ t('vmResources') }}</h2>
        <div class="meters">
          <div>
            <div class="meter">
              <span>CPU</span><span class="value">{{ percent(rates.cpuPercent) }}</span>
            </div>
            <div class="bar"><i :style="{ width: `${rates.cpuPercent}%` }" /></div>
          </div>
          <div>
            <div class="meter">
              <span>{{ t('memory') }}</span
              ><span class="value">{{
                rates.memoryPercent != null ? percent(rates.memoryPercent) : '—'
              }}</span>
            </div>
            <div class="bar"><i :style="{ width: `${rates.memoryPercent ?? 0}%` }" /></div>
          </div>
          <div class="meter io">
            <span>{{ t('vmDiskIo') }}</span
            ><span class="value"
              >{{ rate(rates.readBytesPerSecond) }} / {{ rate(rates.writeBytesPerSecond) }}</span
            >
          </div>
        </div>
      </section>
      <section class="card out block" :aria-label="t('vmInfo')">
        <h2>{{ t('vmInfo') }}</h2>
        <dl class="facts">
          <div v-for="[label, value] in info" :key="label">
            <dt>{{ t(label) }}</dt>
            <dd>{{ value }}</dd>
          </div>
          <div>
            <dt>{{ t('resourceId') }}</dt>
            <dd class="mono">{{ vm.id }}</dd>
          </div>
        </dl>
      </section>
      <section v-if="forwards.length" class="card out block" :aria-label="t('vmPortForwards')">
        <h2>{{ t('vmPortForwards') }}</h2>
        <div v-for="(forward, index) in forwards" :key="index" class="pf">
          <span class="tag p">{{ forward.proto }}</span>
          <span
            >{{ t('vmForwardHost') }} <code>{{ forward.host }}</code> → {{ t('vmForwardGuest') }}
            <code>{{ forward.guest }}</code></span
          >
        </div>
      </section>
      <section v-if="summary?.notes" class="card out block" :aria-label="t('vmNotes')">
        <h2>{{ t('vmNotes') }}</h2>
        <p class="notes">{{ summary.notes }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.detail-main {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.status {
  display: grid;
  gap: 16px;
  padding: 16px;
  border-radius: 16px;
  background: var(--app-color-filled);
}
.status-head {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.status-head strong {
  display: block;
  font-size: 22px;
  font-weight: 400;
  line-height: 28px;
}
.status-head small {
  display: block;
  font-size: 14px;
  line-height: 20px;
  color: var(--md-sys-color-on-surface-variant);
}
.access {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 72px;
  padding: 12px 8px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 12px;
  background: var(--app-color-card);
  color: var(--md-sys-color-on-surface);
  font-size: 14px;
  font-weight: 500;
  text-align: center;
  text-decoration: none;
}
.tile > .icon {
  width: 24px;
  height: 24px;
  color: var(--md-sys-color-primary);
}
.tile:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, var(--app-color-card));
}
.tile:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
}
.card.out.block {
  padding: 16px;
}
.card.out.block h2 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  color: var(--md-sys-color-on-surface-variant);
}
.facts {
  display: grid;
  margin: 0;
}
.facts > div {
  display: grid;
  grid-template-columns: minmax(88px, 30%) minmax(0, 1fr);
  gap: 16px;
  padding: 8px 0;
  border-top: 1px solid var(--md-sys-color-outline-variant);
}
.facts > div:first-child {
  padding-top: 0;
  border-top: 0;
}
.facts > div:last-child {
  padding-bottom: 0;
}
.facts dt {
  color: var(--md-sys-color-on-surface-variant);
}
.facts dd {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.facts .mono {
  font: 13px/20px var(--app-font-mono);
}
.meters {
  display: grid;
  gap: 12px;
}
.meter {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  line-height: 18px;
}
.meter .value {
  color: var(--md-sys-color-on-surface-variant);
  font-variant-numeric: tabular-nums;
}
.meters .bar {
  margin-top: 6px;
}
.notes {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pf {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}
.pf .tag {
  margin: 0;
}
.pf code {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--md-sys-color-surface-container-high);
  font: 13px var(--app-font-mono);
}
@media (width >= 600px) {
  .meters {
    grid-template-columns: 1fr 1fr;
  }
  .meter.io {
    grid-column: 1 / -1;
  }
}
.detail-main {
  max-width: 880px;
}
</style>
