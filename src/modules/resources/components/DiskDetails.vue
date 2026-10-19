<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResourceCatalog } from '../model/catalog'
import type { MessageKey } from '../../../shared/i18n'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import { useDiskActions } from '../model/diskOperations'
import { diskActionKeys } from '../model/diskForm'
import type { DiskAction } from '../api/diskOperations'
import { useAgentOperations, type AgentAction } from '../../agent'

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
const actionList: DiskAction[] = [
  'create',
  'clone',
  'resize',
  'convert',
  'flatten',
  'commit',
  'reset',
  'delete',
]
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
onBeforeUnmount(() => source.close())
</script>

<template>
  <AppDialog :open="!!source.id.value" :title="t('diskDetails')" @close="source.close">
    <div class="disk-detail">
      <AppButton :disabled="source.status.value === 'loading'" @click="source.refresh">{{
        t('refreshList')
      }}</AppButton>
      <p v-if="source.status.value === 'loading'" role="status">{{ t('processing') }}</p>
      <AppNotice v-if="source.problem.value" tone="error" :title="t(source.problem.value.titleKey)"
        ><p>{{ t(source.problem.value.descriptionKey) }}</p></AppNotice
      >
      <template v-if="detail">
        <h3>{{ detail.disk.name || detail.disk.id }}</h3>
        <p>{{ detail.disk.path }}</p>
        <AppNotice
          :tone="detail.inspection.state === 'ready' ? 'info' : 'warning'"
          :title="t(stateLabel)"
        />
        <dl>
          <dt>{{ t('diskActualFormat') }}</dt>
          <dd>{{ detail.inspection.format ?? t('diskUnknown') }}</dd>
          <template v-for="(key, index) in byteRows" :key="key"
            ><dt>{{ t(byteLabels[index]!) }}</dt>
            <dd>{{ bytes(detail.inspection[key]) }}</dd></template
          >
          <template v-for="(key, index) in flagRows" :key="key"
            ><dt>{{ t(flagLabels[index]!) }}</dt>
            <dd>{{ boolText(detail.inspection[key]) }}</dd></template
          >
          <dt>{{ t('diskCompression') }}</dt>
          <dd>{{ detail.inspection.compression ?? t('diskUnknown') }}</dd>
          <dt>{{ t('diskReadOnlyRequired') }}</dt>
          <dd>{{ boolText(detail.readOnlyRequired) }}</dd>
        </dl>
        <p class="muted">{{ t('diskReadOnlyHint') }}</p>
        <div v-if="agent.supported.value" class="disk-actions">
          <AppButton
            :disabled="!agent.allowed.value"
            data-testid="agent-password-open"
            @click="maintain('chpasswd')"
            >{{ t('agentPasswordTitle') }}</AppButton
          >
          <AppButton
            :disabled="!agent.allowed.value"
            data-testid="agent-grow-open"
            @click="maintain('autogrow')"
            >{{ t('agentGrowTitle') }}</AppButton
          >
        </div>
        <div v-if="actions.supported.value" class="disk-actions">
          <AppButton
            :disabled="!actions.allowed.value"
            data-testid="disk-optimize-open"
            @click="optimize"
            >{{ t('diskOptimizeTitle') }}</AppButton
          >
          <AppButton
            v-for="action in actionList"
            :key="action"
            :disabled="!actions.allowed.value"
            @click="operate(action)"
            >{{ t(action === 'create' ? 'diskCreateOverlay' : diskActionKeys[action]) }}</AppButton
          >
        </div>
        <details open>
          <summary>{{ t('diskChain') }}</summary>
          <p v-if="!detail.chainComplete">{{ t('diskChainIncomplete') }}</p>
          <ol>
            <li v-for="disk in detail.chain" :key="disk.id">
              <strong>{{ disk.name || disk.id }}</strong>
              <p>{{ disk.path }}</p>
            </li>
          </ol>
        </details>
        <details>
          <summary>{{ t('diskChildren', { count: detail.children.length }) }}</summary>
          <ul>
            <li v-for="disk in detail.children" :key="disk.id">
              {{ disk.name || disk.id }}
              <p>{{ disk.path }}</p>
            </li>
          </ul>
        </details>
        <details open>
          <summary>{{ t('diskAttachments', { count: detail.attachments.length }) }}</summary>
          <p v-if="!detail.attachments.length">{{ t('diskNoAttachments') }}</p>
          <ul>
            <li v-for="slot in detail.attachments" :key="`${slot.vmId}:${slot.slot}`">
              <strong>{{ slot.vmName || slot.vmId }}</strong>
              <p>
                {{ t('diskSlot', { slot: slot.slot + 1 }) }} ·
                {{ t(slot.readOnly ? 'diskReadOnly' : 'diskReadWrite') }}
              </p>
              <p>
                {{
                  t(
                    slot.diskId === detail.disk.id
                      ? 'diskDirectReference'
                      : 'diskInheritedReference',
                  )
                }}
              </p>
              <p v-if="slot.diskId !== detail.disk.id" class="muted">{{ slot.diskId }}</p>
            </li>
          </ul>
        </details>
        <p class="muted">{{ t('diskInspectionHint') }}</p>
        <p class="muted">
          {{ t('diskChecked', { time: new Date(detail.checkedAtMs).toLocaleString(locale) }) }}
        </p>
      </template>
    </div>
  </AppDialog>
</template>

<style scoped>
.disk-detail {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  overflow-wrap: anywhere;
}
.btn {
  justify-self: start;
}
.disk-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
h3,
p {
  margin: 0;
}
dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
  gap: var(--space-2);
}
dd {
  margin: 0;
}
details {
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
summary {
  cursor: pointer;
}
ul,
ol {
  padding-inline-start: var(--space-4);
}
li {
  margin-block: var(--space-3);
}
li p {
  margin-top: var(--space-1);
}
</style>
