<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResourceCatalog } from '../model/catalog'
import type { MessageKey } from '../../../shared/i18n'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import AppMenu from '../../../shared/ui/AppMenu.vue'
import { formatHostBytes } from '../../host'
import { useDiskActions } from '../model/diskOperations'
import { diskActionKeys } from '../model/diskForm'
import type { DiskAction } from '../api/diskOperations'
import { useAgentOperations, type AgentAction } from '../../agent'

const props = defineProps<{ inline?: boolean }>()
const { t, locale } = useI18n()
const catalog = useResourceCatalog()
const source = catalog.diskDetail
const detail = source.data
const actions = useDiskActions()
const agent = useAgentOperations()
// On narrow screens the detail is a page under the operation dialog, so it closes first.
function leave() {
  if (!props.inline) source.close()
}
function maintain(action: AgentAction) {
  const id = detail.value?.disk.id
  if (!id) return
  leave()
  void agent.prepare(id, action)
}
// The App's info tab: the everyday operations; chain rewrites live on the tree tab.
const commonActions: DiskAction[] = ['resize', 'convert', 'clone']
const chainActions: DiskAction[] = ['create', 'flatten', 'commit', 'reset']
function operate(action: DiskAction) {
  const id = detail.value?.disk.id
  if (!id) return
  leave()
  void actions.prepare(id, action)
}
function snapshot(action: 'snapshot-create' | 'snapshot-apply' | 'snapshot-delete', name = '') {
  const id = detail.value?.disk.id
  if (!id) return
  leave()
  void actions.prepare(id, action, name ? { action, diskId: id, snapshot: name } : null)
}
function optimize() {
  const id = detail.value?.disk.id
  if (!id) return
  leave()
  void actions.prepareOptimize(id)
}
const stateLabel = computed<MessageKey>(() => {
  switch (detail.value?.inspection.state) {
    case 'ready':
      return 'diskInspectionReady'
    case 'busy':
      return 'diskInspectionBusy'
    case 'invalid-chain':
      return 'diskInspectionInvalid'
    default:
      return 'diskInspectionUnavailable'
  }
})
const boolText = (value: boolean | null) =>
  t(value === null ? 'diskUnknown' : value ? 'diskYes' : 'diskNo')
const size = (value: string | null | undefined) =>
  value == null ? t('diskUnknown') : formatHostBytes(value, locale.value)
