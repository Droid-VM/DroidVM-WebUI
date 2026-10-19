<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ResourceKind } from '../api/gateway'
import { useResourceCatalog } from '../model/catalog'
import { useVisiblePolling } from '../../../shared/model/visiblePolling'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
import EmptyState from '../../../shared/ui/EmptyState.vue'
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
</script>
<template>
  <section class="resource-list" :aria-label="t(kind === 'disk' ? 'navDisk' : 'navNetwork')">
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
      :title="t('resourceUnavailable', { resource: t(kind === 'disk' ? 'navDisk' : 'navNetwork') })"
      :description="t('resourcesUnavailableHint')"
    />
    <template v-else>
      <p class="muted">{{ t('resourceCatalogHint') }}</p>
      <label>{{ t('resourceSearch') }}<input v-model="query" type="search" /></label>
      <AppButton @click="refresh">{{ t('refreshList') }}</AppButton>
      <template v-if="kind === 'network'">
        <AppButton
          v-if="deletion.pending.value || deletion.uncertain.value"
          @click="deletion.resume"
          >{{ t('networkDeletionResume') }}</AppButton
        >
        <AppButton
          v-if="deletion.recoverySupported.value"
          data-testid="configuration-recovery-global-open"
          @click="deletion.openRecovery"
          >{{ t('configurationRecoveryTitle') }}</AppButton
        >
        <AppButton
          v-for="pending in networkRuntime.pending.value"
          :key="pending.request.requestId"
          @click="networkRuntime.open(pending.request.networkId)"
          >{{ t('networkResumeAction') }} · {{ pending.request.networkId }}</AppButton
        >
      </template>
      <template v-if="kind === 'network' && networks.supported.value">
        <AppButton
          v-if="networks.protectedDraft.value"
          @click="editNetwork(networks.target.value!)"
          >{{ t('networkResume') }}</AppButton
        >
        <AppButton :disabled="networks.protectedDraft.value" @click="editNetwork('new')">{{
          t('networkCreate')
        }}</AppButton>
      </template>
      <template v-if="kind === 'disk'">
        <RouterLink v-if="imageImport.supported.value" to="/resources/disk/import">{{
          t('imageImportTitle')
        }}</RouterLink>
        <AppButton
          v-if="actions.supported.value"
          :disabled="!actions.allowed.value"
          @click="actions.prepare(null, 'create')"
          >{{ t('diskCreate') }}</AppButton
        >
        <DiskOperationStatus />
        <DiskRecovery />
        <AgentOperationStatus />
        <AgentRecovery />
        <RouterLink v-if="agent.rescueSupported.value" to="/agent/rescue">{{
          t('agentRescueTitle')
        }}</RouterLink>
      </template>
      <AppNotice v-if="source.problem.value" tone="error" :title="t(source.problem.value.titleKey)"
        ><p>{{ t(source.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p v-if="source.status.value === 'loading'" role="status">{{ t('processing') }}</p>
      <p v-else-if="source.status.value === 'ready' && !visible.length" class="muted">
        {{ t('configNoEntries') }}
      </p>
      <article v-for="item in visible" :key="item.id" class="resource-card">
        <h2>{{ item.name || item.id }}</h2>
        <p class="muted">{{ item.id }}</p>
        <template v-if="'path' in item">
          <p>{{ item.path }}</p>
          <p v-if="item.parentId">{{ t('resourceParent') }}: {{ item.parentId }}</p>
          <p v-if="item.backing">{{ t('resourceBacking') }}</p>
          <p v-if="!item.selectable">{{ t('resourceNotSelectable') }}</p>
          <AppButton
            v-if="catalog.diskDetail.supported.value"
            @click="catalog.diskDetail.open(item.id)"
            >{{ t('diskDetails') }}</AppButton
          >
          <div v-if="agent.supported.value" class="agent-buttons">
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
          </div>
        </template>
        <template v-else>
          <p>{{ item.bridgeType }} · {{ item.uplinkMode }}</p>
          <AppButton v-if="networkRuntime.supported.value" @click="networkRuntime.open(item.id)">{{
            t('networkDetails')
          }}</AppButton>
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
      </article>
    </template>
    <DiskDetails v-if="kind === 'disk' && catalog.diskDetail.id.value" />
    <NetworkDetails v-if="kind === 'network' && networkRuntime.id.value" />
    <NetworkDeletion v-if="kind === 'network'" />
    <DiskOperationDialog v-if="kind === 'disk' && actions.open.value" />
  </section>
</template>
<style scoped>
.resource-list {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
label {
  display: grid;
  gap: var(--space-2);
}
input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
.btn {
  justify-self: start;
}
.resource-card {
  padding: var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow-wrap: anywhere;
}
.agent-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
@media (max-width: 600px) {
  .agent-buttons .btn {
    flex: 1 1 100%;
  }
}
h2 {
  font-size: var(--font-heading);
  margin: 0;
}
p {
  margin: var(--space-2) 0;
}
</style>
