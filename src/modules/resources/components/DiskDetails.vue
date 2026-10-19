<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResourceCatalog } from '../model/catalog'
import type { MessageKey } from '../../../shared/i18n'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import { useDiskActions } from '../model/diskOperations'
import { diskActionKeys } from '../model/diskForm'
import type { DiskAction } from '../api/diskOperations'
import { useAgentOperations, type AgentAction } from '../../agent'

defineProps<{ inline?: boolean }>()
const { t, locale } = useI18n()
const source = useResourceCatalog().diskDetail
const detail = source.data
const actions = useDiskActions()
const agent = useAgentOperations()
function maintain(action: AgentAction) {
  const id = detail.value?.disk.id
  if (!id) return
  source.close()
  void agent.prepare(id, action)
}
// Everyday operations first; chain rewrites and delete are secondary.
const commonActions: DiskAction[] = ['resize', 'clone', 'convert']
const chainActions: DiskAction[] = ['create', 'flatten', 'commit', 'reset']
function operate(action: DiskAction) {
  const id = detail.value?.disk.id
  if (!id) return
  source.close()
  void actions.prepare(id, action)
}
function optimize() {
  const id = detail.value?.disk.id
  if (!id) return
  source.close()
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
const byteRows = ['virtualBytes', 'allocatedBytes', 'clusterBytes'] as const
const byteLabels = ['diskVirtualBytes', 'diskAllocatedBytes', 'diskClusterBytes'] as const
const flagRows = ['encrypted', 'dirty'] as const
const flagLabels = ['diskEncrypted', 'diskDirty'] as const
const boolText = (value: boolean | null) =>
  t(value === null ? 'diskUnknown' : value ? 'diskYes' : 'diskNo')
const bytes = (value: string | null) =>
  value === null
    ? t('diskUnknown')
    : t('diskBytes', { value: BigInt(value).toLocaleString(locale.value) })
const size = (value: string | null) => {
  if (value === null) return t('diskUnknown')
  const raw = Number(BigInt(value))
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let unit = 0,
    amount = raw
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit++
  }
  return `${amount.toLocaleString(locale.value, { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`
}
onBeforeUnmount(() => source.close())
</script>

