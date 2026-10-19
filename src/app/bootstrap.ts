import { createApp, nextTick, watch, watchEffect } from 'vue'
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import {
  createInventory,
  inventoryKey,
  createVmActions,
  vmActionsKey,
  type VmGateway,
  type VmActionGateway,
} from '../modules/vm'
import { sessionKey, type Session } from '../modules/session'
import { createTaskMonitor, taskMonitorKey, type TaskGateway } from '../modules/tasks'
import { createLogViewer, logViewerKey, type LogGateway } from '../modules/logs'
import { createEventFeed, type EventGateway } from '../modules/events'
import { createVmTerminal, vmTerminalKey, type VmTerminalGateway } from '../modules/terminal'
import { createVmGraphics, vmGraphicsKey, type VmGraphicsGateway } from '../modules/graphics'
import { createHostOverview, hostOverviewKey, type HostOverviewGateway } from '../modules/host'
import HostPage from '../pages/HostPage.vue'
import HugepagesPage from '../pages/HugepagesPage.vue'
import { createHugepages, hugepagesKey, type HugepageGateway } from '../modules/hugepages'
import HugepageProcessesPage from '../pages/HugepageProcessesPage.vue'
import HostPreferencesPage from '../pages/HostPreferencesPage.vue'
import UsbAcmPage from '../pages/UsbAcmPage.vue'
import DiskDefaultsPage from '../pages/DiskDefaultsPage.vue'
import {
  createDiskDefaults,
  diskDefaultsKey,
  type DiskDefaultGateway,
} from '../modules/diskDefaults'
import { createUsbAcm, usbAcmKey, type UsbAcmGateway } from '../modules/usbAcm'
import {
  createHostPreferences,
  hostPreferencesKey,
  type HostPreferenceGateway,
} from '../modules/hostPreferences'
import {
  createHugepageProcesses,
  hugepageProcessesKey,
  type HugepageProcessGateway,
} from '../modules/hugepage-processes'
import {
  createAgentOperations,
  agentOperationsKey,
  type AgentGateway,
  createAgentRescue,
  agentRescueKey,
  type AgentRescueGateway,
} from '../modules/agent'
import { liveUpdatesKey } from '../shared/model/liveUpdates'
import { ApiError } from '../shared/api/errors'
import {
  createConfigurationEditor,
  configurationEditorKey,
  type ConfigurationGateway,
} from '../modules/configuration'
import VmEditPage from '../pages/VmEditPage.vue'
import UsbRulesPage from '../pages/UsbRulesPage.vue'
import NetworkEditPage from '../pages/NetworkEditPage.vue'
import {
  createNetworkEditor,
  networkEditorKey,
  type NetworkConfigurationGateway,
  createNetworkRuntime,
  networkRuntimeKey,
  type NetworkRuntimeGateway,
  createHostNetwork,
  hostNetworkKey,
  type HostNetworkGateway,
  createNetworkDeletion,
  networkDeletionKey,
  type NetworkDeletionGateway,
  type ConfigurationRecoveryGateway,
} from '../modules/networks'
import { createUsbRulesEditor, usbRulesEditorKey, type UsbRulesGateway } from '../modules/usbRules'
import {
  createResourceCatalog,
  resourceCatalogKey,
  type ResourceGateway,
  createUsbActions,
  usbActionsKey,
  type UsbActionGateway,
  createDiskActions,
  diskActionsKey,
  type DiskActionGateway,
} from '../modules/resources'
import App from './App.vue'
import { createLocalization, localizationKey } from '../shared/i18n'
import VmPage from '../pages/VmPage.vue'
import ResourcesPage from '../pages/ResourcesPage.vue'
import TasksPage from '../pages/TasksPage.vue'
import MorePage from '../pages/MorePage.vue'
import NotFoundPage from '../pages/NotFoundPage.vue'
import AgentRescuePage from '../pages/AgentRescuePage.vue'
import PackageExportPage from '../pages/PackageExportPage.vue'
import PackageImportPage from '../pages/PackageImportPage.vue'
import PackageTransfersPage from '../pages/PackageTransfersPage.vue'
import ConfigurationBackupPage from '../pages/ConfigurationBackupPage.vue'
import WebServicePage from '../pages/WebServicePage.vue'
import ImageImportPage from '../pages/ImageImportPage.vue'
import LinuxVmCreatePage from '../pages/LinuxVmCreatePage.vue'
import { createLinuxVmWizard, linuxVmWizardKey } from '../modules/linuxVm'
import { createImageImport, imageImportKey, type ImageImportGateway } from '../modules/images'
import {
  createImageTransfers,
  imageTransfersKey,
  type ImageTransferGateway,
} from '../modules/images'
import { createWebService, webServiceKey, type WebServiceGateway } from '../modules/webService'
import {
  createConfigurationBackup,
  configurationBackupKey,
  type ConfigurationBackupGateway,
} from '../modules/backups'
import {
  createPackageExport,
  packageExportKey,
  type PackageExportGateway,
  createPackageImport,
  packageImportKey,
  type PackageImportGateway,
  createPackageTransfers,
  packageTransfersKey,
  type PackageTransferGateway,
} from '../modules/packages'
import '../shared/styles/tokens.css'
import '../shared/styles/base.css'

