<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNetworkRuntime } from '../model/runtime'
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
    @close="model.close"
  >
    <div class="network-details">
      <div class="toolbar">
        <slot name="actions" />
        <AppButton
          tone="icon"
          class="refresh"
          :aria-label="t('refreshList')"
          :title="t('refreshList')"
          :disabled="model.loading.value"
          @click="model.refresh"
          ><AppIcon name="refresh"
        /></AppButton>
      </div>
      <AppNotice v-if="model.problem.value" tone="error" :title="t(model.problem.value.titleKey)"
        ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p v-if="model.loading.value" role="status">{{ t('processing') }}</p>
      <section v-if="model.entry.value" aria-live="polite" data-testid="network-operation-status">
        <p v-if="model.entry.value.restored">{{ t('operationTrackingHint') }}</p>
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
      <template v-if="detail">
        <p class="muted">{{ detail.network.id }}</p>
        <dl>
          <div>
            <dt>{{ t('networkRuntimeState') }}</dt>
            <dd>{{ t(stateKeys[detail.runtime.state]) }}</dd>
          </div>
          <div>
            <dt>{{ t('networkBridgeName') }}</dt>
            <dd>{{ detail.network.bridgeName || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('networkBridgeType') }}</dt>
            <dd>{{ detail.network.bridgeType }}</dd>
          </div>
          <div>
            <dt>{{ t('networkUplinkMode') }}</dt>
            <dd>{{ detail.network.uplinkMode }}</dd>
          </div>
        </dl>
        <p class="muted">{{ t('networkObservationHint') }}</p>
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
        <div v-if="model.supportedActions.value" class="toolbar">
          <AppButton :disabled="!model.allowed('start')" @click="model.prepare('start')">{{
            t('networkStart')
          }}</AppButton>
          <AppButton :disabled="!model.allowed('stop')" @click="model.prepare('stop')">{{
            t('networkStop')
          }}</AppButton>
        </div>
        <section>
          <h3>{{ t('networkVmReferences') }}</h3>
          <p class="muted">{{ t('networkVmReferencesHint') }}</p>
          <p v-if="!detail.attachments.length">{{ t('configNoEntries') }}</p>
          <ul v-else>
            <li v-for="item in detail.attachments" :key="`${item.vmId}:${item.slot}`">
              {{ item.vmName || item.vmId }} · {{ t('networkNicSlot', { slot: item.slot + 1 }) }}
              <span v-if="item.mac">· {{ item.mac }}</span>
            </li>
          </ul>
        </section>
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
        <section v-if="detail.leases">
          <h3>{{ t('networkLeases') }}</h3>
          <p v-if="!detail.leases.length">{{ t('networkNoObservedRows') }}</p>
          <ul v-else>
            <li v-for="(item, index) in detail.leases" :key="index">
              {{ item.address }} · {{ item.mac }}
              <span v-if="item.hostname">· {{ item.hostname }}</span
              ><br /><span v-if="item.expires"
                >{{ t('networkLeaseExpires') }}: {{ item.expires }} ({{ item.expiresFormat }})</span
              >
            </li>
          </ul>
        </section>
      </template>
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
  gap: var(--space-3);
  min-width: 0;
  overflow-wrap: anywhere;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.toolbar .refresh {
  margin-inline-start: auto;
}
dl {
  display: grid;
  gap: var(--space-2);
  margin: 0;
}
dl {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
dt {
  margin-bottom: var(--space-1);
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small-size);
}
dd {
  margin: 0;
}
ul {
  padding-left: var(--space-4);
}
li + li {
  margin-top: var(--space-2);
}
h3 {
  font-size: var(--md-sys-typescale-title-medium-size);
}
</style>
