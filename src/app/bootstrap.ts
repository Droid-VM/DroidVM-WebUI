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
import { createHugepages, hugepagesKey, type HugepageGateway } from '../modules/hugepages'
import {
  createDiskDefaults,
  diskDefaultsKey,
  type DiskDefaultGateway,
} from '../modules/diskDefaults'
import { createUsbAcm, usbAcmKey, type UsbAcmGateway } from '../modules/usbAcm'
import {
  createAndroidDisplay,
  androidDisplayKey,
  type AndroidDisplayGateway,
} from '../modules/androidDisplay'
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
  createVmConfigSummaries,
  vmConfigSummariesKey,
  type ConfigurationGateway,
} from '../modules/configuration'
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
import '../shared/styles/colors.css'
import '../shared/styles/tokens.css'
import '../shared/styles/base.css'

// Pages load on demand so no single bundle outgrows the native per-asset limit; the
// landing page stays in the entry bundle for the first paint.
const HomePage = () => import('../pages/HomePage.vue')
const HostPage = () => import('../pages/HostPage.vue')
const HugepagesPage = () => import('../pages/HugepagesPage.vue')
const HugepagesAdvancedPage = () => import('../pages/HugepagesAdvancedPage.vue')
const HugepageProcessesPage = () => import('../pages/HugepageProcessesPage.vue')
const HostPreferencesPage = () => import('../pages/HostPreferencesPage.vue')
const UsbAcmPage = () => import('../pages/UsbAcmPage.vue')
const AndroidDisplayPage = () => import('../pages/AndroidDisplayPage.vue')
const DiskDefaultsPage = () => import('../pages/DiskDefaultsPage.vue')
const VmEditPage = () => import('../pages/VmEditPage.vue')
const UsbRulesPage = () => import('../pages/UsbRulesPage.vue')
const NetworkEditPage = () => import('../pages/NetworkEditPage.vue')
const ResourcesPage = () => import('../pages/ResourcesPage.vue')
const TasksPage = () => import('../pages/TasksPage.vue')
const MorePage = () => import('../pages/MorePage.vue')
const NotFoundPage = () => import('../pages/NotFoundPage.vue')
const AgentRescuePage = () => import('../pages/AgentRescuePage.vue')
const PackageExportPage = () => import('../pages/PackageExportPage.vue')
const PackageImportPage = () => import('../pages/PackageImportPage.vue')
const PackageTransfersPage = () => import('../pages/PackageTransfersPage.vue')
const ConfigurationBackupPage = () => import('../pages/ConfigurationBackupPage.vue')
const WebServicePage = () => import('../pages/WebServicePage.vue')
const ImageImportPage = () => import('../pages/ImageImportPage.vue')

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
  androidDisplayGateway?: AndroidDisplayGateway,
) {
  const inventory = createInventory(gateway)
  const hostOverview = createHostOverview(hostOverviewGateway)
  const hugepages = createHugepages(hugepageGateway)
  const hostPreferences = createHostPreferences(hostPreferenceGateway)
  const usbAcm = createUsbAcm(usbAcmGateway)
  const diskDefaults = createDiskDefaults(diskDefaultGateway)
  const androidDisplay = createAndroidDisplay(androidDisplayGateway)
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
  const vmConfigs = createVmConfigSummaries(configurationGateway)
  const resources = createResourceCatalog(resourceGateway)
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
      { path: '/', redirect: '/home' },
      { path: '/home', component: HomePage, meta: { title: 'navHome' } },
      {
        path: '/vms/new',
        component: VmEditPage,
        meta: { title: 'createVm', create: true, parent: '/vms' },
      },
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
        meta: { title: 'imageImportTitle', parent: '/resources/disk' },
      },
      {
        path: '/settings/service',
        component: WebServicePage,
        meta: { title: 'webServiceTitle', parent: '/more' },
      },
      {
        path: '/settings/vm',
        component: HostPreferencesPage,
        meta: { title: 'hostPreferencesTitle', parent: '/more' },
      },
      {
        path: '/settings/backup',
        component: ConfigurationBackupPage,
        meta: { title: 'backupTitle', parent: '/more' },
      },
      {
        path: '/packages/transfers',
        component: PackageTransfersPage,
        meta: { title: 'transferTitle', parent: '/more' },
      },
      {
        path: '/packages/import',
        component: PackageImportPage,
        meta: { title: 'packageImportTitle', parent: '/more' },
      },
      {
        path: '/packages/export/:id?',
        component: PackageExportPage,
        meta: { title: 'packageExportTitle', parent: '/more' },
      },
      {
        path: '/agent/rescue/:id?',
        component: AgentRescuePage,
        meta: { title: 'agentRescueTitle', parent: '/resources/disk' },
      },
      {
        path: '/resources/network/new',
        component: NetworkEditPage,
        meta: { title: 'networkCreate', create: true, parent: '/resources/network' },
      },
      {
        path: '/resources/network/:id/edit',
        component: NetworkEditPage,
        meta: { title: 'networkEdit', parent: '/resources/network' },
      },
      {
        path: '/resources/usb/rules',
        component: UsbRulesPage,
        meta: { title: 'usbRulesTitle', parent: '/resources/usb' },
      },
      { path: '/more', component: MorePage, meta: { title: 'navSettings' } },
      {
        path: '/settings/usb-acm',
        component: UsbAcmPage,
        meta: { title: 'usbAcmTitle', parent: '/more' },
      },
      {
        path: '/settings/android-display',
        component: AndroidDisplayPage,
        meta: { title: 'androidDisplayTitle', parent: '/more' },
      },
      {
        path: '/settings/disks',
        component: DiskDefaultsPage,
        meta: { title: 'diskDefaultsTitle', parent: '/more' },
      },
      { path: '/host', component: HostPage, meta: { title: 'hostOverviewTitle', parent: '/more' } },
      {
        path: '/hugepages',
        component: HugepagesPage,
        meta: { title: 'hugepagesTitle', parent: '/more' },
      },
      {
        path: '/hugepages/advanced',
        component: HugepagesAdvancedPage,
        meta: { title: 'hugepagesAdvancedTitle', parent: '/hugepages' },
      },
      {
        path: '/hugepages/processes',
        component: HugepageProcessesPage,
        meta: { title: 'hpProcessTitle', parent: '/hugepages' },
      },
      ...extraRoutes,
      { path: '/:pathMatch(.*)*', component: NotFoundPage, meta: { title: 'notFound' } },
    ],
    scrollBehavior(to, from, saved) {
      if (to.path.startsWith('/vms') && from.path.startsWith('/vms')) return false
      return saved ?? positions.get(group(to.path)) ?? { top: 0 }
    },
  })
  // After an app upgrade the open page still references old page bundles, which now 404.
  // Reload once into the target route so the new index.html is used; never loop.
  router.onError((error, to) => {
    if (!/dynamically imported module|Importing a module script failed/i.test(String(error))) return
    try {
      if (sessionStorage.getItem('droidvm.chunkReload') === to.fullPath) return
      sessionStorage.setItem('droidvm.chunkReload', to.fullPath)
    } catch {
      return
    }
    location.hash = to.fullPath
    location.reload()
  })
  router.afterEach(() => {
    try {
      sessionStorage.removeItem('droidvm.chunkReload')
    } catch {
      /* Storage can be unavailable; the guard above then never reloads. */
    }
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
  app.provide(vmConfigSummariesKey, vmConfigs)
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
  app.provide(androidDisplayKey, androidDisplay)
  app.onUnmount(androidDisplay.dispose)
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
      androidDisplay.pending.value ||
      diskDefaults.pending.value ||
      diskDefaults.dirty.value ||
      hugepages.dirty.value ||
      imageImport.pending.value ||
      imageTransfers.pending.value ||
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
  app.onUnmount(() => configuration.reset(true))
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
        configuration.reset(true)
        resources.reset()
        hostNetwork.reset()
        if (status === 'authenticated' && session.current.value) {
          const recoveryIdentity =
            session.current.value.server.hostId ??
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`
          configuration.bind(recoveryIdentity)
          imageTransfers.bind(
            session.current.value.server.daemonEpoch + ':' + session.current.value.id,
            recoveryIdentity,
          )
          imageImport.bind(recoveryIdentity)
          webService.bind(session.current.value.server.daemonEpoch + ':' + session.current.value.id)
          configurationBackup.bind(recoveryIdentity)
          packageTransfers.bind(
            session.current.value.server.daemonEpoch + ':' + session.current.value.id,
          )
          agent.bind(recoveryIdentity)
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
          androidDisplay.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
          diskDefaults.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
          hostOverview.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
          vmActions.bind(`${session.current.value.server.daemonEpoch}:${session.current.value.id}`)
          usbActions.bind(`${session.current.value.server.daemonEpoch}:${session.current.value.id}`)
          diskActions.bind(recoveryIdentity)
          usbRules.bind(recoveryIdentity)
          networkRuntime.bind(
            `${session.current.value.server.daemonEpoch}:${session.current.value.id}`,
          )
          networkEditor.bind(recoveryIdentity)
          networkDeletion.bind(recoveryIdentity)
        } else if (
          status === 'anonymous' ||
          status === 'signing-out' ||
          status === 'authenticating'
        ) {
          vmActions.reset()
          usbActions.reset()
          diskActions.reset(true)
          usbRules.reset(true)
          networkEditor.reset(true)
          networkRuntime.reset()
          networkDeletion.reset(true)
          terminal.reset()
          graphics.reset()
          hostOverview.reset()
          hugepages.reset()
          hugepageProcesses.reset()
          hostPreferences.reset()
          usbAcm.reset()
          androidDisplay.reset()
          diskDefaults.reset()
          hostOverview.pause()
          hugepages.pause()
          hugepageProcesses.pause()
          hostPreferences.pause()
          usbAcm.pause()
          androidDisplay.pause()
          diskDefaults.pause()
          agent.reset(true)
          packageExport.reset()
          packageImport.reset()
          packageTransfers.reset()
          configurationBackup.reset(true)
          webService.reset()
          imageImport.reset(true)
          imageTransfers.reset(true)
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
          androidDisplay.pause()
          diskDefaults.pause()
          agent.pause()
          packageExport.pause()
          packageImport.pause()
          packageTransfers.pause()
          configurationBackup.pause()
          webService.pause()
          imageImport.pause()
          imageTransfers.pause()
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
