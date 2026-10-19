<script setup lang="ts">
import AppLinkButton from '../../../shared/ui/AppLinkButton.vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ResourceKind } from '../api/gateway'
import { useResourceCatalog } from '../model/catalog'
import { useVisiblePolling } from '../../../shared/model/visiblePolling'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
import EmptyState from '../../../shared/ui/EmptyState.vue'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import SearchField from '../../../shared/ui/SearchField.vue'
import { useMediaQuery } from '../../../shared/lib/mediaQuery'
import { selectsCard } from '../../../shared/lib/cardClick'
import DiskDetails from './DiskDetails.vue'
import DiskOperationDialog from './DiskOperationDialog.vue'
import DiskOperationStatus from './DiskOperationStatus.vue'
import DiskRecovery from './DiskRecovery.vue'
import { useDiskActions } from '../model/diskOperations'
import { useAgentOperations, AgentOperationStatus, AgentRecovery } from '../../agent'
import { useImageImport } from '../../images'
import {
  useNetworkEditor,
  useNetworkRuntime,
  NetworkDetails,
  useNetworkDeletion,
  NetworkDeletion,
} from '../../networks'
import { useRoute, useRouter } from 'vue-router'
const props = defineProps<{ kind: Extract<ResourceKind, 'disk' | 'network'> }>()
const { t } = useI18n(),
  catalog = useResourceCatalog(),
  query = ref('')
const source = computed(() => (props.kind === 'disk' ? catalog.disks : catalog.networks))
const actions = useDiskActions()
const agent = useAgentOperations()
const networks = useNetworkEditor(),
  router = useRouter()
const networkRuntime = useNetworkRuntime()
const deletion = useNetworkDeletion()
const imageImport = useImageImport(),
  route = useRoute()
