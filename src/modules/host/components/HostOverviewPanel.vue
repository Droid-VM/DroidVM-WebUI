<script setup lang="ts">
import AppLinkButton from '../../../shared/ui/AppLinkButton.vue'
import { useI18n } from 'vue-i18n'
import { useHostMonitoring } from '../model/overview'
import { formatHostBytes } from '../lib/format'
import HostMetrics from './HostMetrics.vue'
import HostObservationState from './HostObservationState.vue'
const host = useHostMonitoring(),
  { t, n, d, locale } = useI18n()
const count = (value: number | null | undefined) => (value == null ? '—' : n(value))
</script>
<template>
  <section class="host-overview" data-testid="host-overview" :aria-label="t('hostOverviewTitle')">
    <header>
      <h1>{{ t('hostOverviewTitle') }}</h1>
    </header>
    <HostObservationState />
    <section class="host-section" :aria-label="t('hostDeviceService')">
      <h2>{{ t('hostDeviceService') }}</h2>
      <dl>
        <div>
          <dt>{{ t('hostDeviceModel') }}</dt>
          <dd>{{ host.data.value?.host.deviceModel ?? '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('hostSoc') }}</dt>
          <dd>{{ host.data.value?.host.socModel ?? '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('hostArchitecture') }}</dt>
          <dd>{{ host.data.value?.host.machine ?? '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('hostKernel') }}</dt>
          <dd data-testid="host-kernel">{{ host.data.value?.host.kernelRelease ?? '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('hostDaemonVersion') }}</dt>
          <dd>{{ host.data.value?.daemon.version ?? '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('hostDaemonPid') }}</dt>
          <dd data-testid="host-daemon-pid">{{ host.data.value?.daemon.pid ?? '—' }}</dd>
        </div>
      </dl>
      <AppLinkButton to="/settings/service">{{ t('webServiceTitle') }}</AppLinkButton>
    </section>
    <section class="host-section" :aria-label="t('hostResources')">
      <h2>{{ t('hostResources') }}</h2>
      <HostMetrics />
    </section>
    <section class="host-section" :aria-label="t('hostInventoryTitle')">
      <h2>{{ t('hostInventoryTitle') }}</h2>
      <dl>
        <div>
          <dt>
            <AppLinkButton to="/vms">{{ t('navVms') }}</AppLinkButton>
          </dt>
          <dd data-testid="host-vm-count">
            {{
              t('hostRunningOf', {
                running: count(host.data.value?.inventory.runningVmCount),
                total: count(host.data.value?.inventory.vmCount),
              })
            }}
          </dd>
        </div>
        <div>
          <dt>
            <AppLinkButton to="/resources/network">{{ t('hostNetworkCount') }}</AppLinkButton>
          </dt>
          <dd data-testid="host-network-count">
            {{
              t('hostRunningOf', {
                running: count(host.data.value?.inventory.runningNetworkCount),
                total: count(host.data.value?.inventory.networkCount),
              })
            }}
          </dd>
        </div>
        <div>
          <dt>
            <AppLinkButton to="/resources/disk">{{ t('hostDiskCount') }}</AppLinkButton>
          </dt>
          <dd data-testid="host-disk-count">{{ count(host.data.value?.inventory.diskCount) }}</dd>
        </div>
        <div>
          <dt>{{ t('hostDiskVirtual') }}</dt>
          <dd>{{ formatHostBytes(host.data.value?.inventory.diskVirtualBytes, locale) }}</dd>
        </div>
      </dl>
      <p v-if="host.data.value?.inventory.diskVirtualBytes == null" class="muted">
        {{ t('hostDiskVirtualUnknown') }}
      </p>
      <p v-if="host.data.value?.inventory.diskVirtualKnownCount != null" class="muted">
        {{
          t('hostDiskVirtualCoverage', {
            known: count(host.data.value.inventory.diskVirtualKnownCount),
            total: count(host.data.value.inventory.diskCount),
          })
        }}
      </p>
      <p v-if="host.data.value?.inventory.diskVirtualObservedAtMs != null" class="muted">
        {{
          t('hostDiskVirtualObserved', {
            time: d(Number(host.data.value.inventory.diskVirtualObservedAtMs), {
              dateStyle: 'short',
              timeStyle: 'medium',
            }),
          })
        }}
      </p>
    </section>
  </section>
</template>
<style scoped>
.host-overview {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
h1,
h2,
p {
  margin: 0;
}
header {
  display: grid;
  gap: var(--space-2);
}
h2 {
  font-size: var(--md-sys-typescale-title-medium-size);
}
.host-section {
  padding: var(--space-4);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  background: var(--app-color-raised);
}
dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  gap: var(--space-3);
}
dl > div {
  min-width: 0;
}
dt {
  font-size: var(--md-sys-typescale-body-medium-size);
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 5px;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
p {
  font-size: var(--md-sys-typescale-body-medium-size);
  overflow-wrap: anywhere;
}
@media (width < 600px) {
  dl {
    grid-template-columns: 1fr;
  }
  .host-section {
    padding: var(--space-3);
  }
}
</style>
