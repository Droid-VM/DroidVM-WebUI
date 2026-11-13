<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useInventory, stateLabelKeys, VmActionControls } from '../modules/vm'
import { formatHostBytes, useHostMonitoring } from '../modules/host'
import { taskKindKeys, taskPercent, taskStateKeys, useTaskMonitor } from '../modules/tasks'
import { useConfigurationEditor } from '../modules/configuration'
import { usePackageImport } from '../modules/packages'
import { useVisiblePolling } from '../shared/model/visiblePolling'
import AppIcon from '../shared/ui/AppIcon.vue'

const { t, n, locale } = useI18n()
const inventory = useInventory()
const host = useHostMonitoring()
const tasks = useTaskMonitor()
const configuration = useConfigurationEditor()
const packageImport = usePackageImport()
const helpUrl = 'https://droid-vm.github.io/'
const feedbackUrl = 'https://github.com/Droid-VM/DroidVM/issues'

useVisiblePolling(
  () => inventory.mode === 'http',
  async () => {
    if (inventory.status.value !== 'loading') await inventory.refresh()
    return inventory.status.value !== 'error'
  },
  ['vms'],
)
useVisiblePolling(
  () => tasks.supported.value,
  async () => {
    if (tasks.status.value !== 'loading') await tasks.reload()
    return tasks.status.value !== 'error'
  },
  ['tasks'],
)

// Mirrors the App's daemon card: green when observed, amber while checking, red when lost.
const daemon = computed(() => {
  if (host.supported.value) {
    if (host.data.value && !host.problem.value) return 'running'
    return host.problem.value ? 'stopped' : 'checking'
  }
  if (inventory.status.value === 'ready') return 'running'
  return inventory.status.value === 'error' ? 'stopped' : 'checking'
})
const daemonLabel = computed(
  () =>
    ({
      running: 'homeDaemonRunning',
      checking: 'homeDaemonChecking',
      stopped: 'homeDaemonUnreachable',
    })[daemon.value],
)
const overview = computed(() => host.data.value)
const ratio = (running: number | null | undefined, total: number | null | undefined) =>
  running == null || total == null ? '—' : `${n(running)}/${n(total)}`
const vmSummary = computed(() =>
  inventory.status.value === 'ready'
    ? ratio(inventory.running.value, inventory.items.value.length)
    : ratio(overview.value?.inventory.runningVmCount, overview.value?.inventory.vmCount),
)
const diskSummary = computed(() => {
  const count = overview.value?.inventory.diskCount
  if (count == null) return '—'
  const size = overview.value?.inventory.diskVirtualBytes
  return size == null
    ? n(count)
    : t('homeDiskSummary', { count: n(count), size: formatHostBytes(size, locale.value) })
})
const networkSummary = computed(() =>
  ratio(overview.value?.inventory.runningNetworkCount, overview.value?.inventory.networkCount),
)
const active = computed(() => inventory.items.value.filter((vm) => vm.state !== 'STOPPED'))
const recentTasks = computed(() => tasks.items.value.slice(0, 2))
const kindName = (kind: string) => (taskKindKeys[kind] ? t(taskKindKeys[kind]) : kind)
const uptime = (ms: string | null | undefined) => {
  if (ms == null) return ''
  const minutes = BigInt(ms) / 60000n
  return t('vmUptimeShort', { hours: n(Number(minutes / 60n)), minutes: n(Number(minutes % 60n)) })
}
const vmPath = (id: string, session = '') =>
  `/vms/${encodeURIComponent(id)}${session ? `/${session}` : ''}`
</script>

