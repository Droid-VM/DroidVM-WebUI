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
import AppMenu from '../../../shared/ui/AppMenu.vue'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import { pageSearch } from '../../../shared/model/pageSearch'
import { formatHostBytes } from '../../host'
import { useMediaQuery } from '../../../shared/lib/mediaQuery'
import { selectsCard } from '../../../shared/lib/cardClick'
import DiskDetails from './DiskDetails.vue'
import DiskOperationDialog from './DiskOperationDialog.vue'
import DiskOperationStatus from './DiskOperationStatus.vue'
import DiskRecovery from './DiskRecovery.vue'
import { useDiskActions } from '../model/diskOperations'
import { diskActionKeys } from '../model/diskForm'
import { useAgentOperations, AgentOperationStatus, AgentRecovery } from '../../agent'
import { useImageImport } from '../../images'
import {
  useNetworkEditor,
  useNetworkRuntime,
  NetworkDetails,
  useNetworkDeletion,
  NetworkDeletion,
  networkModeLine,
} from '../../networks'
import { useRoute, useRouter } from 'vue-router'
const props = defineProps<{ kind: Extract<ResourceKind, 'disk' | 'network'> }>()
const { t, locale } = useI18n(),
  catalog = useResourceCatalog(),
  query = pageSearch
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
    if (catalog.diskDetail.id.value) void catalog.diskDetail.refresh()
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
type Item = (typeof visible.value)[number]
// Overlays sit under their backing disk, as in the App's disk tree. Parents hidden by
// the search make their children roots; a broken chain never drops an item.
const rows = computed(() => {
  const items = visible.value
  const parentOf = (item: Item) => ('parentId' in item ? item.parentId : null)
  const ids = new Set(items.map((item) => item.id))
  const children = new Map<string, Item[]>()
  for (const item of items) {
    const parent = parentOf(item)
    if (parent && ids.has(parent)) children.set(parent, [...(children.get(parent) ?? []), item])
  }
  const result: { item: Item; depth: number }[] = []
  const seen = new Set<string>()
  const walk = (item: Item, depth: number) => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    result.push({ item, depth })
    for (const child of children.get(item.id) ?? []) walk(child, depth + 1)
  }
  for (const item of items) {
    const parent = parentOf(item)
    if (!parent || !ids.has(parent)) walk(item, 0)
  }
  for (const item of items) walk(item, 0)
  return result
})
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
// The FAB opens creation with ?create=1: a disk chooser (new / import) or a new network.
const choosing = ref(false)
watch(
  () => route.query.create,
  (create) => {
    if (create !== '1') return
    void router.replace({ path: route.path })
    if (props.kind === 'network') editNetwork('new')
    else choosing.value = true
  },
  { immediate: true },
)
function createDisk() {
  choosing.value = false
  void actions.prepare(null, 'create')
}
function importImage() {
  choosing.value = false
  void router.push('/resources/disk/import')
}
// The App's disk item: format · actual / virtual, then who uses it.
const bytes = (value: string | null | undefined) =>
  value == null ? '—' : formatHostBytes(value, locale.value)
