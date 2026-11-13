<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useNetworkRuntime } from '../model/runtime'
import { networkModeLine, networkPoolRange } from '../model/summary'
import { taskStateKeys } from '../../tasks'
import { useVisiblePolling } from '../../../shared/model/visiblePolling'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog.vue'
defineProps<{ inline?: boolean }>()
const model = useNetworkRuntime(),
  { t } = useI18n()
const detail = computed(() => model.detail.value)
const stateKeys = {
  STOPPED: 'networkStopped',
  STARTING: 'networkStarting',
  RUNNING: 'networkRunning',
  RECOVERING: 'networkRecovering',
  STOPPING: 'networkStopping',
  FAILED: 'networkFailed',
} as const
const stateTone = computed(() => {
  const state = detail.value?.runtime.state
  if (state === 'RUNNING') return 'success'
  if (state === 'FAILED') return 'error'
  return state === 'STOPPED' ? undefined : 'warning'
})
const running = computed(() => detail.value?.runtime.state === 'RUNNING')
const mode = computed(() => (detail.value ? networkModeLine(detail.value.network, t) : ''))
// One address and pool row per VLAN that has IPv4 configured.
const families = computed(() =>
  (detail.value?.network.vlans ?? [])
    .flatMap((vlan) => [vlan.ipv4, vlan.ipv6].map((family) => ({ vlan: vlan.id, family })))
    .filter((entry) => entry.family.cidr),
)
const tagged = computed(() => families.value.some((entry) => entry.vlan))
// A lease names its VM through the attachment with the same MAC.
function leaseName(mac: string, hostname: string | null | undefined) {
  const owner = detail.value?.attachments.find(
    (item) => item.mac && item.mac.toLowerCase() === mac.toLowerCase(),
  )
  return owner?.vmName || owner?.vmId || hostname || mac
}
const vms = computed(() => {
  const seen = new Map<string, { vmId: string; vmName: string; macs: string[] }>()
  for (const item of detail.value?.attachments ?? []) {
    const entry = seen.get(item.vmId) ?? { vmId: item.vmId, vmName: item.vmName, macs: [] }
    if (item.mac) entry.macs.push(item.mac)
    seen.set(item.vmId, entry)
  }
  return [...seen.values()]
})
useVisiblePolling(
  () => !!model.id.value && model.supported.value,
  async () => {
    await model.reconcile()
    return model.refresh()
  },
  ['networks', 'tasks'],
)
</script>
<template>
  <AppDialog
    :open="!!model.id.value"
    :inline="inline"
    :title="detail?.network.name || t('networkDetails')"
    page
    @close="model.close"
  >
    <div class="network-details">
      <!-- App network info header: state card with start/stop, edit and delete. -->
      <section v-if="detail" class="state-card" :aria-label="t('networkRuntimeState')">
        <div class="state-head">
          <span class="state-icon" :data-tone="stateTone"><AppIcon name="network" /></span>
          <div class="grow">
            <strong>{{ t(stateKeys[detail.runtime.state]) }}</strong>
            <small>{{ mode }}</small>
          </div>
        </div>
        <div class="btn-grid">
          <template v-if="model.supportedActions.value">
            <button
              v-if="running"
              type="button"
              class="btn filled-danger icon-lead"
              :disabled="!model.allowed('stop')"
              @click="model.prepare('stop')"
            >
              <AppIcon name="stop" />{{ t('stop') }}
            </button>
            <button
              v-else
              type="button"
              class="btn filled icon-lead"
              :disabled="!model.allowed('start')"
              @click="model.prepare('start')"
            >
              <AppIcon name="play" />{{ t('start') }}
            </button>
          </template>
          <slot name="actions" />
        </div>
      </section>
      <div v-else class="btn-grid">
        <slot name="actions" />
      </div>
      <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
        ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p v-if="model.loading.value && !detail" role="status">{{ t('processing') }}</p>
      <section v-if="model.entry.value" aria-live="polite" data-testid="network-operation-status">
        <p v-if="model.entry.value.state === 'unknown'">{{ t('networkActionUnknown') }}</p>
        <p v-if="model.entry.value.task">
          {{ t(taskStateKeys[model.entry.value.task.state]) }}
          <span v-if="model.entry.value.task.errorCode"
            >· {{ model.entry.value.task.errorCode }}</span
          >
        </p>
        <AppNotice
          v-if="model.entry.value.problem"
          tone="warning"
          :title="t(model.entry.value.problem.titleKey)"
        >
          <p>{{ t(model.entry.value.problem.descriptionKey) }}</p>
        </AppNotice>
        <AppButton
          v-if="model.entry.value.state !== 'done'"
          :disabled="model.checking.value"
          @click="model.reconcile"
          >{{ t('queryStatus') }}</AppButton
        >
      </section>
      <div v-if="detail" class="card out groups">
        <details class="cc" open>
          <summary>
            <span>{{ t('networkTabInfo') }}</span>
          </summary>
          <div v-for="entry in families" :key="`${entry.vlan}:${entry.family.cidr}`">
            <div class="row">
              <div class="rt">
                <span class="a"
                  >{{ t('networkAddress')
                  }}<template v-if="tagged"> · VLAN {{ entry.vlan }}</template></span
                >
                <span class="b">{{ entry.family.cidr }}</span>
              </div>
            </div>
            <div v-if="entry.family.dhcpEnabled" class="row">
              <div class="rt">
                <span class="a">{{ t('networkDhcpRange') }}</span>
                <span class="b">{{ networkPoolRange(entry.family) }}</span>
              </div>
            </div>
          </div>
          <div class="row">
            <div class="rt">
              <span class="a">{{ t('networkMode') }}</span>
              <span class="b">{{ mode }}</span>
            </div>
          </div>
          <div class="row">
            <div class="rt">
              <span class="a">{{ t('networkBridgeName') }}</span>
              <span class="b">{{ detail.network.bridgeName || detail.network.id }}</span>
            </div>
          </div>
        </details>
        <details class="cc" open>
          <summary>
            <span>{{ t('networkConnectedVms') }}</span>
          </summary>
          <p v-if="!vms.length" class="cc-pad muted">{{ t('configNoEntries') }}</p>
          <RouterLink
            v-for="vm in vms"
            :key="vm.vmId"
            class="row link"
            :to="`/vms/${encodeURIComponent(vm.vmId)}`"
            :title="vm.macs.join(' · ')"
          >
            <span class="lead"><AppIcon name="vm" /></span>
            <span class="rt"
              ><span class="a">{{ vm.vmName || vm.vmId }}</span></span
            >
            <span class="trail"><AppIcon name="chevron" /></span>
          </RouterLink>
        </details>
        <details class="cc" open>
          <summary>
            <span>{{ t('networkLeases') }}</span>
          </summary>
          <p v-if="!detail.leases?.length" class="cc-pad muted">
            {{ t('networkNoLeases') }}
          </p>
          <div v-for="(item, index) in detail.leases ?? []" :key="index" class="row">
            <div class="rt">
              <span class="a">{{ leaseName(item.mac, item.hostname) }}</span>
              <span class="b">{{ item.address }} · {{ item.mac }}</span>
            </div>
          </div>
        </details>
        <!-- Live kernel state stays available, folded below the App's three groups. -->
        <details class="cc">
          <summary>
            <span>{{ t('networkTabObserved') }}</span>
          </summary>
          <div class="cc-pad observed">
            <p v-if="detail.liveState !== 'observed'" role="status">
              {{
                t(
                  detail.liveState === 'inactive'
                    ? 'networkLiveInactive'
                    : detail.liveState === 'changed'
                      ? 'networkLiveChanged'
                      : 'networkLiveBusy',
                )
              }}
            </p>
            <section v-if="detail.addresses">
              <h3>{{ t('networkLiveAddresses') }}</h3>
              <p v-if="!detail.addresses.length">{{ t('networkNoObservedRows') }}</p>
              <ul v-else>
                <li v-for="(item, index) in detail.addresses" :key="index">
                  {{ item.address }} · IPv{{ item.family }}
                  <span v-if="item.vlan !== null">· VLAN {{ item.vlan }}</span>
                  <span v-if="item.source">· {{ item.source }}</span>
                </li>
              </ul>
            </section>
            <section v-if="detail.interfaces">
              <h3>{{ t('networkLiveInterfaces') }}</h3>
              <p v-if="!detail.interfaces.length">{{ t('networkNoObservedRows') }}</p>
              <ul v-else>
                <li v-for="(item, index) in detail.interfaces" :key="index">
                  {{ item.name }} · {{ item.state }}
                  <span v-if="item.address">· {{ item.address }}</span>
                </li>
              </ul>
            </section>
            <section v-if="detail.pd">
              <h3>{{ t('networkPdStatus') }}</h3>
              <p v-if="!detail.pd.length">{{ t('networkNoObservedRows') }}</p>
              <ul v-else>
                <li v-for="(item, index) in detail.pd" :key="index">
                  VLAN {{ item.vlan }} · {{ item.state }}
                  <span v-if="item.prefix">· {{ item.prefix }}</span>
                  <span v-if="item.address">· {{ item.address }}</span>
                </li>
              </ul>
            </section>
            <section v-if="detail.neighbors">
              <h3>{{ t('networkNeighbors') }}</h3>
              <p v-if="!detail.neighbors.length">{{ t('networkNoObservedRows') }}</p>
              <ul v-else>
                <li v-for="(item, index) in detail.neighbors" :key="index">
                  {{ item.address }} · {{ item.mac }} · {{ item.interface }} ·
                  {{ item.states.join(', ') }}
                </li>
              </ul>
            </section>
            <section v-if="detail.leases?.length">
              <h3>{{ t('networkLeaseExpires') }}</h3>
              <ul>
                <li v-for="(item, index) in detail.leases" :key="index">
                  {{ item.address
                  }}<template v-if="item.expires">
                    · {{ item.expires }} ({{ item.expiresFormat }})</template
                  >
                </li>
              </ul>
            </section>
          </div>
        </details>
      </div>
    </div>
  </AppDialog>
  <ConfirmDialog
    :open="!!model.confirmation.value"
    :title="
      t(model.confirmation.value?.request.action === 'start' ? 'networkStart' : 'networkStop')
    "
    :description="t('networkActionConfirm', { name: model.confirmation.value?.name })"
    @cancel="model.cancel"
    @confirm="model.submit"
  />
</template>
<style scoped>
.network-details {
  display: grid;
  min-width: 0;
  overflow-wrap: anywhere;
}
.network-details > * + * {
  margin-top: 12px;
}
.network-details > .state-card + * {
  margin-top: 0;
}
.groups {
  overflow: hidden;
}
.muted {
  margin: 0;
}
.observed {
  display: grid;
  gap: 8px;
}
.observed ul {
  margin: 0;
  padding-left: 16px;
}
.observed h3 {
  margin: 8px 0 4px;
  color: var(--md-sys-color-primary);
  font-size: 14px;
  font-weight: 500;
}
</style>