<template>
  <div class="home">
    <div class="home-top">
      <RouterLink
        to="/host"
        class="card daemon click"
        :data-state="daemon"
        data-testid="home-daemon"
      >
        <span class="big"><AppIcon :name="daemon === 'running' ? 'ok' : 'info'" /></span>
        <span class="t-tl">{{ t(daemonLabel) }}</span>
        <span class="t-bm">{{ t('homeDaemon') }}</span>
        <span v-if="overview" class="t-bm">{{
          t('homeDaemonPid', { pid: overview.daemon.pid })
        }}</span>
        <span v-if="overview" class="t-bs var">{{
          t('hostServiceVersion', { version: overview.daemon.version })
        }}</span>
      </RouterLink>
      <nav class="stack" :aria-label="t('hostInventoryTitle')">
        <RouterLink to="/vms" class="card stat click" data-testid="home-vms"
          ><AppIcon name="vm" /><span
            ><span class="t-ts">{{ t('navVms') }}</span
            ><span class="t-bs var">{{ vmSummary }}</span></span
          ></RouterLink
        >
        <RouterLink to="/resources/disk" class="card stat click" data-testid="home-disks"
          ><AppIcon name="disk" /><span
            ><span class="t-ts">{{ t('homeVirtualDisks') }}</span
            ><span class="t-bs var">{{ diskSummary }}</span></span
          ></RouterLink
        >
        <RouterLink to="/resources/network" class="card stat click" data-testid="home-networks"
          ><AppIcon name="network" /><span
            ><span class="t-ts">{{ t('homeVirtualNetworks') }}</span
            ><span class="t-bs var">{{ networkSummary }}</span></span
          ></RouterLink
        >
      </nav>
    </div>

    <section class="card sys" :aria-label="t('homeSystem')">
      <dl>
        <dt class="t-lm var">{{ t('hostKernel') }}</dt>
        <dd class="t-tm">{{ overview?.host.kernelRelease ?? '—' }}</dd>
        <dt class="t-lm var">{{ t('hostSoc') }}</dt>
        <dd class="t-tm">{{ overview?.host.socModel ?? '—' }}</dd>
      </dl>
    </section>

    <section class="card home-extra hx-vms" aria-labelledby="home-running">
      <div class="card-h">
        <h2 id="home-running" class="t-tm">{{ t('homeRunningVms') }}</h2>
        <RouterLink to="/vms" class="btn text">{{ t('homeViewAll') }}</RouterLink>
      </div>
      <p v-if="!active.length" class="pad16 var">{{ t('homeNoRunningVms') }}</p>
      <div v-for="vm in active" :key="vm.id" class="mini-vm">
        <span class="mark" :data-state="vm.state.toLowerCase()"><AppIcon name="vm" /></span>
        <RouterLink :to="vmPath(vm.id)" class="grow"
          ><span class="t-ts">{{ vm.name }}</span
          ><span class="t-bs var"
            >{{ t(stateLabelKeys[vm.state])
            }}<template v-if="vm.uptimeMs"> · {{ uptime(vm.uptimeMs) }}</template></span
          ></RouterLink
        >
        <RouterLink :to="vmPath(vm.id, 'logs')" class="btn text">{{ t('console') }}</RouterLink>
        <VmActionControls :vm="vm" compact />
      </div>
    </section>

    <section class="card home-extra hx-tasks" aria-labelledby="home-tasks">
      <div class="card-h">
        <h2 id="home-tasks" class="t-tm">{{ t('navTasks') }}</h2>
        <RouterLink to="/tasks" class="btn text">{{ t('homeViewAll') }}</RouterLink>
      </div>
      <p v-if="!recentTasks.length" class="pad16 var">
        {{ tasks.supported.value ? t('homeNoTasks') : t('tasksUnavailable') }}
      </p>
      <div v-for="task in recentTasks" :key="task.id" class="task">
        <div class="task-line">
          <span class="t-ts">{{ kindName(task.kind) }}</span>
          <span class="t-bs var">{{
            taskPercent(task) !== null
              ? `${n(Math.round(taskPercent(task)!))}%`
              : t(taskStateKeys[task.state])
          }}</span>
        </div>
        <span v-if="task.resource" class="t-bs var task-resource">{{ task.resource }}</span>
        <div class="bar">
          <i
            :style="{ width: `${taskPercent(task) ?? (task.state === 'succeeded' ? 100 : 0)}%` }"
          />
        </div>
      </div>
    </section>

    <nav class="two" :aria-label="t('homeShortcuts')">
      <RouterLink v-if="configuration.canCreate.value" to="/vms/new" class="card act click"
        ><AppIcon name="wand" /><span class="t-ts">{{ t('homeCreateWizard') }}</span></RouterLink
      >
      <RouterLink v-if="packageImport.supported.value" to="/packages/import" class="card act click"
        ><AppIcon name="import" /><span class="t-ts">{{ t('homeImportVm') }}</span></RouterLink
      >
    </nav>

    <div class="links">
      <a
        :href="helpUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="card out act click"
        :aria-label="t('homeOpensExternal', { name: t('homeHelp') })"
        ><AppIcon name="book" /><span class="t-ts grow">{{ t('homeHelp') }}</span
        ><span class="var"><AppIcon name="open" class="sm" /></span
      ></a>
      <a
        :href="feedbackUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="card out act click"
        :aria-label="t('homeOpensExternal', { name: t('homeFeedback') })"
        ><AppIcon name="bug" /><span class="t-ts grow">{{ t('homeFeedback') }}</span
        ><span class="var"><AppIcon name="open" class="sm" /></span
      ></a>
    </div>
  </div>