function diskLine(item: Item) {
  if (!('path' in item)) return ''
  return [item.format, `${bytes(item.allocatedBytes)} / ${bytes(item.virtualBytes)}`]
    .filter(Boolean)
    .join(' · ')
}
function diskUsers(item: Item) {
  if (!('path' in item)) return ''
  if (item.users?.length) return item.users.map((user) => user.vmName || user.vmId).join(' · ')
  const children = source.value.items.value.filter(
    (other) => 'parentId' in other && other.parentId === item.id,
  )
  if (children.length)
    return t('diskBaseOf', { name: children.map((child) => child.name).join(' · ') })
  return item.users ? t('diskUnused') : ''
}
function networkLine(item: Item) {
  return 'path' in item ? '' : networkModeLine(item, t)
}
// Second line: the first IPv4 address (or a dash) and how many VMs use the network.
function networkAddress(item: Item) {
  if ('path' in item) return ''
  const cidr = item.vlans?.find((vlan) => vlan.ipv4.cidr)?.ipv4.cidr
  return [
    cidr ?? '—',
    item.vlans && item.vlans.length > 1 ? `VLAN × ${item.vlans.length}` : '',
    item.vmCount === undefined ? '' : t('networkVmCount', { count: item.vmCount }),
  ]
    .filter(Boolean)
    .join(' · ')
}
const networkStateKeys: Record<string, string> = {
  RUNNING: 'stateRunning',
  STOPPED: 'stateStopped',
  STARTING: 'stateStarting',
  STOPPING: 'stateStopping',
  RECOVERING: 'networkStateRecovering',
  FAILED: 'networkStateFailed',
}
// Starting or stopping from the list opens the detail with its confirmation.
async function toggleNetwork(id: string, running: boolean) {
  await networkRuntime.open(id)
  networkRuntime.prepare(running ? 'stop' : 'start')
}
const openId = computed(() =>
  props.kind === 'disk' ? catalog.diskDetail.id.value : networkRuntime.id.value,
)
// Like the App's list-detail, wide screens always show an item: the first one by default.
watch(
  () => [expanded.value && detailSupported.value, openId.value, rows.value[0]?.item.id] as const,
  ([split, open, first]) => {
    if (split && !open && first) openDetail(first)
  },
  { immediate: true },
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
        <div v-if="kind === 'network'" class="list-actions">
          <AppButton
            v-if="
              deletion.entry.value || deletion.recoveryEntry.value || deletion.recoveryProblem.value
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
          <AppButton
            v-if="networks.supported.value && networks.protectedDraft.value"
            @click="editNetwork(networks.target.value!)"
            >{{ t('networkResume') }}</AppButton
          >
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
        <div class="list resource-cards">
          <article
            v-for="{ item, depth } in rows"
            :key="item.id"
            class="resource-card card out item"
            :class="{
              selected: expanded && item.id === openId,
              openable: detailSupported,
              child: depth > 0,
            }"
            :style="depth ? { '--depth': Math.min(depth, 3) } : undefined"
            @click="selectCard($event, item.id)"
          >
            <span class="ic"
              ><AppIcon
                :name="
                  kind === 'network'
                    ? 'network'
                    : 'parentId' in item && item.parentId
                      ? 'layers'
                      : 'disk'
                "
            /></span>
            <div class="body">
              <h2 class="name">
                <button
                  v-if="detailSupported"
                  type="button"
                  class="card-title"
                  :aria-label="`${item.name || item.id} · ${t(kind === 'disk' ? 'diskDetails' : 'networkDetails')}`"
                  @click="openDetail(item.id)"
                >
                  {{ item.name || item.id }}
                </button>
                <template v-else>{{ item.name || item.id }}</template
                ><template v-if="'path' in item"
                  ><span v-if="item.backing" class="tag">{{ t('diskTagBase') }}</span
                  ><span v-if="item.parentId" class="tag t">{{ t('diskTagOverlay') }}</span
                  ><span v-if="!item.selectable" class="tag">{{
                    t('resourceNotSelectable')
                  }}</span></template
                >
              </h2>
              <template v-if="'path' in item">
                <p class="sub" :title="item.path">{{ diskLine(item) || item.path }}</p>
                <p v-if="diskUsers(item)" class="sub">{{ diskUsers(item) }}</p>
              </template>
              <template v-else>
                <p class="sub">{{ networkLine(item) }}</p>
                <p v-if="networkAddress(item)" class="sub">{{ networkAddress(item) }}</p>
              </template>
            </div>
            <template v-if="!('path' in item) && item.state">
              <span class="state" :data-state="item.state"
                ><span class="dot" />{{ t(networkStateKeys[item.state] ?? 'stateStopped') }}</span
              >
              <AppButton
                v-if="networkRuntime.supportedActions.value"
                tone="icon"
                :aria-label="t(item.state === 'RUNNING' ? 'stop' : 'start')"
                :title="t(item.state === 'RUNNING' ? 'stop' : 'start')"
                @click="toggleNetwork(item.id, item.state === 'RUNNING')"
                ><AppIcon :name="item.state === 'RUNNING' ? 'stop' : 'play'"
              /></AppButton>
            </template>
            <AppMenu
              v-if="'path' in item && actions.supported.value"
              :label="t('moreActions')"
              @click.stop
            >
              <button
                v-for="action in ['resize', 'convert', 'clone'] as const"
                :key="action"
                type="button"
                role="menuitem"
                :disabled="!actions.allowed.value"
                @click="actions.prepare(item.id, action)"
              >
                {{ t(diskActionKeys[action]) }}
              </button>
              <button
                type="button"
                role="menuitem"
                class="danger"
                :disabled="!actions.allowed.value"
                @click="actions.prepare(item.id, 'delete')"
              >
                {{ t('diskDelete') }}
              </button>
            </AppMenu>
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
        <button
          v-if="networks.supported.value"
          type="button"
          class="btn outlined icon-lead"
          :disabled="
            networks.protectedDraft.value && networks.target.value !== networkRuntime.id.value
          "
          @click="editNetwork(networkRuntime.id.value!)"
        >
          <AppIcon name="edit" />{{ t('networkEdit') }}
        </button>
        <button
          v-if="deletion.supported.value"
          type="button"
          class="btn danger icon-lead"
          data-testid="network-delete-open"
          :disabled="deletion.busy.value || networks.protectedDraft.value"
          @click="deletion.open(networkRuntime.id.value!)"
        >
          <AppIcon name="delete" />{{ t('networkDelete') }}
        </button>
      </template>
    </NetworkDetails>
    <NetworkDeletion v-if="kind === 'network'" />
    <DiskOperationDialog v-if="kind === 'disk' && actions.open.value" />
    <AppDialog :open="choosing" :title="t('diskCreate')" @close="choosing = false">
      <div class="creation-options">
        <AppButton
          v-if="actions.supported.value"
          tone="tonal"
          :disabled="!actions.allowed.value"
          @click="createDisk"
          ><AppIcon name="plus" />{{ t('diskCreate') }}</AppButton
        >
        <AppButton v-if="imageImport.supported.value" tone="tonal" @click="importImage"
          ><AppIcon name="import" />{{ t('imageImportTitle') }}</AppButton
        >
      </div>
    </AppDialog>
  </section>