watch(
  () => [props.kind, route.query.disk, catalog.diskDetail.supported.value] as const,
  ([kind, disk, supported]) => {
    if (kind === 'disk' && typeof disk === 'string' && disk && supported)
      void catalog.diskDetail.open(disk)
  },
  { immediate: true },
)
function editNetwork(id: string) {
  void router.push(
    id === 'new' ? '/resources/network/new' : `/resources/network/${encodeURIComponent(id)}/edit`,
  )
}
async function refresh() {
  if (props.kind === 'disk') {
    await actions.reconcile()
    await actions.recovery.reconcile()
    await agent.reconcile()
    await agent.reconcileRecovery()
  }
  if (props.kind === 'network') {
    await networkRuntime.reconcile()
    await deletion.reconcile()
  }
  return source.value.refresh()
}
const visible = computed(() =>
  source.value.items.value.filter((item) =>
    `${item.name} ${item.id} ${'path' in item ? item.path : ''}`
      .toLocaleLowerCase()
      .includes(query.value.trim().toLocaleLowerCase()),
  ),
)
useVisiblePolling(() => source.value.supported.value, refresh, ['disks', 'networks'])
// List-detail: wide screens show the opened item beside the list.
const expanded = useMediaQuery('(width >= 840px)')
const detailSupported = computed(() =>
  props.kind === 'disk' ? catalog.diskDetail.supported.value : networkRuntime.supported.value,
)
const maintenanceAvailable = computed(() =>
  props.kind === 'disk'
    ? actions.recovery.supported.value ||
      agent.recovery.supported.value ||
      agent.rescueSupported.value
    : deletion.recoverySupported.value,
)
// Open the maintenance section by itself only when there is something to recover.
const attention = computed(() => {
  if (props.kind !== 'disk') return false
  const disk = actions.recovery
  const recovering = disk.entries.value.recovery
  return (
    (disk.pending.value ?? 0) > 0 ||
    !!disk.problem.value ||
    !!disk.recoveryProblem.value ||
    (!!recovering && recovering.state !== 'done') ||
    (agent.pendingRecords.value ?? 0) > 0 ||
    !!agent.recoveryProblem.value ||
    !!agent.recovery.recoveryProblem.value ||
    Object.values(agent.recovery.entries.value).some((entry) => entry?.state !== 'done')
  )
})
function selectCard(event: MouseEvent, id: string) {
  if (detailSupported.value && selectsCard(event)) openDetail(id)
}
function openDetail(id: string) {
  if (props.kind === 'disk') void catalog.diskDetail.open(id)
  else void networkRuntime.open(id)
}
const openId = computed(() =>
  props.kind === 'disk' ? catalog.diskDetail.id.value : networkRuntime.id.value,
)
</script>
<template>
  <section
    class="resource-list"
    :class="{ split: expanded && source.supported.value }"
    :aria-label="t(kind === 'disk' ? 'navDisk' : 'navNetwork')"
  >
    <div class="resource-main">
      <template v-if="kind === 'network'">
        <OperationTrackingNotice
          :problem="networkRuntime.recoveryProblem.value"
          @clear="networkRuntime.clearTracking"
        />
        <div v-if="networkRuntime.pending.value.length" data-testid="network-operation-recovery">
          <p>{{ t('operationTrackingHint') }}</p>
          <AppButton :disabled="networkRuntime.checking.value" @click="networkRuntime.reconcile">{{
            t('queryStatus')
          }}</AppButton>
        </div>
      </template>
      <EmptyState
        v-if="!source.supported.value"
        :title="
          t('resourceUnavailable', { resource: t(kind === 'disk' ? 'navDisk' : 'navNetwork') })
        "
        :description="t('resourcesUnavailableHint')"
      />
      <template v-else>
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
        <div class="list-actions">
          <template v-if="kind === 'network'">
            <AppButton
              v-if="
                deletion.entry.value ||
                deletion.recoveryEntry.value ||
                deletion.recoveryProblem.value
              "
              @click="deletion.resume"
              >{{ t('networkDeletionResume') }}</AppButton
            >
            <AppButton
              v-for="pending in networkRuntime.pending.value"
              :key="pending.request.requestId"
              @click="networkRuntime.open(pending.request.networkId)"
              >{{ t('networkResumeAction') }} · {{ pending.request.networkId }}</AppButton
            >
            <template v-if="networks.supported.value">
              <AppButton
                v-if="networks.protectedDraft.value"
                @click="editNetwork(networks.target.value!)"
                >{{ t('networkResume') }}</AppButton
              >
              <AppButton
                tone="tonal"
                :disabled="networks.protectedDraft.value"
                @click="editNetwork('new')"
                ><AppIcon name="plus" />{{ t('networkCreate') }}</AppButton
              >
            </template>
          </template>
          <template v-else>
            <AppButton
              v-if="actions.supported.value"
              tone="tonal"
              :disabled="!actions.allowed.value"
              @click="actions.prepare(null, 'create')"
              ><AppIcon name="plus" />{{ t('diskCreate') }}</AppButton
            >
            <AppLinkButton
              v-if="imageImport.supported.value"
              tone="quiet"
              to="/resources/disk/import"
              >{{ t('imageImportTitle') }}</AppLinkButton
            >
          </template>
        </div>
        <template v-if="kind === 'disk'">
          <DiskOperationStatus />
          <AgentOperationStatus />
        </template>
        <AppNotice
          v-if="source.problem.value"
          tone="error"
          :title="t(source.problem.value.titleKey)"
          ><p>{{ t(source.problem.value.descriptionKey) }}</p></AppNotice
        >
        <p v-if="source.status.value === 'loading'" role="status">{{ t('processing') }}</p>
        <p v-else-if="source.status.value === 'ready' && !visible.length" class="muted">
          {{ t('configNoEntries') }}
        </p>
        <div class="resource-cards">
          <article
            v-for="item in visible"
            :key="item.id"
            class="resource-card card"
            :class="{ selected: expanded && item.id === openId, openable: detailSupported }"
            @click="selectCard($event, item.id)"
          >
            <span class="leading"><AppIcon :name="kind" /></span>
            <div class="text">
              <h2>
                <button
                  v-if="detailSupported"
                  type="button"
                  class="card-title"
                  :aria-label="`${item.name || item.id} · ${t(kind === 'disk' ? 'diskDetails' : 'networkDetails')}`"
                  @click="openDetail(item.id)"
                >
                  {{ item.name || item.id }}
                </button>
                <template v-else>{{ item.name || item.id }}</template>
              </h2>
              <p v-if="'path' in item" class="supporting" :title="item.path">{{ item.path }}</p>
              <p v-else class="supporting">{{ item.bridgeType }} · {{ item.uplinkMode }}</p>
              <p v-if="'path' in item && (item.parentId || !item.selectable)" class="tags">
                <span v-if="item.parentId">{{ t('resourceBacking') }}</span>
                <span v-if="!item.selectable">{{ t('resourceNotSelectable') }}</span>
              </p>
            </div>
            <!-- Without a detail pane the item actions have nowhere else to live. -->
            <div v-if="!detailSupported" class="card-actions">
              <template v-if="'path' in item && agent.supported.value">
                <AppButton
                  :disabled="!agent.allowed.value"
                  data-testid="agent-password-open"
                  @click="agent.prepare(item.id, 'chpasswd')"
                  >{{ t('agentPasswordTitle') }}</AppButton
                >
                <AppButton
                  :disabled="!agent.allowed.value"
                  data-testid="agent-grow-open"
                  @click="agent.prepare(item.id, 'autogrow')"
                  >{{ t('agentGrowTitle') }}</AppButton
                >
              </template>
              <template v-else-if="!('path' in item)">
                <AppButton
                  v-if="networks.supported.value"
                  :disabled="networks.protectedDraft.value && networks.target.value !== item.id"
                  @click="editNetwork(item.id)"
                  >{{ t('networkEdit') }}</AppButton
                >
                <AppButton
                  v-if="deletion.supported.value"
                  data-testid="network-delete-open"
                  :disabled="deletion.busy.value || networks.protectedDraft.value"
                  @click="deletion.open(item.id)"
                  >{{ t('networkDelete') }}</AppButton
                >
              </template>
            </div>
          </article>
        </div>
        <!-- Recovery tools stay out of the way until something needs attention. -->
        <details v-if="maintenanceAvailable" class="maintenance" :open="attention">
          <summary>{{ t('resourceMaintenance') }}</summary>
          <div class="maintenance-body">
            <template v-if="kind === 'disk'">
              <DiskRecovery />
              <AgentRecovery />
              <AppLinkButton v-if="agent.rescueSupported.value" tone="tonal" to="/agent/rescue">{{
                t('agentRescueTitle')
              }}</AppLinkButton>
            </template>
            <AppButton
              v-else-if="deletion.recoverySupported.value"
              data-testid="configuration-recovery-global-open"
              @click="deletion.openRecovery"
              >{{ t('configurationRecoveryTitle') }}</AppButton
            >
          </div>
        </details>
      </template>
    </div>
    <div v-if="expanded && source.supported.value && !openId" class="pane-placeholder">
      <AppIcon :name="kind" />
      <p>{{ t('selectResourceDetailsHint') }}</p>
    </div>
    <DiskDetails v-if="kind === 'disk' && catalog.diskDetail.id.value" :inline="expanded" />
    <NetworkDetails v-if="kind === 'network' && networkRuntime.id.value" :inline="expanded">
      <template #actions>
        <AppButton
          v-if="networks.supported.value"
          tone="tonal"
          :disabled="
            networks.protectedDraft.value && networks.target.value !== networkRuntime.id.value
          "
          @click="editNetwork(networkRuntime.id.value!)"
          >{{ t('networkEdit') }}</AppButton
        >
        <AppButton
          v-if="deletion.supported.value"
          class="danger"
          data-testid="network-delete-open"
          :disabled="deletion.busy.value || networks.protectedDraft.value"
          @click="deletion.open(networkRuntime.id.value!)"
          >{{ t('networkDelete') }}</AppButton
        >
      </template>
    </NetworkDetails>
    <NetworkDeletion v-if="kind === 'network'" />
    <DiskOperationDialog v-if="kind === 'disk' && actions.open.value" />
  </section>
