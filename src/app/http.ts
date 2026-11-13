import { createSession, createSessionGateway } from '../modules/session'
import {
  createHttpVmGateway,
  createHttpVmActionGateway,
  type VmGateway,
  type VmActionGateway,
} from '../modules/vm'
import { createHttpTaskGateway, type TaskGateway } from '../modules/tasks'
import { createHttpLogGateway, type LogGateway } from '../modules/logs'
import { createEventGateway } from '../modules/events'
import { createVmTerminalGateway, type VmTerminalGateway } from '../modules/terminal'
import { createVmGraphicsGateway, type VmGraphicsGateway } from '../modules/graphics'
import { createHostOverviewGateway, type HostOverviewGateway } from '../modules/host'
import { createHugepageGateway, type HugepageGateway } from '../modules/hugepages'
import { createUsbAcmGateway, type UsbAcmGateway } from '../modules/usbAcm'
import { createAndroidDisplayGateway, type AndroidDisplayGateway } from '../modules/androidDisplay'
import { createDiskDefaultGateway, type DiskDefaultGateway } from '../modules/diskDefaults'
import { createHostPreferenceGateway, type HostPreferenceGateway } from '../modules/hostPreferences'
import {
  createHugepageProcessGateway,
  type HugepageProcessGateway,
} from '../modules/hugepage-processes'
import {
  createAgentGateway,
  type AgentGateway,
  createAgentRescueGateway,
  type AgentRescueGateway,
} from '../modules/agent'
import { createConfigurationGateway, type ConfigurationGateway } from '../modules/configuration'
import { createUsbRulesGateway, type UsbRulesGateway } from '../modules/usbRules'
import {
  createNetworkConfigurationGateway,
  type NetworkConfigurationGateway,
  createNetworkRuntimeGateway,
  type NetworkRuntimeGateway,
  createHostNetworkGateway,
  type HostNetworkGateway,
  createNetworkDeletionGateway,
  type NetworkDeletionGateway,
  createConfigurationRecoveryGateway,
  type ConfigurationRecoveryGateway,
} from '../modules/networks'
import {
  createResourceGateway,
  type ResourceGateway,
  createUsbActionGateway,
  type UsbActionGateway,
  createDiskActionGateway,
  type DiskActionGateway,
} from '../modules/resources'
import { ApiError } from '../shared/api/errors'
import { createHttpClient } from '../shared/api/httpClient'
import {
  createPackageExportGateway,
  type PackageExportGateway,
  createPackageImportGateway,
  type PackageImportGateway,
  createPackageTransferGateway,
  type PackageTransferGateway,
} from '../modules/packages'
import { mountApp } from './bootstrap'
import { createWebServiceGateway, type WebServiceGateway } from '../modules/webService'
import { createImageImportGateway, type ImageImportGateway } from '../modules/images'
import { createImageTransferGateway, type ImageTransferGateway } from '../modules/images'
import {
  createConfigurationBackupGateway,
  type ConfigurationBackupGateway,
} from '../modules/backups'

