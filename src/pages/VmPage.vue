<script setup lang="ts">
import AppLinkButton from '../shared/ui/AppLinkButton.vue'
import { useI18n } from 'vue-i18n'
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useInventory, useVmActions, VmCard, VmDetails } from '../modules/vm'
import { VmLogs } from '../modules/logs'
import { VmTerminal } from '../modules/terminal'
import { VmConsole } from '../modules/graphics'
import OperationTrackingNotice from '../shared/ui/OperationTrackingNotice.vue'
import { HostSummary } from '../modules/host'
import { usePackageExport } from '../modules/packages'
import { useVisiblePolling } from '../shared/model/visiblePolling'
import { useMediaQuery } from '../shared/lib/mediaQuery'
import AppButton from '../shared/ui/AppButton.vue'
import AppIcon from '../shared/ui/AppIcon.vue'
import AppDialog from '../shared/ui/AppDialog.vue'
import EmptyState from '../shared/ui/EmptyState.vue'
import FilterGroup from '../shared/ui/FilterGroup.vue'
import SearchField from '../shared/ui/SearchField.vue'
import AppProgress from '../shared/ui/AppProgress.vue'
import AppNotice from '../shared/ui/AppNotice.vue'

const { t, n } = useI18n()
const inventory = useInventory()
const { items, visible, status, problem, running, query, filter, reload, mode } = inventory
const actions = useVmActions()
const packageExport = usePackageExport()
useVisiblePolling(
  () => mode === 'http',
  async () => {
    await actions.reconcile()
    if (status.value !== 'loading') await inventory.refresh()
    return (
      status.value !== 'error' &&
      !Object.values(actions.entries.value).some((entry) => entry.problem && entry.state !== 'done')
    )
  },
  ['vms', 'tasks'],
)
const route = useRoute()
const router = useRouter()
const searchVisible = ref(Boolean(query.value))
const hostExpanded = ref(false)
const searchInput = ref<InstanceType<typeof SearchField>>()
const selected = computed(() => items.value.find((vm) => vm.id === route.params.id))
const session = computed(() => String(route.params.session || ''))
// List-detail: wide screens show details beside the list; sessions stay full screen.
const expanded = useMediaQuery('(width >= 840px)')
const detailInPane = computed(() => expanded.value && !session.value)
const filters = [
  { value: 'all', label: 'filterAll' },
  { value: 'RUNNING', label: 'stateRunning' },
  { value: 'STOPPED', label: 'stateStopped' },
] as const
const filterOptions = computed(() =>
  filters.map((item) => ({
    ...item,
    label: t(item.label),
    count:
      status.value === 'ready'
        ? item.value === 'all'
          ? items.value.length
          : items.value.filter((vm) => vm.state === item.value).length
        : undefined,
  })),
)
async function toggleSearch() {
  searchVisible.value = !searchVisible.value
  if (searchVisible.value) {
    await nextTick()
    searchInput.value?.focus()
  }
}
function closeDetails() {
  void router.replace('/vms')
}
</script>

