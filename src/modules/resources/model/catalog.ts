import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type {
  AudioDevice,
  HostCpuCore,
  HostDevices,
  UsbCatalog,
  DiskResource,
  DiskDetail,
  NetworkResource,
  ResourceGateway,
  ResourceKind,
} from '../api/gateway'

function createResourceState<T>(
  empty: () => T,
  supported: () => boolean,
  list: (signal: AbortSignal) => Promise<T>,
) {
  const data = shallowRef<T>(empty())
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const problem = ref<ApiProblem | null>(null)
  let request: AbortController | undefined
  function reset() {
    request?.abort()
    data.value = empty()
    status.value = 'idle'
    problem.value = null
  }
  async function refresh() {
    if (!supported()) {
      reset()
      return false
    }
    request?.abort()
    const current = new AbortController()
    request = current
    if (status.value !== 'ready') status.value = 'loading'
    problem.value = null
    try {
      const result = await list(current.signal)
      if (current.signal.aborted) return false
      data.value = result
      status.value = 'ready'
      return true
    } catch (cause) {
      if (current.signal.aborted) return false
      data.value = empty()
      status.value = 'error'
      problem.value = describeApiError(cause)
      return false
    }
  }
  return {
    data: readonly(data),
    status: readonly(status),
    problem: readonly(problem),
    supported: computed(supported),
    refresh,
    reset,
  }
}
function createList<T>(supported: () => boolean, list: (signal: AbortSignal) => Promise<T[]>) {
  const { data, ...state } = createResourceState<T[]>(() => [], supported, list)
  return { ...state, items: data }
}
export function createResourceCatalog(gateway?: ResourceGateway) {
  const available = (kind: ResourceKind) => () => !!gateway?.supported(kind)
  const disks = createList<DiskResource>(available('disk'), (signal) => gateway!.disks(signal))
  const diskId = ref<string | null>(null)
  const diskDetailState = createResourceState<DiskDetail | null>(
    () => null,
    available('diskDetail'),
    (signal) => (diskId.value ? gateway!.diskDetail(diskId.value, signal) : Promise.resolve(null)),
  )
  const diskDetail = {
    ...diskDetailState,
    id: readonly(diskId),
    open(id: string) {
      diskDetailState.reset()
      diskId.value = id
      return diskDetailState.refresh()
    },
    close() {
      diskDetailState.reset()
      diskId.value = null
    },
  }
  const networks = createList<NetworkResource>(available('network'), (signal) =>
    gateway!.networks(signal),
  )
  const audio = createList<AudioDevice>(available('audio'), (signal) => gateway!.audio(signal))
  const cpus = createList<HostCpuCore>(available('cpu'), (signal) => gateway!.cpus(signal))
  const host = createResourceState<HostDevices | null>(
    () => null,
    available('host'),
    (signal) => gateway!.hostDevices(signal),
  )
  const { data: usbData, ...usbState } = createResourceState<UsbCatalog>(
    () => ({ items: [], targets: [] }),
    available('usb'),
    (signal) => gateway!.usb(signal),
  )
  const usb = {
    ...usbState,
    items: computed(() => usbData.value.items),
    targets: computed(() => usbData.value.targets),
  }
  return {
    disks,
    diskDetail,
    networks,
    audio,
    cpus,
    host,
    usb,
    reset() {
      disks.reset()
      diskDetail.close()
      networks.reset()
      audio.reset()
      cpus.reset()
      host.reset()
      usb.reset()
    },
  }
}
export type ResourceCatalog = ReturnType<typeof createResourceCatalog>
export const resourceCatalogKey: InjectionKey<ResourceCatalog> = Symbol('resource-catalog')
export function useResourceCatalog() {
  const catalog = inject(resourceCatalogKey)
  if (!catalog) throw new Error('Resource catalogue is not provided')
  return catalog
}
