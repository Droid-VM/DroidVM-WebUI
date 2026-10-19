import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { ReadClient } from '../../../shared/api/readClient'
import type { ResourceGateway, ResourceKind } from './gateway'

interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  administrator: boolean
}
const diskContract = compileContract<components['schemas']['DiskCatalog']>('DiskCatalog')
const diskDetailContract = compileContract<components['schemas']['DiskDetail']>('DiskDetail')
const networkContract = compileContract<components['schemas']['NetworkCatalog']>('NetworkCatalog')
const audioContract = compileContract<components['schemas']['AudioCatalog']>('AudioCatalog')
const usbContract = compileContract<components['schemas']['UsbCatalog']>('UsbCatalog')
const cpuContract = compileContract<components['schemas']['CpuCatalog']>('CpuCatalog')
const hostContract =
  compileContract<components['schemas']['HostDeviceCatalog']>('HostDeviceCatalog')
const capabilities = {
  disk: 'disks.list.v1',
  diskDetail: 'disks.inspect.v1',
  network: 'networks.list.v1',
  audio: 'host.audio.v1',
  usb: 'usb.list.v1',
  cpu: 'host.cpu.v1',
  host: 'host.devices.v1',
}
export function createResourceGateway(
  client: ReadClient,
  access: () => Access | null,
): ResourceGateway {
  const supported = (kind: ResourceKind) => {
    const value = access()
    return !!value?.administrator && value.capabilities.includes(capabilities[kind])
  }
  function expected(kind: ResourceKind) {
    const value = access()
    if (!value) throw new ApiError('unauthenticated', 'Session required')
    if (!supported(kind)) throw new ApiError('unsupported', 'Resource catalogue unavailable')
    return value.context
  }
  function check(
    value: { context: Access['context']; items?: { id: string | number }[] },
    scope: Access['context'],
  ) {
    if (
      value.context.daemonEpoch !== scope.daemonEpoch ||
      value.context.sessionId !== scope.sessionId
    )
      throw new ApiError('context-changed', 'Resource identity changed')
    if (value.items && new Set(value.items.map((row) => row.id)).size !== value.items.length)
      throw new ApiError('invalid-response', 'Duplicate resource identity')
  }
  async function diskBaseline(signal: AbortSignal) {
    const scope = expected('disk'),
      value = await client.getJson('/api/v1/disks', signal)
    if (!diskContract(value)) throw new ApiError('invalid-response', 'Invalid disk catalogue')
    check(value, scope)
    return value
  }
  return {
    supported,
    diskBaseline,
    async diskDetail(id, signal) {
      const scope = expected('diskDetail')
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
        throw new ApiError('invalid-response', 'Invalid disk identity')
      const value = await client.getJson(`/api/v1/disks/${id}`, signal)
      if (!diskDetailContract(value)) throw new ApiError('invalid-response', 'Invalid disk detail')
      check(value, scope)
      const inspected = value.inspection
      if (
        value.disk.id !== id ||
        value.chain[0]?.id !== id ||
        new Set(value.chain.map((row) => row.id)).size !== value.chain.length ||
        new Set(value.children.map((row) => row.id)).size !== value.children.length ||
        value.children.some((row) => row.parentId !== id) ||
        value.chain.some(
          (row, index) => index > 0 && value.chain[index - 1]?.parentId !== row.id,
        ) ||
        (value.chainComplete && value.chain.at(-1)?.parentId !== null) ||
        new Set(value.attachments.map((row) => `${row.vmId}:${row.slot}`)).size !==
          value.attachments.length ||
        (inspected.state === 'ready'
          ? inspected.format === null || inspected.virtualBytes === null
          : Object.entries(inspected).some(([key, value]) => key !== 'state' && value !== null)) ||
        [inspected.virtualBytes, inspected.allocatedBytes, inspected.clusterBytes].some(
          (count) => count !== null && BigInt(count) > 18446744073709551615n,
        )
      )
        throw new ApiError('invalid-response', 'Inconsistent disk detail')
      return value
    },
    async hostDevices(signal) {
      const scope = expected('host'),
        value = await client.getJson('/api/v1/host/devices', signal)
      if (!hostContract(value))
        throw new ApiError('invalid-response', 'Invalid host device observation')
      check(value, scope)
      const blit = value.systemBlit
      if (
        (blit.state === 'known') !== Array.isArray(blit.missingExtensions) ||
        (blit.state === 'known' && blit.checkedAtMs === null)
      )
        throw new ApiError('invalid-response', 'Invalid host graphics state')
      return { devices: value.devices, systemBlit: blit }
    },
    async cpus(signal) {
      const scope = expected('cpu'),
        value = await client.getJson('/api/v1/host/cpus', signal)
      if (!cpuContract(value)) throw new ApiError('invalid-response', 'Invalid CPU catalogue')
      check(value, scope)
      return value.items.sort((a, b) => a.id - b.id)
    },
    async disks(signal) {
      return (await diskBaseline(signal)).items
    },
    async networks(signal) {
      const scope = expected('network'),
        value = await client.getJson('/api/v1/networks', signal)
      if (!networkContract(value))
        throw new ApiError('invalid-response', 'Invalid network catalogue')
      check(value, scope)
      return value.items
    },
    async audio(signal) {
      const scope = expected('audio'),
        value = await client.getJson('/api/v1/host/audio', signal)
      if (!audioContract(value)) throw new ApiError('invalid-response', 'Invalid audio catalogue')
      check(value, scope)
      if (!value.available) throw new ApiError('unavailable', 'Host audio unavailable')
      return value.items
    },
    async usb(signal) {
      const scope = expected('usb'),
        value = await client.getJson('/api/v1/usb', signal)
      if (!usbContract(value)) throw new ApiError('invalid-response', 'Invalid USB catalogue')
      check(value, scope)
      if (!value.available) throw new ApiError('unavailable', 'Host USB unavailable')
      const targets = value.targets ?? []
      if (new Set(targets.map((target) => target.vmId)).size !== targets.length)
        throw new ApiError('invalid-response', 'Duplicate USB target identity')
      return { items: value.items, targets }
    },
  }
}