</template>
<style scoped>
.resource-list {
  display: grid;
  gap: var(--space-6);
  align-items: start;
  min-width: 0;
}
.resource-list.split {
  grid-template-columns: 400px minmax(0, 1fr);
}
.resource-main {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.list-tools,
.list-actions,
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
.list-tools .search-field {
  flex: 1;
}
.list-actions:empty {
  display: none;
}
.resource-cards {
  display: grid;
  gap: var(--space-2);
}
/* M3 two-line list item drawn as an outlined card. */
.resource-card {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: var(--space-1) var(--space-4);
  align-items: center;
  padding: var(--space-3) var(--space-4);
}
.resource-card.openable {
  cursor: pointer;
}
.resource-card.openable:hover {
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 4%, var(--app-color-card));
}
.resource-card.selected {
  border-color: var(--md-sys-color-primary);
  background: color-mix(
    in srgb,
    var(--md-sys-color-secondary-container) 60%,
    var(--app-color-card)
  );
}
.leading {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}
.leading .icon {
  width: 20px;
  height: 20px;
}
.text {
  min-width: 0;
}
h2 {
  margin: 0;
  font-size: var(--md-sys-typescale-title-medium-size);
  font-weight: 500;
  overflow-wrap: anywhere;
}
.card-title {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.card-title:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
}
.supporting {
  margin: 2px 0 0;
  overflow: hidden;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: var(--space-2) 0 0;
}
.tags span {
  padding: 2px var(--space-2);
  border-radius: var(--md-sys-shape-corner-small);
  background: var(--app-color-raised);
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-small-size);
}
.card-actions {
  grid-column: 2;
}
.maintenance {
  margin-top: var(--space-4);
  border-top: 1px solid var(--md-sys-color-outline-variant);
}
.maintenance > summary {
  color: var(--md-sys-color-on-surface-variant);
}
.maintenance-body {
  display: grid;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
}
@media (width < 1200px) {
  .resource-list.split {
    grid-template-columns: 360px minmax(0, 1fr);
  }
}
</style>