export function mountApp(
  gateway: VmGateway,
  extraRoutes: RouteRecordRaw[] = [],
  session?: Session,
  taskGateway?: TaskGateway,
  vmActionGateway?: VmActionGateway,
  logGateway?: LogGateway,
  eventGateway?: EventGateway,
  configurationGateway?: ConfigurationGateway,
  resourceGateway?: ResourceGateway,
  usbActionGateway?: UsbActionGateway,
  usbRulesGateway?: UsbRulesGateway,
  diskActionGateway?: DiskActionGateway,
  networkConfigurationGateway?: NetworkConfigurationGateway,
  networkRuntimeGateway?: NetworkRuntimeGateway,
  hostNetworkGateway?: HostNetworkGateway,
  networkDeletionGateway?: NetworkDeletionGateway,
  configurationRecoveryGateway?: ConfigurationRecoveryGateway,
  terminalGateway?: VmTerminalGateway,
  agentGateway?: AgentGateway,
  rescueGateway?: AgentRescueGateway,
  rescueTerminalGateway?: VmTerminalGateway,
  packageExportGateway?: PackageExportGateway,
  packageImportGateway?: PackageImportGateway,
  packageTransferGateway?: PackageTransferGateway,
  configurationBackupGateway?: ConfigurationBackupGateway,
  webServiceGateway?: WebServiceGateway,
  imageImportGateway?: ImageImportGateway,
  imageTransferGateway?: ImageTransferGateway,
  graphicsGateway?: VmGraphicsGateway,
  hostOverviewGateway?: HostOverviewGateway,
  hugepageGateway?: HugepageGateway,
  hugepageProcessGateway?: HugepageProcessGateway,
  hostPreferenceGateway?: HostPreferenceGateway,
  usbAcmGateway?: UsbAcmGateway,
  diskDefaultGateway?: DiskDefaultGateway,
) {
  const inventory = createInventory(gateway)
  const hostOverview = createHostOverview(hostOverviewGateway)
  const hugepages = createHugepages(hugepageGateway)
  const hostPreferences = createHostPreferences(hostPreferenceGateway)
  const usbAcm = createUsbAcm(usbAcmGateway)
  const diskDefaults = createDiskDefaults(diskDefaultGateway)
  const hugepageProcesses = createHugepageProcesses(
    hugepageProcessGateway,
    undefined,
    () => !hugepages.pending.value,
  )
  const webService = createWebService(webServiceGateway)
  const packageTransfers = createPackageTransfers(packageTransferGateway)
  const packageExport = createPackageExport(packageExportGateway, inventory.refresh)
  const tasks = createTaskMonitor(taskGateway)
  const vmActions = createVmActions(vmActionGateway, inventory.refresh)
  const logs = createLogViewer(logGateway)
  const configuration = createConfigurationEditor(configurationGateway)
  const resources = createResourceCatalog(resourceGateway)
  const linuxVm = createLinuxVmWizard({
    loadDefaultCpus: diskDefaults.loadSavedCpus,
    disk: diskActionGateway,
    agent: agentGateway,
    configuration: configurationGateway,
    refresh: async () => {
      const results = await Promise.all([inventory.refresh(), resources.disks.refresh()])
      return results.every(Boolean)
    },
  })
  const imageImport = createImageImport(
    imageImportGateway,
    async () => {
      const results = await Promise.all([inventory.refresh(), resources.disks.refresh()])
      return results.every(Boolean)
    },
    undefined,
    diskActionGateway
      ? async (diskId) => {
          if (!diskActionGateway.supported())
            throw new ApiError('unsupported', 'Disk optimization is unavailable')
          await diskActions.reconcile()
          if (!diskActions.allowed.value)
            throw new ApiError('conflict', 'Resolve the current disk operation first')
          const failure = await router.push('/resources/disk')
          if (failure) throw new Error('Navigation failed')
          resources.diskDetail.close()
          await diskActions.prepareOptimize(diskId, 'import')
        }
      : undefined,
  )
  const imageTransfers = createImageTransfers(imageTransferGateway, imageImport.acceptSource)
  const configurationBackup = createConfigurationBackup(configurationBackupGateway, async () => {
    const results = await Promise.all([
      inventory.refresh(),
      resources.disks.supported.value ? resources.disks.refresh() : Promise.resolve(true),
      resources.networks.supported.value ? resources.networks.refresh() : Promise.resolve(true),
    ])
    return results.every(Boolean)
  })
  const packageImport = createPackageImport(packageImportGateway, async () => {
    const fresh = await inventory.refresh()
    await Promise.all([
      resources.disks.supported.value ? resources.disks.refresh() : Promise.resolve(true),
      resources.networks.supported.value ? resources.networks.refresh() : Promise.resolve(true),
    ])
    return fresh
  })
  const usbActions = createUsbActions(usbActionGateway, resources.usb.refresh)
  const usbRules = createUsbRulesEditor(usbRulesGateway)
  const networkEditor = createNetworkEditor(networkConfigurationGateway)
  const networkRuntime = createNetworkRuntime(networkRuntimeGateway)
  const hostNetwork = createHostNetwork(hostNetworkGateway)
  const terminal = createVmTerminal(terminalGateway)
  const graphics = createVmGraphics(graphicsGateway)
  const rescue = createAgentRescue(rescueGateway, rescueTerminalGateway)
  const agent = createAgentOperations(agentGateway, async () => {
    const fresh = await resources.disks.refresh()
    if (fresh) await inventory.refresh()
    return fresh
  })
  const diskActions = createDiskActions(
    diskActionGateway,
    async () => {
      const fresh = await resources.disks.refresh()
      if (fresh) await inventory.refresh()
      return fresh
    },
    undefined,
    {
      available: () => agent.allowed.value && !agent.open.value,
      start: agent.submitAutoGrow,
    },
    diskDefaults.loadSavedCpus,
    diskDefaults.optimization,
  )
  const networkDeletion = createNetworkDeletion(
    networkDeletionGateway,
    networkConfigurationGateway,
    networkRuntimeGateway,
    configurationRecoveryGateway,
    async () => {
      const fresh = await resources.networks.refresh()
      if (fresh) await inventory.refresh()
      return fresh
    },
  )
  const localization = createLocalization()
  const positions = new Map<string, { left: number; top: number }>()
  const group = (path: string) => path.split('/')[1] || ''
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/vms' },
      { path: '/vms/new', component: VmEditPage, meta: { title: 'createVm', create: true } },
      { path: '/vms/new/linux', component: LinuxVmCreatePage, meta: { title: 'linuxVmTitle' } },
      { path: '/vms/:id/edit', component: VmEditPage, meta: { title: 'configEdit' } },
      { path: '/vms/:id/copy', component: VmEditPage, meta: { title: 'configCopy', copy: true } },
      {
        path: '/vms/:id?/:session(console|terminal|logs)?',
        component: VmPage,
        meta: { title: 'navVms' },
      },
      {
        path: '/resources/:kind(network|disk|usb)?',
        component: ResourcesPage,
        meta: { title: 'navResources' },
      },
      { path: '/tasks', component: TasksPage, meta: { title: 'navTasks' } },
      {
        path: '/resources/disk/import',
        component: ImageImportPage,
        meta: { title: 'imageImportTitle' },
      },
      { path: '/settings/service', component: WebServicePage, meta: { title: 'webServiceTitle' } },
      {
        path: '/settings/vm',
        component: HostPreferencesPage,
        meta: { title: 'hostPreferencesTitle' },
      },
      {
        path: '/settings/backup',
        component: ConfigurationBackupPage,
        meta: { title: 'backupTitle' },
      },
      {
        path: '/packages/transfers',
        component: PackageTransfersPage,
        meta: { title: 'transferTitle' },
      },
      {
        path: '/packages/import',
        component: PackageImportPage,
        meta: { title: 'packageImportTitle' },
      },
      {
        path: '/packages/export/:id?',
        component: PackageExportPage,
        meta: { title: 'packageExportTitle' },
      },
      {
        path: '/agent/rescue/:id?',
        component: AgentRescuePage,
        meta: { title: 'agentRescueTitle' },
      },
      {
        path: '/resources/network/new',
        component: NetworkEditPage,
        meta: { title: 'networkCreate', create: true },
      },
      {
        path: '/resources/network/:id/edit',
        component: NetworkEditPage,
        meta: { title: 'networkEdit' },
      },
      { path: '/resources/usb/rules', component: UsbRulesPage, meta: { title: 'usbRulesTitle' } },
      { path: '/more', component: MorePage, meta: { title: 'navMore' } },
      { path: '/settings/usb-acm', component: UsbAcmPage, meta: { title: 'usbAcmTitle' } },
      {
        path: '/settings/disks',
        component: DiskDefaultsPage,
        meta: { title: 'diskDefaultsTitle' },
      },
      { path: '/host', component: HostPage, meta: { title: 'hostOverviewTitle' } },
      { path: '/hugepages', component: HugepagesPage, meta: { title: 'hugepagesTitle' } },
      {
        path: '/hugepages/processes',
        component: HugepageProcessesPage,
        meta: { title: 'hpProcessTitle' },
      },
      ...extraRoutes,
      { path: '/:pathMatch(.*)*', component: NotFoundPage, meta: { title: 'notFound' } },
    ],
    scrollBehavior(to, from, saved) {
      if (to.path.startsWith('/vms') && from.path.startsWith('/vms')) return false
      return saved ?? positions.get(group(to.path)) ?? { top: 0 }
    },
  })
  router.beforeEach((to, from) => {
    if (group(to.path) !== group(from.path))
      positions.set(group(from.path), { left: window.scrollX, top: window.scrollY })
  })
  router.afterEach(async (to, from, failure) => {
    if (failure) return
    if (to.fullPath !== from.fullPath) diskActions.resizeGrow.stop()
    if (from.matched.length > 0 && group(to.path) !== group(from.path) && !to.params.id) {
      await nextTick()
      document.querySelector<HTMLElement>('#main')?.focus({ preventScroll: true })
    }
  })
  const stopTitle = watchEffect(() => {
    document.title = `DroidVM · ${localization.i18n.global.t(session && session.status.value !== 'authenticated' ? 'sessionLoginTitle' : String(router.currentRoute.value.meta.title || 'management'))}`
  })
  const app = createApp(App)
  if (eventGateway) {
    const feed = createEventFeed(eventGateway)
    app.provide(liveUpdatesKey, feed)
    app.onUnmount(feed.dispose)
  }
  app.use(localization.i18n)
  app.provide(localizationKey, localization)
  app.onUnmount(() => {
    stopTitle()
    localization.dispose()
  })
  app.provide(inventoryKey, inventory)
  app.provide(packageExportKey, packageExport)
  app.provide(packageTransfersKey, packageTransfers)
  app.provide(configurationBackupKey, configurationBackup)
  app.provide(webServiceKey, webService)
  app.provide(imageImportKey, imageImport)
  app.provide(imageTransfersKey, imageTransfers)
  app.onUnmount(imageTransfers.dispose)
  app.provide(linuxVmWizardKey, linuxVm)
  app.onUnmount(linuxVm.dispose)
  app.onUnmount(imageImport.dispose)
  app.onUnmount(webService.dispose)
  app.onUnmount(configurationBackup.dispose)
  app.onUnmount(packageTransfers.dispose)
  app.provide(packageImportKey, packageImport)
  app.onUnmount(packageImport.dispose)
  app.onUnmount(packageExport.dispose)
  app.provide(vmActionsKey, vmActions)
  app.provide(logViewerKey, logs)
  app.provide(configurationEditorKey, configuration)
  app.provide(resourceCatalogKey, resources)
  app.provide(usbActionsKey, usbActions)
  app.provide(diskActionsKey, diskActions)
  app.provide(usbRulesEditorKey, usbRules)
  app.provide(networkEditorKey, networkEditor)
  app.provide(networkRuntimeKey, networkRuntime)
  app.provide(hostNetworkKey, hostNetwork)
  app.provide(vmTerminalKey, terminal)
  app.provide(vmGraphicsKey, graphics)
  app.provide(hugepagesKey, hugepages)
  app.onUnmount(hugepages.dispose)
  app.provide(hugepageProcessesKey, hugepageProcesses)
  app.onUnmount(hugepageProcesses.dispose)
  app.provide(hostPreferencesKey, hostPreferences)
  app.onUnmount(hostPreferences.dispose)
  app.provide(usbAcmKey, usbAcm)
  app.onUnmount(usbAcm.dispose)
  app.provide(diskDefaultsKey, diskDefaults)
  app.onUnmount(diskDefaults.dispose)
  app.provide(hostOverviewKey, hostOverview)
  app.onUnmount(hostOverview.dispose)
  app.onUnmount(graphics.dispose)
  app.provide(agentOperationsKey, agent)
  app.provide(agentRescueKey, rescue)
  app.onUnmount(rescue.dispose)
  app.onUnmount(agent.dispose)
  app.onUnmount(terminal.dispose)
  app.provide(networkDeletionKey, networkDeletion)
  app.onUnmount(networkDeletion.dispose)
  app.onUnmount(networkRuntime.dispose)
  app.onUnmount(hostNetwork.reset)
  app.onUnmount(networkEditor.dispose)
  const protectRules = (event: BeforeUnloadEvent) => {
    if (
      usbRules.protectedDraft.value ||
      networkEditor.protectedDraft.value ||
      networkRuntime.pending.value.length ||
      networkDeletion.pending.value ||
      agent.busy.value ||
      rescue.pending.value ||
      packageExport.pending.value ||
      packageImport.pending.value ||
      packageTransfers.pending.value ||
      configurationBackup.busy.value ||
      webService.pending.value ||
      hugepages.pending.value ||
      hugepageProcesses.pending.value ||
      hostPreferences.pending.value ||
      hostPreferences.dirty.value ||
      usbAcm.pending.value ||
      usbAcm.dirty.value ||
      diskDefaults.pending.value ||
      diskDefaults.dirty.value ||
      hugepages.dirty.value ||
      imageImport.pending.value ||
      imageTransfers.pending.value ||
      linuxVm.hasWork.value ||
      webService.dirty.value ||
      configurationBackup.hasFile.value ||
      diskActions.resizeGrow.pending.value
    ) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', protectRules)
  app.onUnmount(() => {
    window.removeEventListener('beforeunload', protectRules)
    usbRules.dispose()
  })
  app.onUnmount(usbActions.dispose)
  app.onUnmount(diskActions.dispose)
  app.onUnmount(resources.reset)
  app.onUnmount(configuration.reset)
  app.onUnmount(logs.dispose)
  app.onUnmount(vmActions.dispose)
  app.provide(taskMonitorKey, tasks)
  app.onUnmount(tasks.dispose)
  if (session) {
    app.provide(sessionKey, session)
    const stopSession = watch(
      session.status,
      (status) => {
        inventory.reset()
        tasks.reset()
        logs.reset()
        configuration.reset()
        resources.reset()
        hostNetwork.reset()
        if (status === 'authenticated' && session.current.value) {
          imageTransfers.bind(
            session.current.value.server.daemonEpoch + ':' + session.current.value.id,
          )
          linuxVm.bind(session.current.value.server.daemonEpoch + ':' + session.current.value.id)
          imageImport.bind(
            session.current.value.server.daemonEpoch + ':' + session.current.value.id,
          )
          webService.bind(session.current.value.server.daemonEpoch + ':' + session.current.value.id)
          configurationBackup.bind(
            session.current.value.server.daemonEpoch + ':' + session.current.value.id,
          )
          packageTransfers.bind(
            session.current.value.server.daemonEpoch + ':' + session.current.value.id,
          )
          agent.bind(session.current.value.server.daemonEpoch + ':' + session.current.value.id)
          packageImport.bind(
            session.current.value.server.daemonEpoch + ':' + session.current.value.id,
          )
          packageExport.bind(
            session.current.value.server.daemonEpoch + ':' + session.current.value.id,
          )
          rescue.bind(session.current.value.server.daemonEpoch + ':' + session.current.value.id)
          terminal.bind(`${session.current.value.server.daemonEpoch}:${session.current.value.id}`)
          graphics.bind(`${session.current.value.server.daemonEpoch}:${session.current.value.id}`)
          hugepages.bind(`${session.current.value.server.daemonEpoch}:${session.current.value.id}`)
          hugepageProcesses.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
          hostPreferences.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
          usbAcm.bind(`${session.current.value.server.daemonEpoch}:${session.current.value.id}`)
          diskDefaults.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
          hostOverview.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
          vmActions.bind(`${session.current.value.server.daemonEpoch}:${session.current.value.id}`)
          usbActions.bind(`${session.current.value.server.daemonEpoch}:${session.current.value.id}`)
          diskActions.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
          usbRules.bind(`${session.current.value.server.daemonEpoch}:${session.current.value.id}`)
          networkRuntime.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
          networkEditor.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
          networkDeletion.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
        } else if (
          status === 'anonymous' ||
          status === 'signing-out' ||
          status === 'authenticating'
        ) {
          vmActions.reset()
          usbActions.reset()
          diskActions.reset()
          usbRules.reset()
          networkEditor.reset()
          networkRuntime.reset()
          networkDeletion.reset()
          terminal.reset()
          graphics.reset()
          hostOverview.reset()
          hugepages.reset()
          hugepageProcesses.reset()
          hostPreferences.reset()
          usbAcm.reset()
          diskDefaults.reset()
          hostOverview.pause()
          hugepages.pause()
          hugepageProcesses.pause()
          hostPreferences.pause()
          usbAcm.pause()
          diskDefaults.pause()
          agent.reset()
          packageExport.reset()
          packageImport.reset()
          packageTransfers.reset()
          configurationBackup.reset()
          webService.reset()
          imageImport.reset()
          imageTransfers.reset()
          linuxVm.reset()
          rescue.reset()
        } else {
          vmActions.pause()
          usbActions.pause()
          diskActions.pause()
          usbRules.pause()
          networkEditor.pause()
          networkRuntime.pause()
          networkDeletion.pause()
          terminal.pause()
          graphics.pause()
          hostOverview.pause()
          hugepages.pause()
          hugepageProcesses.pause()
          hostPreferences.pause()
          usbAcm.pause()
          diskDefaults.pause()
          agent.pause()
          packageExport.pause()
          packageImport.pause()
          packageTransfers.pause()
          configurationBackup.pause()
          webService.pause()
          imageImport.pause()
          imageTransfers.pause()
          linuxVm.pause()
          rescue.pause()
        }
        positions.clear()
        if (status === 'authenticated') void inventory.reload()
      },
      { flush: 'sync' },
    )
    const resume = () => {
      if (document.visibilityState === 'visible') void session.restore()
    }
    const suspend = () => session.suspend()
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) resume()
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pagehide', suspend)
    window.addEventListener('pageshow', pageshow)
    app.onUnmount(() => {
      stopSession()
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pagehide', suspend)
      window.removeEventListener('pageshow', pageshow)
      session.dispose()
    })
  }
  app.use(router)
  app.onUnmount(inventory.dispose)
  app.mount('#app')
  if (session) void session.restore()
  else void inventory.reload()
  return app
}