</template>
<style scoped>
.resource-list {
  display: grid;
  align-items: start;
  min-width: 0;
}
.resource-main {
  display: grid;
  gap: 12px;
  min-width: 0;
  align-content: start;
}
.list-actions,
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.list-actions:empty {
  display: none;
}
/* Long supporting lines truncate instead of widening the grid track. */
.resource-cards {
  min-width: 0;
}
/* The App's list item: 40px tinted icon, name with tags, two supporting lines. */
.resource-card {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 72px;
  padding: 8px 8px 8px 16px;
}
.resource-card > .btn {
  align-self: center;
}
.resource-card.openable {
  cursor: pointer;
}
.resource-card.selected {
  border-color: transparent;
  background: var(--md-sys-color-secondary-container);
}
.resource-card.selected .sub {
  color: var(--md-sys-color-on-secondary-container);
}
/* Disk tree: each level is indented with an elbow back to its parent row. */
.resource-card.child {
  position: relative;
  overflow: visible;
  margin-inline-start: calc(var(--depth) * 28px);
}
.resource-card.child::before {
  content: '';
  position: absolute;
  inset-inline-start: -17px;
  top: -9px;
  bottom: 50%;
  width: 12px;
  border-inline-start: 2px solid var(--md-sys-color-outline-variant);
  border-bottom: 2px solid var(--md-sys-color-outline-variant);
  border-end-start-radius: 8px;
}
.ic {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  color: var(--md-sys-color-primary);
}
.ic .icon {
  width: 32px;
  height: 32px;
}
.body {
  flex: 1;
  min-width: 0;
}
.name {
  margin: 0;
  font-size: 16px;
  font-weight: 400;
  line-height: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
.sub {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.state {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--md-sys-color-on-surface-variant);
}
.state .dot {
  margin-right: 6px;
  background: currentColor;
}
.state[data-state='RUNNING'] {
  color: var(--app-color-success);
}
.state[data-state='STARTING'],
.state[data-state='STOPPING'],
.state[data-state='RECOVERING'] {
  color: var(--md-sys-color-primary);
}
.state[data-state='FAILED'] {
  color: var(--md-sys-color-error);
}
.card-actions {
  flex-basis: 100%;
}
.maintenance {
  margin-top: 16px;
  border-top: 1px solid var(--md-sys-color-outline-variant);
}
.maintenance > summary {
  color: var(--md-sys-color-on-surface-variant);
}
.maintenance-body {
  display: grid;
  gap: 12px;
  padding-bottom: 8px;
}
/* 600-1199: two items per row, like the design's tablet list. */
@media (600px <= width < 1200px) {
  .resource-list:not(.split) .resource-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
}
/* >= 1200: list-detail, the list scrolling on its own like the VM page. */
.resource-list.split {
  grid-template-columns: 400px minmax(0, 1fr);
  margin: -8px -32px -40px;
  min-height: calc(100dvh - 64px);
}
.split > .resource-main {
  position: sticky;
  top: 64px;
  max-height: calc(100dvh - 64px);
  overflow: auto;
  padding: 8px 16px 32px 24px;
  border-right: 1px solid var(--md-sys-color-outline-variant);
}
.split > :deep(.dialog-pane),
.split > .pane-placeholder {
  position: static;
  max-height: none;
  overflow: visible;
  padding: 8px 32px 40px;
  border-radius: 0;
  background: none;
}
.split > :deep(.dialog-pane > .dialog-header) {
  height: 56px;
  padding: 12px 0 16px;
  background: none;
}
/* The pane always shows an item, so it has nothing to close. */
.split > :deep(.dialog-pane > .dialog-header > .icon-button) {
  display: none;
}
.split > :deep(.dialog-pane > .dialog-header h2) {
  flex: 1;
  font-size: 22px;
  line-height: 28px;
}
.split > :deep(.dialog-pane > .dialog-body) {
  max-width: 880px;
  padding: 0;
}
</style>