const users = computed(() => {
  const value = detail.value
  if (!value) return ''
  const names = [...new Set(value.attachments.map((slot) => slot.vmName || slot.vmId))]
  if (names.length) return names.join(' · ')
  if (value.children.length)
    return t('diskBaseOf', { name: value.children.map((disk) => disk.name || disk.id).join(' · ') })
  return t('diskUnused')
})
const base = computed(() => {
  const chain = detail.value?.chain
  return chain && chain.length > 1 ? chain[1]!.name || chain[1]!.id : null
})
// Disk tree: the backing chain from its root down to this disk, then its overlays.
// List rows carry format and sizes, so the tree reuses them when present.
const tree = computed(() => {
  const value = detail.value
  if (!value) return []
  const listed = new Map(catalog.disks.items.value.map((disk) => [disk.id, disk]))
  const row = (disk: (typeof value.chain)[number], depth: number) => ({
    disk,
    listed: listed.get(disk.id),
    depth,
  })
  const chain = [...value.chain].reverse()
  return [
    ...chain.map((disk, index) => row(disk, index)),
    ...value.children.map((disk) => row(disk, chain.length)),
  ]
})
function treeLine(entry: (typeof tree.value)[number]) {
  const disk = entry.listed
  if (!disk) return entry.disk.path
  return [disk.format, `${size(disk.allocatedBytes)} / ${size(disk.virtualBytes)}`]
    .filter(Boolean)
    .join(' · ')
}
const snapshots = computed(() =>
  [...(detail.value?.inspection.snapshots ?? [])].sort((a, b) => b.createdAtMs - a.createdAtMs),
)
const snapshotsSupported = computed(
  () => actions.supported.value && detail.value?.inspection.format === 'qcow2',
)
function snapshotLine(item: (typeof snapshots.value)[number]) {
  const time = item.createdAtMs
    ? new Date(item.createdAtMs).toLocaleString(locale.value, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : ''
  const state =
    item.vmStateBytes !== '0' ? t('diskSnapshotSize', { size: size(item.vmStateBytes) }) : ''
  return [time, state].filter(Boolean).join(' · ')
}
const tab = ref<'info' | 'snapshots' | 'tree'>('info')
const tabs = [
  { value: 'info', label: 'diskTabInfo' },
  { value: 'snapshots', label: 'diskTabSnapshots' },
  { value: 'tree', label: 'diskTabTree' },
] as const
watch(
  () => source.id.value,
  () => (tab.value = 'info'),
)
onBeforeUnmount(() => source.close())
</script>

<template>
  <AppDialog
    :open="!!source.id.value"
    :inline="inline"
    :title="detail?.disk.name || detail?.disk.id || t('diskDetails')"
    page
    @close="source.close"
  >
    <div class="disk-detail">
      <p v-if="source.status.value === 'loading' && !detail" role="status">
        {{ t('processing') }}
      </p>
      <AppNotice v-if="source.problem.value" tone="error" :title="t(source.problem.value.titleKey)"
        ><p>{{ t(source.problem.value.descriptionKey) }}</p></AppNotice
      >
      <AppNotice
        v-if="detail && detail.inspection.state !== 'ready'"
        tone="warning"
        :title="t(stateLabel)"
      />
      <div v-if="detail" class="card out detail-card">
        <div class="tabs" role="tablist" :aria-label="t('diskDetails')">
          <button
            v-for="item in tabs"
            :key="item.value"
            type="button"
            role="tab"
            :aria-selected="tab === item.value"
            @click="tab = item.value"
          >
            {{ t(item.label) }}
          </button>
        </div>
        <template v-if="tab === 'info'">
          <dl class="kv info">
            <dt>{{ t('diskPath') }}</dt>
            <dd class="mono">{{ detail.disk.path }}</dd>
            <dt>{{ t('diskFormat') }}</dt>
            <dd>{{ detail.inspection.format ?? t('diskUnknown') }}</dd>
            <dt>{{ t('diskVirtualSize') }}</dt>
            <dd>{{ size(detail.inspection.virtualBytes) }}</dd>
            <dt>{{ t('diskAllocatedBytes') }}</dt>
            <dd>{{ size(detail.inspection.allocatedBytes) }}</dd>
            <dt>{{ t('diskUsedBy') }}</dt>
            <dd>{{ users }}</dd>
            <template v-if="base">
              <dt>{{ t('diskTagBase') }}</dt>
              <dd>{{ base }}</dd>
            </template>
            <dt>{{ t('diskClusterBytes') }}</dt>
            <dd>{{ size(detail.inspection.clusterBytes) }}</dd>
            <dt>{{ t('diskCompression') }}</dt>
            <dd>{{ detail.inspection.compression ?? t('diskUnknown') }}</dd>
            <dt>{{ t('diskEncrypted') }}</dt>
            <dd>{{ boolText(detail.inspection.encrypted) }}</dd>
            <dt>{{ t('diskDirty') }}</dt>
            <dd>{{ boolText(detail.inspection.dirty) }}</dd>
            <dt>{{ t('diskReadOnlyRequired') }}</dt>
            <dd>{{ boolText(detail.readOnlyRequired) }}</dd>
          </dl>
          <div v-if="actions.supported.value" class="btn-grid pad">
            <button
              v-for="action in commonActions"
              :key="action"
              type="button"
              class="btn tonal"
              :disabled="!actions.allowed.value"
              @click="operate(action)"
            >
              {{ t(diskActionKeys[action]) }}
            </button>
            <button
              type="button"
              class="btn danger"
              :disabled="!actions.allowed.value"
              @click="operate('delete')"
            >
              {{ t(diskActionKeys.delete) }}
            </button>
          </div>
          <div v-if="actions.supported.value || agent.supported.value" class="btn-grid pad">
            <button
              v-if="actions.supported.value"
              type="button"
              class="btn outlined"
              :disabled="!actions.allowed.value"
              data-testid="disk-optimize-open"
              @click="optimize"
            >
              {{ t('diskOptimizeTitle') }}
            </button>
            <template v-if="agent.supported.value">
              <button
                type="button"
                class="btn outlined"
                :disabled="!agent.allowed.value"
                data-testid="agent-password-open"
                @click="maintain('chpasswd')"
              >
                {{ t('agentPasswordTitle') }}
              </button>
              <button
                type="button"
                class="btn outlined"
                :disabled="!agent.allowed.value"
                data-testid="agent-grow-open"
                @click="maintain('autogrow')"
              >
                {{ t('agentGrowTitle') }}
              </button>
            </template>
          </div>
        </template>
        <div v-else-if="tab === 'snapshots'" class="list pad16">
          <p v-if="!detail.inspection.snapshots" class="muted">
            {{ t('diskSnapshotsUnknown') }}
          </p>
          <p v-else-if="!snapshots.length" class="muted">{{ t('diskSnapshotsEmpty') }}</p>
          <div v-for="item in snapshots" :key="item.id" class="card out item">
            <span class="ic"><AppIcon name="layers" /></span>
            <div class="body">
              <div class="name">{{ item.name || item.id }}</div>
              <div class="sub">{{ snapshotLine(item) }}</div>
            </div>
            <AppMenu v-if="snapshotsSupported" :label="t('moreActions')">
              <button
                type="button"
                role="menuitem"
                :disabled="!actions.allowed.value"
                @click="snapshot('snapshot-apply', item.name || item.id)"
              >
                {{ t('diskSnapshotApply') }}
              </button>
              <button
                type="button"
                role="menuitem"
                class="danger"
                :disabled="!actions.allowed.value"
                @click="snapshot('snapshot-delete', item.name || item.id)"
              >
                {{ t('diskSnapshotDelete') }}
              </button>
            </AppMenu>
          </div>
          <button
            v-if="snapshotsSupported"
            type="button"
            class="btn outlined icon-lead start"
            :disabled="!actions.allowed.value"
            @click="snapshot('snapshot-create')"
          >
            <AppIcon name="plus" />{{ t('diskSnapshotCreate') }}
          </button>
        </div>
        <div v-else class="list pad16">
          <p v-if="!detail.chainComplete" class="muted">{{ t('diskChainIncomplete') }}</p>
          <div
            v-for="entry in tree"
            :key="entry.disk.id"
            class="card out item"
            :class="{
              sel: entry.disk.id === detail.disk.id,
              'tree-child': entry.depth > 0,
              click: entry.disk.id !== detail.disk.id,
            }"
            :style="entry.depth ? { '--depth': Math.min(entry.depth, 3) } : undefined"
            @click="entry.disk.id !== detail.disk.id && source.open(entry.disk.id)"
          >
            <span class="ic"><AppIcon :name="entry.disk.parentId ? 'layers' : 'disk'" /></span>
            <div class="body">
              <div class="name">
                {{ entry.disk.name || entry.disk.id
                }}<span v-if="entry.disk.backing" class="tag">{{ t('diskTagBase') }}</span
                ><span v-if="entry.disk.parentId" class="tag t">{{ t('diskTagOverlay') }}</span>
              </div>
              <div class="sub" :title="entry.disk.path">{{ treeLine(entry) }}</div>
            </div>
          </div>
          <div v-if="actions.supported.value" class="btn-grid">
            <button
              v-for="action in chainActions"
              :key="action"
              type="button"
              class="btn tonal"
              :disabled="!actions.allowed.value"
              @click="operate(action)"
            >
              {{ t(action === 'create' ? 'diskCreateOverlay' : diskActionKeys[action]) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.disk-detail {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.detail-card {
  overflow: hidden;
}
.info {
  padding-top: 16px;
}
.mono {
  font-family: var(--app-font-mono, monospace);
  font-size: 13px;
}
.pad {
  padding: 0 16px 16px;
}
.pad16 {
  padding: 16px;
}
.start {
  align-self: flex-start;
}
.muted {
  margin: 0;
}
.item {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 72px;
  padding: 8px 8px 8px 16px;
}
.item.click {
  cursor: pointer;
}
.item.sel {
  border-color: transparent;
  background: var(--md-sys-color-secondary-container);
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
  font-size: 16px;
  line-height: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub {
  font-size: 13px;
  line-height: 18px;
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item.tree-child {
  position: relative;
  overflow: visible;
  margin-inline-start: calc(var(--depth) * 28px);
}
.item.tree-child::before {
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
</style>
