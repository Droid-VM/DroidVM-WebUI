<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { stateLabelKeys, useInventory, useVmActions, VmCard, VmDetails } from '../modules/vm'
import { useConfigurationEditor, useVmConfigSummaries } from '../modules/configuration'
import { VmLogActions, VmLogs } from '../modules/logs'
import { VmTerminal } from '../modules/terminal'
import { VmConsole } from '../modules/graphics'
import OperationTrackingNotice from '../shared/ui/OperationTrackingNotice.vue'
import { usePackageExport } from '../modules/packages'
import { useVisiblePolling } from '../shared/model/visiblePolling'
import { useMediaQuery } from '../shared/lib/mediaQuery'
import AppButton from '../shared/ui/AppButton.vue'
import AppIcon from '../shared/ui/AppIcon.vue'
import AppDialog from '../shared/ui/AppDialog.vue'
import AppMenu from '../shared/ui/AppMenu.vue'
import EmptyState from '../shared/ui/EmptyState.vue'
import AppProgress from '../shared/ui/AppProgress.vue'
import AppNotice from '../shared/ui/AppNotice.vue'

const { t, n } = useI18n()
const inventory = useInventory()
const { items, visible, status, problem, reload, mode } = inventory
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
const selected = computed(() => items.value.find((vm) => vm.id === route.params.id))
const session = computed(() => String(route.params.session || ''))
// List-detail from 1200px (the design's drawer layout); sessions stay full screen.
const expanded = useMediaQuery('(width >= 1200px)')
const detailInPane = computed(() => expanded.value && !session.value)
const configuration = useConfigurationEditor()
const summaries = useVmConfigSummaries()
// Network, notes and forwards come from the saved configuration of the observed revision.
watch(
  items,
  (vms) =>
    void summaries.ensure(
      vms.find((vm) => vm.lifecycle?.configRevision)?.lifecycle?.configRevision,
    ),
  { immediate: true },
)
// Leaving a session goes up one level, to that VM's details; leaving details goes to the list.
function closeDetails() {
  const id = route.params.id
  void router.replace(session.value && id ? `/vms/${encodeURIComponent(String(id))}` : '/vms')
}
const running = computed(() => !!selected.value && selected.value.state !== 'STOPPED')
</script>

<template>
  <OperationTrackingNotice
    :problem="actions.recoveryProblem.value"
    @clear="actions.clearTracking"
  />
  <h1>{{ t('navVms') }}</h1>
  <div class="vm-layout" :class="{ ld: expanded }">
    <section class="instances" :aria-label="t('management')" :aria-busy="status === 'loading'">
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
      <EmptyState v-else-if="!items.length" :title="t('emptyVms')" />
      <EmptyState v-else-if="!visible.length" :title="t('noMatches')" icon="search" />
      <section v-else class="list vm-list" :aria-label="t('vmList')">
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
    </div>
    <AppDialog
      :open="Boolean(route.params.id)"
      :inline="detailInPane"
      :title="
        session && session !== 'logs'
          ? t('sessionTitle', {
              name: selected?.name || t('navVms'),
              session:
                session === 'logs'
                  ? t('vmLogs')
                  : session === 'terminal'
                    ? t('terminal')
                    : t('console'),
            })
          : selected?.name || t('vmDetails')
      "
      :fullscreen="Boolean(session)"
      page
      :guest-keyboard="session === 'console'"
      @close="closeDetails"
    >
      <template v-if="session === 'logs' && selected" #actions>
        <VmLogActions :vm-id="selected.id" />
      </template>
      <template
        v-else-if="
          !session && selected && (configuration.supported.value || packageExport.supported.value)
        "
        #actions
      >
        <RouterLink
          v-if="configuration.supported.value"
          :to="`/vms/${encodeURIComponent(selected.id)}/edit`"
          class="top-action"
          :aria-label="t('edit')"
          :title="t('edit')"
          ><AppIcon name="edit"
        /></RouterLink>
        <AppMenu :label="t('moreActions')">
          <button
            v-if="configuration.supported.value"
            type="button"
            role="menuitem"
            @click="router.push(`/vms/${encodeURIComponent(selected.id)}/copy`)"
          >
            {{ t('configCopy') }}
          </button>
          <button
            v-if="packageExport.supported.value"
            type="button"
            role="menuitem"
            @click="router.push(`/packages/export/${encodeURIComponent(selected.id)}`)"
          >
            {{ t('packageExportTitle') }}
          </button>
          <button
            v-if="configuration.supported.value"
            type="button"
            role="menuitem"
            class="danger"
            @click="
              router.push({
                path: `/vms/${encodeURIComponent(selected.id)}/edit`,
                query: { delete: '1' },
              })
            "
          >
            {{ t('deleteAction') }}
          </button>
        </AppMenu>
      </template>
      <EmptyState
        v-if="status !== 'ready'"
        :title="problem ? t(problem.titleKey) : t('loadingDetails')"
        :description="problem ? t(problem.descriptionKey) : t('pleaseWait')"
      />
      <EmptyState v-else-if="!selected" :title="t('missingVm')" />
      <VmLogs
        v-else-if="session === 'logs'"
        :vm-id="selected.id"
        :instance-id="selected.lifecycle?.instanceId"
        :state-text="t(stateLabelKeys[selected.state])"
        :state-tone="
          selected.state === 'RUNNING' ? 'success' : selected.state === 'SUSPENDED' ? 'warning' : ''
        "
      />
      <VmTerminal
        v-else-if="session === 'terminal'"
        :vm-id="selected.id"
        :instance-id="selected.lifecycle?.instanceId"
        :running="running"
      />
      <EmptyState
        v-else-if="session === 'console' && !running"
        icon="monitor"
        :title="t('graphicVmStopped')"
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
      />
      <VmDetails v-else :vm="selected" />
    </AppDialog>
  </div>
</template>

<style scoped>
.instances {
  min-width: 0;
}
/* 600-1199: two cards per row like the App's tablet list. */
@media (width >= 600px) {
  .vm-layout:not(.ld) .vm-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
}
/* >= 1200: list-detail. The list scrolls on its own beside the detail, as the design. */
.vm-layout.ld {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  margin: -8px -32px -40px;
  min-height: calc(100dvh - 64px);
}
.ld > .instances {
  position: sticky;
  top: 64px;
  align-self: start;
  max-height: calc(100dvh - 64px);
  overflow: auto;
  padding: 8px 16px 32px 24px;
  border-right: 1px solid var(--md-sys-color-outline-variant);
}
.ld > .dialog-pane,
.ld > .pane-placeholder {
  position: static;
  max-height: none;
  overflow: visible;
  padding: 8px 32px 40px;
  border-radius: 0;
  background: none;
}
.ld > .dialog-pane :deep(> .dialog-header) {
  height: 56px;
  padding: 0 0 8px;
  background: none;
}
.ld > .dialog-pane :deep(> .dialog-header h2) {
  flex: 1;
  font-size: 22px;
  line-height: 28px;
}
.ld > .dialog-pane :deep(> .dialog-body) {
  max-width: 880px;
  padding: 0;
}
@media (width >= 1600px) {
  .ld > .dialog-pane :deep(> .dialog-body) {
    max-width: none;
  }
}
</style>
