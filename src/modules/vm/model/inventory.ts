import { computed, inject, readonly, ref, type InjectionKey } from 'vue'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type { MessageKey } from '../../../shared/i18n'
import { parseSnapshot, type Vm, type VmGateway } from '../api/gateway'

export type VmFilter = 'all' | Vm['state']
export const stateLabelKeys: Record<Vm['state'], MessageKey> = {
  STOPPED: 'stateStopped',
  STARTING: 'stateStarting',
  RUNNING: 'stateRunning',
  SUSPENDED: 'stateSuspended',
  STOPPING: 'stateStopping',
  REBOOTING: 'stateRebooting',
}

export function createInventory(gateway: VmGateway) {
  const items = ref<Vm[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const problem = ref<ApiProblem | null>(null)
  const query = ref('')
  const filter = ref<VmFilter>('all')
  let request: AbortController | undefined
  let disposed = false

  async function read(quiet = false) {
    if (disposed) return false
    request?.abort()
    const current = new AbortController()
    request = current
    if (!quiet || status.value !== 'ready') status.value = 'loading'
    problem.value = null
    try {
      const snapshot = parseSnapshot(await gateway.list(current.signal))
      if (current.signal.aborted || disposed) return false
      items.value = snapshot.items
      status.value = 'ready'
      return true
    } catch (cause) {
      if (current.signal.aborted || disposed) return false
      items.value = []
      status.value = 'error'
      problem.value = describeApiError(cause)
      return false
    }
  }

  function reset() {
    request?.abort()
    items.value = []
    problem.value = null
    status.value = 'idle'
    query.value = ''
    filter.value = 'all'
  }
  function dispose() {
    disposed = true
    reset()
  }
  const visible = computed(() =>
    items.value.filter(
      (vm) =>
        (filter.value === 'all' || vm.state === filter.value) &&
        vm.name.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()),
    ),
  )
  return {
    items: readonly(items),
    status: readonly(status),
    errorKey: computed(() => problem.value?.descriptionKey ?? ''),
    problem: readonly(problem),
    mode: gateway.mode,
    query,
    filter,
    visible,
    running: computed(() => items.value.filter((vm) => vm.state === 'RUNNING').length),
    reload: () => read(),
    refresh: () => read(true),
    reset,
    dispose,
  }
}

export type Inventory = ReturnType<typeof createInventory>
export const inventoryKey: InjectionKey<Inventory> = Symbol('vm-inventory')
export function useInventory(): Inventory {
  const inventory = inject(inventoryKey)
  if (!inventory) throw new Error('VM inventory is not provided')
  return inventory
}