// Composition root coordinates domains; VM/session modules do not import each other.
export function mountHttpApp() {
  const client = createHttpClient()
  const session = createSession(createSessionGateway(client))
  const access = () => {
    const current = session.current.value
    return current
      ? {
          context: { daemonEpoch: current.server.daemonEpoch, sessionId: current.id },
          hostId: current.server.hostId,
          capabilities: current.server.capabilities,
          csrfToken: current.csrfToken,
          manageTasks: current.permissions.manageTasks,
          administrator: current.permissions.administrator,
        }
      : null
  }
  const source = createHttpVmGateway(client, access)
  const taskSource = createHttpTaskGateway(client, access)
  const packageExportSource = createPackageExportGateway(client, access)
  const packageImportSource = createPackageImportGateway(client, access)
  const transferSource = createPackageTransferGateway(client, access)
  const backupSource = createConfigurationBackupGateway(client, access)
  const webServiceSource = createWebServiceGateway(client, access)
  const imageImportSource = createImageImportGateway(client, access)
  const imageTransferSource = createImageTransferGateway(client, access)
  const actionSource = createHttpVmActionGateway(client, access)
  const logSource = createHttpLogGateway(client, access)
  const configSource = createConfigurationGateway(client, access)
  const resourceSource = createResourceGateway(client, access)
  const usbSource = createUsbActionGateway(client, access)
  const rulesSource = createUsbRulesGateway(client, access)
  const diskSource = createDiskActionGateway(client, access)
  const networkSource = createNetworkConfigurationGateway(client, access)
  const networkRuntimeSource = createNetworkRuntimeGateway(client, access)
  const hostNetworkSource = createHostNetworkGateway(client, access)
  const deletionSource = createNetworkDeletionGateway(client, access)
  const recoverySource = createConfigurationRecoveryGateway(client, access)
  const terminalSource = createVmTerminalGateway(client, access)
  const graphicsSource = createVmGraphicsGateway(client, access)
  const hostOverviewSource = createHostOverviewGateway(client, access)
  const hugepageSource = createHugepageGateway(client, access)
  const hugepageProcessSource = createHugepageProcessGateway(client, access)
  const hostPreferenceSource = createHostPreferenceGateway(client, access)
  const usbAcmSource = createUsbAcmGateway(client, access)
  const diskDefaultSource = createDiskDefaultGateway(client, access)
  const androidDisplaySource = createAndroidDisplayGateway(client, access)
  const rescueSource = createAgentRescueGateway(client, access)
  const rescueTerminalSource = createVmTerminalGateway(client, access, { scope: 'agent-rescue' })
  const agentSource = createAgentGateway(client, access, async (id, signal) => ({
    catalog: await resourceSource.diskBaseline(signal),
    detail: await resourceSource.diskDetail(id, signal),
  }))
  async function inSession<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    if (session.status.value !== 'authenticated')
      throw new ApiError('unauthenticated', 'Session required')
    const epoch = session.epoch()
    try {
      return await work()
    } catch (cause) {
      if (!signal.aborted && cause instanceof ApiError && cause.code === 'unauthenticated')
        session.expire(epoch)
      if (!signal.aborted && cause instanceof ApiError && cause.code === 'context-changed')
        session.invalidate(cause, epoch)
      throw cause
    }
  }
  const gateway: VmGateway = {
    mode: 'http',
    list: (signal) => inSession(signal, () => source.list(signal)),
  }
  const tasks: TaskGateway = {
    supported: taskSource.supported,
    canCancel: taskSource.canCancel,
    list: (signal) => inSession(signal, () => taskSource.list(signal)),
    cancel: (id, signal) => inSession(signal, () => taskSource.cancel(id, signal)),
  }
  const actions: VmActionGateway = {
    tracking: actionSource.tracking,
    supported: actionSource.supported,
    submit: (operation, signal) => inSession(signal, () => actionSource.submit(operation, signal)),
    find: (operation, signal) => inSession(signal, () => actionSource.find(operation, signal)),
  }
  const logs: LogGateway = {
    supported: logSource.supported,
    list: (id, signal) => inSession(signal, () => logSource.list(id, signal)),
    read: (request, signal) => inSession(signal, () => logSource.read(request, signal)),
    clearSupported: logSource.clearSupported,
    clear: (request, signal) => inSession(signal, () => logSource.clear!(request, signal)),
  }
  const events = createEventGateway(
    () => {
      const current = access()
      return session.status.value === 'authenticated' &&
        current?.capabilities.includes('events.invalidate.v1')
        ? current
        : null
    },
    () => {
      void session.restore()
    },
  )
  const configuration: ConfigurationGateway = {
    tracking: configSource.tracking,
    supported: configSource.supported,
    defaultsSupported: configSource.defaultsSupported,
    defaults: (signal) => inSession(signal, () => configSource.defaults(signal)),
    read: (signal) => inSession(signal, () => configSource.read(signal)),
    stage: (revision, json, signal) =>
      inSession(signal, () => configSource.stage(revision, json, signal)),
    abort: (uploadId, signal) => inSession(signal, () => configSource.abort(uploadId, signal)),
    commit: (uploadId, requestId, signal) =>
      inSession(signal, () => configSource.commit(uploadId, requestId, signal)),
    status: (requestId, signal) => inSession(signal, () => configSource.status(requestId, signal)),
  }
  const resources: ResourceGateway = {
    supported: resourceSource.supported,
    disks: (signal) => inSession(signal, () => resourceSource.disks(signal)),
    diskBaseline: (signal) => inSession(signal, () => resourceSource.diskBaseline(signal)),
    diskDetail: (id, signal) => inSession(signal, () => resourceSource.diskDetail(id, signal)),
    networks: (signal) => inSession(signal, () => resourceSource.networks(signal)),
    audio: (signal) => inSession(signal, () => resourceSource.audio(signal)),
    cpus: (signal) => inSession(signal, () => resourceSource.cpus(signal)),
    hostDevices: (signal) => inSession(signal, () => resourceSource.hostDevices(signal)),
    usb: (signal) => inSession(signal, () => resourceSource.usb(signal)),
  }
  const usbActions: UsbActionGateway = {
    tracking: usbSource.tracking,
    supported: usbSource.supported,
    submit: (operation, signal) => inSession(signal, () => usbSource.submit(operation, signal)),
    find: (operation, signal) => inSession(signal, () => usbSource.find(operation, signal)),
  }
  const usbRules: UsbRulesGateway = {
    tracking: rulesSource.tracking,
    supported: rulesSource.supported,
    previewSupported: rulesSource.previewSupported,
    preview: (revision, signal) => inSession(signal, () => rulesSource.preview(revision, signal)),
    read: (signal) => inSession(signal, () => rulesSource.read(signal)),
    targets: (signal) => inSession(signal, () => rulesSource.targets(signal)),
    stage: (revision, json, signal) =>
      inSession(signal, () => rulesSource.stage(revision, json, signal)),
    abort: (uploadId, signal) => inSession(signal, () => rulesSource.abort(uploadId, signal)),
    submit: (operation, signal) => inSession(signal, () => rulesSource.submit(operation, signal)),
    find: (operation, signal) => inSession(signal, () => rulesSource.find(operation, signal)),
  }
  const diskActions: DiskActionGateway = {
    tracking: diskSource.tracking,
    cloneDirectorySupported: diskSource.cloneDirectorySupported,
    compressionSupported: diskSource.compressionSupported,
    compression: (id, signal) => inSession(signal, () => diskSource.compression!(id, signal)),
    recovery: diskSource.recovery && {
      tracking: diskSource.recovery.tracking,
      supported: diskSource.recovery.supported,
      status: (signal) => inSession(signal, () => diskSource.recovery!.status(signal)),
      submit: (request, signal) =>
        inSession(signal, () => diskSource.recovery!.submit(request, signal)),
      find: (request, signal) =>
        inSession(signal, () => diskSource.recovery!.find(request, signal)),
    },
    supported: diskSource.supported,
    prepare: (id, action, signal) =>
      inSession(signal, () => diskSource.prepare(id, action, signal)),
    submit: (request, signal) => inSession(signal, () => diskSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => diskSource.find(request, signal)),
  }
  const networkConfiguration: NetworkConfigurationGateway = {
    tracking: networkSource.tracking,
    supported: networkSource.supported,
    read: (signal) => inSession(signal, () => networkSource.read(signal)),
    stage: (json, signal) => inSession(signal, () => networkSource.stage(json, signal)),
    abort: (uploadId, signal) => inSession(signal, () => networkSource.abort(uploadId, signal)),
    submit: (request, signal) => inSession(signal, () => networkSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => networkSource.find(request, signal)),
  }
  const networkRuntime: NetworkRuntimeGateway = {
    tracking: networkRuntimeSource.tracking,
    supported: networkRuntimeSource.supported,
    inspectSupported: networkRuntimeSource.inspectSupported,
    read: (id, signal) => inSession(signal, () => networkRuntimeSource.read(id, signal)),
    submit: (request, signal) =>
      inSession(signal, () => networkRuntimeSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => networkRuntimeSource.find(request, signal)),
  }
  const hostNetwork: HostNetworkGateway = {
    supported: hostNetworkSource.supported,
    read: (signal) => inSession(signal, () => hostNetworkSource.read(signal)),
  }
  const networkDeletion: NetworkDeletionGateway = {
    tracking: deletionSource.tracking,
    supported: deletionSource.supported,
    stage: (json, revision, signal) =>
      inSession(signal, () => deletionSource.stage(json, revision, signal)),
    abort: (uploadId, signal) => inSession(signal, () => deletionSource.abort(uploadId, signal)),
    submit: (request, signal) => inSession(signal, () => deletionSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => deletionSource.find(request, signal)),
  }
  const configurationRecovery: ConfigurationRecoveryGateway = {
    tracking: recoverySource.tracking,
    supported: recoverySource.supported,
    submit: (request, signal) => inSession(signal, () => recoverySource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => recoverySource.find(request, signal)),
  }
  const sessionTerminal = (source: VmTerminalGateway): VmTerminalGateway => ({
    supported: source.supported,
    read: (id, signal) => inSession(signal, () => source.read(id, signal)),
    connect(metadata, stream, cursor, observer) {
      const epoch = session.epoch()
      return source.connect(metadata, stream, cursor, {
        ...observer,
        closed(problem) {
          if (problem.code === 'unauthenticated') session.expire(epoch)
          else if (problem.code === 'context-changed') session.invalidate(problem, epoch)
          observer.closed(problem)
        },
      })
    },
  })
  const terminal = sessionTerminal(terminalSource)
  const rescueTerminal = sessionTerminal(rescueTerminalSource)
  const rescue: AgentRescueGateway = {
    supported: rescueSource.supported,
    list: (signal) => inSession(signal, () => rescueSource.list(signal)),
    submit: (request, signal) => inSession(signal, () => rescueSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => rescueSource.find(request, signal)),
  }
  const agent: AgentGateway = {
    tracking: agentSource.tracking,
    supported: agentSource.supported,
    rescueSupported: agentSource.rescueSupported,
    prepare: (id, signal) => inSession(signal, () => agentSource.prepare(id, signal)),
    submit: (request, signal) => inSession(signal, () => agentSource.submit(request, signal)),
    find: (reference, signal) => inSession(signal, () => agentSource.find(reference, signal)),
    recovery: {
      tracking: agentSource.recovery.tracking,
      supported: agentSource.recovery.supported,
      status: (signal) => inSession(signal, () => agentSource.recovery.status(signal)),
      submit: (request, signal) =>
        inSession(signal, () => agentSource.recovery.submit(request, signal)),
      find: (request, signal) =>
        inSession(signal, () => agentSource.recovery.find(request, signal)),
    },
  }
  const packageExport: PackageExportGateway = {
    tracking: packageExportSource.tracking,
    supported: packageExportSource.supported,
    plan: (id, signal) => inSession(signal, () => packageExportSource.plan(id, signal)),
    submit: (request, signal) =>
      inSession(signal, () => packageExportSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => packageExportSource.find(request, signal)),
  }
  const packageImport: PackageImportGateway = {
    tracking: packageImportSource.tracking,
    supported: packageImportSource.supported,
    submit: (request, signal) =>
      inSession(signal, () => packageImportSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => packageImportSource.find(request, signal)),
    preview: {
      tracking: packageImportSource.preview.tracking,
      supported: packageImportSource.preview.supported,
      submit: (request, signal) =>
        inSession(signal, () => packageImportSource.preview.submit(request, signal)),
      find: (request, signal) =>
        inSession(signal, () => packageImportSource.preview.find(request, signal)),
    },
  }
  const packageTransfers: PackageTransferGateway = {
    tracking: transferSource.tracking,
    downloadTracking: transferSource.downloadTracking,
    supported: transferSource.supported,
    beginUpload: (id, files, signal) =>
      inSession(signal, () => transferSource.beginUpload(id, files, signal)),
    uploadStatus: (id, signal) => inSession(signal, () => transferSource.uploadStatus(id, signal)),
    chunk: (id, index, offset, data, signal) =>
      inSession(signal, () => transferSource.chunk(id, index, offset, data, signal)),
    finish: (id, signal) => inSession(signal, () => transferSource.finish(id, signal)),
    beginDownload: (id, exportId, signal) =>
      inSession(signal, () => transferSource.beginDownload(id, exportId, signal)),
    downloadStatus: (id, signal) =>
      inSession(signal, () => transferSource.downloadStatus(id, signal)),
    remove: (kind, id, signal) => inSession(signal, () => transferSource.remove(kind, id, signal)),
  }
  const configurationBackup: ConfigurationBackupGateway = {
    tracking: backupSource.tracking,
    supported: backupSource.supported,
    stage: (raw, signal) => inSession(signal, () => backupSource.stage(raw, signal)),
    preview: (id, signal) => inSession(signal, () => backupSource.preview(id, signal)),
    abort: (id, signal) => inSession(signal, () => backupSource.abort(id, signal)),
    submit: (request, signal) => inSession(signal, () => backupSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => backupSource.find(request, signal)),
  }
  const webService: WebServiceGateway = {
    supported: webServiceSource.supported,
    read: (signal) => inSession(signal, () => webServiceSource.read(signal)),
    submit: (request, signal) => inSession(signal, () => webServiceSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => webServiceSource.find(request, signal)),
  }
  const imageImport: ImageImportGateway = {
    tracking: imageImportSource.tracking,
    supported: imageImportSource.supported,
    submit: (request, signal) => inSession(signal, () => imageImportSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => imageImportSource.find(request, signal)),
    preview: {
      tracking: imageImportSource.preview.tracking,
      supported: imageImportSource.preview.supported,
      submit: (request, signal) =>
        inSession(signal, () => imageImportSource.preview.submit(request, signal)),
      find: (request, signal) =>
        inSession(signal, () => imageImportSource.preview.find(request, signal)),
    },
  }
  const imageTransfers: ImageTransferGateway = {
    upload: {
      tracking: imageTransferSource.upload.tracking,
      supported: imageTransferSource.upload.supported,
      beginUpload: (id, files, signal) =>
        inSession(signal, () => imageTransferSource.upload.beginUpload(id, files, signal)),
      uploadStatus: (id, signal) =>
        inSession(signal, () => imageTransferSource.upload.uploadStatus(id, signal)),
      chunk: (id, index, offset, data, signal) =>
        inSession(signal, () => imageTransferSource.upload.chunk(id, index, offset, data, signal)),
      finish: (id, signal) =>
        inSession(signal, () => imageTransferSource.upload.finish(id, signal)),
      remove: (kind, id, signal) =>
        inSession(signal, () => imageTransferSource.upload.remove(kind, id, signal)),
    },
    install: {
      tracking: imageTransferSource.install.tracking,
      supported: imageTransferSource.install.supported,
      submit: (request, signal) =>
        inSession(signal, () => imageTransferSource.install.submit(request, signal)),
      find: (request, signal) =>
        inSession(signal, () => imageTransferSource.install.find(request, signal)),
    },
  }
  const graphics: VmGraphicsGateway = {
    supported: graphicsSource.supported,
    read: (id, signal) => inSession(signal, () => graphicsSource.read(id, signal)),
    connect: graphicsSource.connect,
  }
  const hostOverview: HostOverviewGateway = {
    supported: hostOverviewSource.supported,
    read: (signal) => inSession(signal, () => hostOverviewSource.read(signal)),
  }
  const hugepages: HugepageGateway = {
    tracking: hugepageSource.tracking,
    supported: hugepageSource.supported,
    readable: hugepageSource.readable,
    management: hugepageSource.management,
    read: (signal) => inSession(signal, () => hugepageSource.read(signal)),
    submit: (request, signal) => inSession(signal, () => hugepageSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => hugepageSource.find(request, signal)),
  }
  const hugepageProcesses: HugepageProcessGateway = {
    tracking: hugepageProcessSource.tracking,
    supported: hugepageProcessSource.supported,
    readable: hugepageProcessSource.readable,
    read: (source, signal) => inSession(signal, () => hugepageProcessSource.read(source, signal)),
    stack: (expected, signal) =>
      inSession(signal, () => hugepageProcessSource.stack(expected, signal)),
    submit: (request, signal) =>
      inSession(signal, () => hugepageProcessSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => hugepageProcessSource.find(request, signal)),
  }
  const hostPreferences: HostPreferenceGateway = {
    tracking: hostPreferenceSource.tracking,
    supported: hostPreferenceSource.supported,
    readable: hostPreferenceSource.readable,
    read: (signal) => inSession(signal, () => hostPreferenceSource.read(signal)),
    submit: (request, signal) =>
      inSession(signal, () => hostPreferenceSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => hostPreferenceSource.find(request, signal)),
  }
  const usbAcm: UsbAcmGateway = {
    tracking: usbAcmSource.tracking,
    supported: usbAcmSource.supported,
    readable: usbAcmSource.readable,
    read: (signal) => inSession(signal, () => usbAcmSource.read(signal)),
    submit: (request, signal) => inSession(signal, () => usbAcmSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => usbAcmSource.find(request, signal)),
  }
  const androidDisplay: AndroidDisplayGateway = {
    tracking: androidDisplaySource.tracking,
    supported: androidDisplaySource.supported,
    readable: androidDisplaySource.readable,
    read: (signal) => inSession(signal, () => androidDisplaySource.read(signal)),
    submit: (request, signal) =>
      inSession(signal, () => androidDisplaySource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => androidDisplaySource.find(request, signal)),
  }
  const diskDefaults: DiskDefaultGateway = {
    tracking: diskDefaultSource.tracking,
    rememberTracking: diskDefaultSource.rememberTracking,
    supported: diskDefaultSource.supported,
    readable: diskDefaultSource.readable,
    read: (signal) => inSession(signal, () => diskDefaultSource.read(signal)),
    submit: (request, signal) => inSession(signal, () => diskDefaultSource.submit(request, signal)),
    find: (request, signal) => inSession(signal, () => diskDefaultSource.find(request, signal)),
  }
  return mountApp(
    gateway,
    [],
    session,
    tasks,
    actions,
    logs,
    events,
    configuration,
    resources,
    usbActions,
    usbRules,
    diskActions,
    networkConfiguration,
    networkRuntime,
    hostNetwork,
    networkDeletion,
    configurationRecovery,
    terminal,
    agent,
    rescue,
    rescueTerminal,
    packageExport,
    packageImport,
    packageTransfers,
    configurationBackup,
    webService,
    imageImport,
    imageTransfers,
    graphics,
    hostOverview,
    hugepages,
    hugepageProcesses,
    hostPreferences,
    usbAcm,
    diskDefaults,
    androidDisplay,
  )
}