<template>
  <OperationTrackingNotice
    :problem="actions.recoveryProblem.value"
    @clear="actions.clearTracking"
  />
  <div class="page-heading desktop-only">
    <div>
      <p class="eyebrow">{{ t('workspaceVms') }}</p>
      <h1>{{ t('navVms') }}</h1>
      <p class="muted">{{ t('vmsHint') }}</p>
    </div>
  </div>
  <details
    class="overview card-filled"
    @toggle="hostExpanded = ($event.target as HTMLDetailsElement).open"
  >
    <summary>
      <span
        ><i18n-t keypath="runningCount" tag="span" scope="global"
          ><template #count
            ><strong>{{ status === 'ready' ? n(running) : '—' }}</strong></template
          ></i18n-t
        >
        <small>{{
          t('totalCount', { count: status === 'ready' ? n(items.length) : '—' })
        }}</small></span
      ><span>{{ t('hostResources') }} <AppIcon name="chevron" /></span>
    </summary>
    <HostSummary variant="metrics" :active="hostExpanded" />
  </details>
  <div class="vm-layout">
    <section class="instances" :aria-label="t('management')" :aria-busy="status === 'loading'">
      <div class="list-tools">
        <FilterGroup
          v-model="filter"
          class="filters"
          :label="t('filterStatus')"
          :options="filterOptions"
        />
        <AppButton
          v-if="mode === 'http' && (status === 'ready' || status === 'loading')"
          tone="icon"
          class="refresh-list"
          :aria-label="t('refreshList')"
          :title="t('refreshList')"
          :disabled="status === 'loading'"
          @click="reload"
          ><AppIcon name="refresh"
        /></AppButton>
        <AppButton
          tone="icon"
          class="mobile-only search-toggle"
          :aria-label="t('searchVms')"
          :aria-expanded="String(searchVisible || Boolean(query))"
          @click="toggleSearch"
          ><AppIcon name="search"
        /></AppButton>
        <SearchField
          ref="searchInput"
          v-model="query"
          class="search"
          :class="{ expanded: searchVisible || Boolean(query) }"
          :label="t('searchByName')"
          :placeholder="t('searchVms')"
        />
      </div>
      <EmptyState
        v-if="status === 'loading' || status === 'idle'"
        :title="t('loadingVms')"
        :description="t('pleaseWait')"
        ><AppProgress :label="t('loading')"
      /></EmptyState>
      <AppNotice
        v-else-if="problem?.code === 'commit-uncertain'"
        tone="warning"
        :title="t(problem.titleKey)"
        ><p>{{ t(problem.descriptionKey) }}</p>
        <AppButton tone="tonal" @click="reload">{{
          problem.actionLabelKey ? t(problem.actionLabelKey) : ''
        }}</AppButton></AppNotice
      >
      <EmptyState
        v-else-if="problem"
        :title="t(problem.titleKey)"
        :description="t(problem.descriptionKey)"
        ><AppButton v-if="problem.action === 'read'" tone="tonal" @click="reload">{{
          problem.actionLabelKey ? t(problem.actionLabelKey) : ''
        }}</AppButton></EmptyState
      >
      <EmptyState
        v-else-if="!items.length"
        :title="t('emptyVms')"
        :description="t('emptyVmsHint')"
      />
      <EmptyState
        v-else-if="!visible.length"
        :title="t('noMatches')"
        :description="t('noMatchesHint')"
        icon="search"
      />
      <section v-else class="vm-cards" :aria-label="t('vmList')">
        <VmCard
          v-for="vm in visible"
          :key="vm.id"
          :vm="vm"
          :class="{ selected: detailInPane && vm.id === route.params.id }"
        />
      </section>
      <span v-if="status === 'ready'" class="sr-only" role="status">{{
        t('visibleCount', { visible: n(visible.length), total: n(items.length) })
      }}</span>
    </section>
    <div v-if="detailInPane && !route.params.id" class="pane-placeholder">
      <AppIcon name="vm" />
      <p>{{ t('selectVmDetailsHint') }}</p>
    </div>
    <AppDialog
      :open="Boolean(route.params.id)"
      :inline="detailInPane"
      :title="
        session
          ? t('sessionTitle', {
              name: selected?.name || t('navVms'),
              session:
                session === 'logs'
                  ? t('vmLogs')
                  : session === 'terminal'
                    ? t('terminal')
                    : t('console'),
            })
          : t('vmDetails')
      "
      :fullscreen="Boolean(session)"
      :guest-keyboard="session === 'console'"
      @close="closeDetails"
    >
      <EmptyState
        v-if="status !== 'ready'"
        :title="problem ? t(problem.titleKey) : t('loadingDetails')"
        :description="problem ? t(problem.descriptionKey) : t('pleaseWait')"
      />
      <EmptyState v-else-if="!selected" :title="t('missingVm')" :description="t('missingVmHint')" />
      <VmLogs
        v-else-if="session === 'logs'"
        :vm-id="selected.id"
        :instance-id="selected.lifecycle?.instanceId"
      />
      <VmTerminal
        v-else-if="session === 'terminal'"
        :vm-id="selected.id"
        :instance-id="selected.lifecycle?.instanceId"
      />
      <VmConsole
        v-else-if="session === 'console'"
        :vm-id="selected.id"
        :instance-id="selected.lifecycle?.instanceId"
      />
      <EmptyState
        v-else-if="session"
        :icon="session === 'terminal' ? 'terminal' : 'vm'"
        :title="t('sessionUnavailable')"
        :description="t('sessionUnavailableHint')"
      />
      <template v-else>
        <VmDetails :vm="selected" />
        <p v-if="packageExport.supported.value">
          <AppLinkButton tone="tonal" :to="`/packages/export/${encodeURIComponent(selected.id)}`">{{
            t('packageExportTitle')
          }}</AppLinkButton>
        </p>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.overview {
  padding: 0;
  margin-bottom: var(--space-6);
}
summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  cursor: pointer;
  padding: var(--space-4) 22px;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
summary > span {
  display: flex;
  gap: 6px;
  align-items: center;
}
summary small {
  color: var(--md-sys-color-on-surface-variant);
}
summary > span:last-child {
  color: var(--md-sys-color-primary);
  font-size: var(--md-sys-typescale-body-medium-size);
}
summary .icon {
  width: 16px;
  height: 16px;
  transform: rotate(90deg);
}
.overview[open] summary .icon {
  transform: rotate(-90deg);
}
.vm-layout {
  display: grid;
  grid-template-columns: 400px minmax(0, 1fr);
  gap: var(--space-6);
  align-items: start;
}
.instances {
  min-width: 0;
}
.list-tools {
  display: flex;
  gap: var(--space-3);
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}
.refresh-list {
  min-width: var(--touch-target);
  padding: 0;
}
.search {
  max-width: 210px;
}
.vm-cards {
  display: grid;
  gap: var(--space-4);
}
@media (width < 1200px) {
  .vm-layout {
    grid-template-columns: 360px minmax(0, 1fr);
  }
}
@media (width < 840px) {
  .vm-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (width < 600px) {
  .overview {
    margin-bottom: 10px;
  }
  summary {
    min-height: var(--touch-target);
    padding: 10px var(--space-3);
    font-size: var(--md-sys-typescale-body-medium-size);
  }
  summary > span:last-child {
    font-size: var(--md-sys-typescale-body-small-size);
  }
  .list-tools {
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .filters {
    gap: 6px;
    flex: 1;
  }
  .search-toggle {
    padding: 0;
    min-width: var(--touch-target);
  }
  .search {
    display: none;
    max-width: none;
    width: 100%;
  }
  .search.expanded {
    display: flex;
  }
  .vm-cards {
    gap: var(--space-3);
    /* Keep the last card clear of the floating create button. */
    padding-bottom: 72px;
  }
}
</style>