<template>
  <AppDialog
    :open="!!source.id.value"
    :inline="inline"
    :title="t('diskDetails')"
    @close="source.close"
  >
    <div class="disk-detail">
      <p v-if="source.status.value === 'loading' && !detail" role="status">
        {{ t('processing') }}
      </p>
      <AppNotice v-if="source.problem.value" tone="error" :title="t(source.problem.value.titleKey)"
        ><p>{{ t(source.problem.value.descriptionKey) }}</p></AppNotice
      >
      <template v-if="detail">
        <header class="identity">
          <div>
            <h3>{{ detail.disk.name || detail.disk.id }}</h3>
            <p class="path">{{ detail.disk.path }}</p>
          </div>
          <AppButton
            tone="icon"
            :aria-label="t('refreshList')"
            :title="t('refreshList')"
            :disabled="source.status.value === 'loading'"
            @click="source.refresh"
            ><AppIcon name="refresh"
          /></AppButton>
        </header>
        <p class="summary">
          <span>{{ detail.inspection.format ?? t('diskUnknown') }}</span>
          <span :title="bytes(detail.inspection.virtualBytes)">{{
            size(detail.inspection.virtualBytes)
          }}</span>
          <span :title="bytes(detail.inspection.allocatedBytes)"
            >{{ t('diskAllocatedBytes') }} {{ size(detail.inspection.allocatedBytes) }}</span
          >
        </p>
        <AppNotice
          v-if="detail.inspection.state !== 'ready'"
          tone="warning"
          :title="t(stateLabel)"
        />
        <section v-if="actions.supported.value" class="section">
          <h4>{{ t('diskSectionOperations') }}</h4>
          <div class="disk-actions">
            <AppButton
              tone="tonal"
              :disabled="!actions.allowed.value"
              data-testid="disk-optimize-open"
              @click="optimize"
              >{{ t('diskOptimizeTitle') }}</AppButton
            >
            <AppButton
              v-for="action in commonActions"
              :key="action"
              tone="tonal"
              :disabled="!actions.allowed.value"
              @click="operate(action)"
              >{{ t(diskActionKeys[action]) }}</AppButton
            >
          </div>
          <div class="disk-actions">
            <AppButton
              v-for="action in chainActions"
              :key="action"
              :disabled="!actions.allowed.value"
              @click="operate(action)"
              >{{
                t(action === 'create' ? 'diskCreateOverlay' : diskActionKeys[action])
              }}</AppButton
            >
            <AppButton
              class="danger"
              :disabled="!actions.allowed.value"
              @click="operate('delete')"
              >{{ t(diskActionKeys.delete) }}</AppButton
            >
          </div>
        </section>
        <section v-if="agent.supported.value" class="section">
          <h4>{{ t('diskSectionGuest') }}</h4>
          <div class="disk-actions">
            <AppButton
              tone="tonal"
              :disabled="!agent.allowed.value"
              data-testid="agent-password-open"
              @click="maintain('chpasswd')"
              >{{ t('agentPasswordTitle') }}</AppButton
            >
            <AppButton
              tone="tonal"
              :disabled="!agent.allowed.value"
              data-testid="agent-grow-open"
              @click="maintain('autogrow')"
              >{{ t('agentGrowTitle') }}</AppButton
            >
          </div>
        </section>
        <section class="section">
          <h4>{{ t('diskSectionInfo') }}</h4>
          <dl>
            <div v-for="(key, index) in byteRows" :key="key">
              <dt>{{ t(byteLabels[index]!) }}</dt>
              <dd :title="bytes(detail.inspection[key])">{{ size(detail.inspection[key]) }}</dd>
            </div>
            <div v-for="(key, index) in flagRows" :key="key">
              <dt>{{ t(flagLabels[index]!) }}</dt>
              <dd>{{ boolText(detail.inspection[key]) }}</dd>
            </div>
            <div>
              <dt>{{ t('diskCompression') }}</dt>
              <dd>{{ detail.inspection.compression ?? t('diskUnknown') }}</dd>
            </div>
            <div>
              <dt>{{ t('diskReadOnlyRequired') }}</dt>
              <dd>{{ boolText(detail.readOnlyRequired) }}</dd>
            </div>
          </dl>
          <p class="hint">{{ t('diskReadOnlyHint') }}</p>
        </section>
        <section class="section">
          <h4>{{ t('diskAttachments', { count: detail.attachments.length }) }}</h4>
          <p v-if="!detail.attachments.length" class="hint">{{ t('diskNoAttachments') }}</p>
          <ul class="rows">
            <li v-for="slot in detail.attachments" :key="`${slot.vmId}:${slot.slot}`">
              <strong>{{ slot.vmName || slot.vmId }}</strong>
              <span>
                {{ t('diskSlot', { slot: slot.slot + 1 }) }} ·
                {{ t(slot.readOnly ? 'diskReadOnly' : 'diskReadWrite') }} ·
                {{
                  t(
                    slot.diskId === detail.disk.id
                      ? 'diskDirectReference'
                      : 'diskInheritedReference',
                  )
                }}
              </span>
            </li>
          </ul>
        </section>
        <section class="section">
          <h4>{{ t('diskChain') }}</h4>
          <p v-if="!detail.chainComplete" class="hint">{{ t('diskChainIncomplete') }}</p>
          <ol class="rows">
            <li v-for="disk in detail.chain" :key="disk.id">
              <strong>{{ disk.name || disk.id }}</strong>
              <span>{{ disk.path }}</span>
            </li>
          </ol>
          <details v-if="detail.children.length">
            <summary>{{ t('diskChildren', { count: detail.children.length }) }}</summary>
            <ul class="rows">
              <li v-for="disk in detail.children" :key="disk.id">
                <strong>{{ disk.name || disk.id }}</strong>
                <span>{{ disk.path }}</span>
              </li>
            </ul>
          </details>
        </section>
        <p class="hint">
          {{ t('diskInspectionHint') }}
          {{ t('diskChecked', { time: new Date(detail.checkedAtMs).toLocaleString(locale) }) }}
        </p>
      </template>
    </div>
  </AppDialog>
</template>

<style scoped>
.disk-detail {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
}
.identity {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}
.identity > div {
  flex: 1;
  min-width: 0;
}
h3 {
  margin: 0;
  font-size: var(--md-sys-typescale-title-large-size);
  font-weight: 400;
}
.path,
.hint {
  margin: var(--space-1) 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: 1.5;
}
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
}
.summary span {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-small);
  font-size: var(--md-sys-typescale-label-large-size);
  font-weight: 500;
}
.section {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--md-sys-color-outline-variant);
}
h4 {
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-title-small-size);
  font-weight: 500;
}
.disk-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3) var(--space-4);
  margin: 0;
}
dt {
  margin-bottom: 2px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small-size);
}
dd {
  margin: 0;
}
.rows {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.rows li {
  display: grid;
  gap: 2px;
}
.rows span {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small-size);
}
</style>