</template>

<style scoped>
/* docs/webui/app-style/app.html views.home */
.home {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.home a:not(.btn) {
  color: inherit;
  text-decoration: none;
}
.card {
  border: 0;
  padding: 0;
  background: var(--app-color-filled);
}
.card.out {
  border: 1px solid var(--md-sys-color-outline-variant);
  background: var(--app-color-card);
}
.home-top {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.daemon {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 100%;
  padding: 16px;
  background: var(--app-color-daemon-checking);
}
.daemon[data-state='running'] {
  background: var(--app-color-daemon-running);
}
.daemon[data-state='stopped'] {
  background: var(--app-color-daemon-stopped);
}
.daemon .t-bs {
  margin-top: 8px;
}
.big {
  position: absolute;
  right: -30px;
  bottom: -30px;
  color: var(--app-color-warning);
  opacity: 0.22;
}
.daemon[data-state='running'] .big {
  color: var(--app-color-success);
}
.daemon[data-state='stopped'] .big {
  color: var(--md-sys-color-error);
}
.big > .icon {
  width: 140px;
  height: 140px;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
}
.stat > .icon {
  width: 32px;
  height: 32px;
  color: var(--md-sys-color-primary);
}
.stat > span {
  display: grid;
  min-width: 0;
}
.sys {
  padding: 16px;
}
.sys dl {
  margin: 0;
}
.sys dd {
  margin: 2px 0 12px;
  overflow-wrap: anywhere;
}
.sys dd:last-child {
  margin-bottom: 0;
}
.home-extra {
  display: none;
}
.pad16 {
  margin: 0;
  padding: 16px;
}
.mini-vm {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
}
.mini-vm + .mini-vm {
  border-top: 1px solid var(--md-sys-color-outline-variant);
}
.mini-vm .grow {
  display: grid;
}
.mark {
  display: grid;
  color: var(--md-sys-color-on-surface-variant);
}
.mark[data-state='running'] {
  color: var(--app-color-success);
}
.mark[data-state='suspended'] {
  color: var(--app-color-warning);
}
.task {
  display: grid;
  padding: 8px 16px 12px;
}
.task-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.task-resource {
  margin: 2px 0 8px;
  overflow-wrap: anywhere;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.two:empty {
  display: none;
}
.act {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}
.act > .icon {
  color: var(--md-sys-color-primary);
}
.act .sm .icon,
.act .icon.sm {
  width: 18px;
  height: 18px;
}
.links {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.t-tl {
  font-size: 22px;
  line-height: 28px;
}
.t-tm {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  letter-spacing: 0.15px;
}
.t-ts {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  letter-spacing: 0.1px;
}
.t-bm {
  font-size: 14px;
  line-height: 20px;
}
.t-bs {
  font-size: 12px;
  line-height: 16px;
}
.t-lm {
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  letter-spacing: 0.5px;
}
.var {
  color: var(--md-sys-color-on-surface-variant);
}
@media (width >= 600px) {
  .home {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-areas:
      'top top'
      'sys links'
      'vms vms'
      'tasks tasks'
      'two two';
  }
  .home-top {
    grid-area: top;
  }
  .sys {
    grid-area: sys;
  }
  .links {
    grid-area: links;
  }
  .links > .card {
    flex: 1;
  }
  .hx-vms {
    grid-area: vms;
  }
  .hx-tasks {
    grid-area: tasks;
  }
  .two {
    grid-area: two;
  }
  .home-extra {
    display: block;
  }
}
@media (width >= 1200px) {
  .home {
    grid-template-columns: 2fr 1fr;
    grid-template-areas:
      'top sys'
      'vms tasks'
      'two links';
    align-items: start;
  }
  .home-top,
  .sys {
    align-self: stretch;
  }
  .home-top {
    grid-template-columns: 1.1fr 1fr;
  }
}
</style>
