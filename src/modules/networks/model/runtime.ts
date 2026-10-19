import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { createOperations } from '../../tasks'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import type { NetworkDetail, NetworkOperation, NetworkRuntimeGateway } from '../api/runtime'

export function createNetworkRuntime(gateway?: NetworkRuntimeGateway, newId = requestId) {
  const id = ref<string | null>(null),
    detail = shallowRef<NetworkDetail | null>(null)
  const loading = ref(false),
    problem = shallowRef<ApiProblem | null>(null)
  const confirmation = shallowRef<{ request: NetworkOperation; name: string } | null>(null)
  let read: AbortController | undefined,
    identity: string | null = null
  const verificationReads = new Set<AbortController>()
  let generation = 0
  const operations = createOperations(gateway, verifyPending, gateway?.tracking)
  const supported = computed(() => !!gateway?.inspectSupported())
  const entry = computed(() => (id.value ? (operations.entries.value[id.value] ?? null) : null))
  const pending = computed(() =>
    Object.values(operations.entries.value).filter((item) => item.state !== 'done'),
  )
  async function verifyPending() {
    if (!gateway?.inspectSupported()) return false
    const epoch = generation
    // The generic operation owner has no resource argument in its refresh
    // callback. Verify every unresolved resource, never just the open dialog.
    const ids = new Set(pending.value.map((item) => item.request.networkId))
    if (!ids.size) return false
    const controller = new AbortController()
    verificationReads.add(controller)
    try {
      for (const networkId of ids) {
        const value = await gateway.read(networkId, controller.signal)
        if (
          controller.signal.aborted ||
          epoch !== generation ||
          value.network.id !== networkId ||
          !['observed', 'inactive'].includes(value.liveState)
        )
          return false
      }
      return id.value ? await refresh() : true
    } catch {
      return false
    } finally {
      verificationReads.delete(controller)
    }
  }
  function stopVerification() {
    generation++
    for (const controller of verificationReads) controller.abort()
    verificationReads.clear()
  }
  async function refresh() {
    if (!id.value || !gateway || !supported.value) return false
    read?.abort()
    const controller = new AbortController()
    read = controller
    loading.value = true
    problem.value = null
    try {
      const value = await gateway.read(id.value, controller.signal)
      if (controller.signal.aborted) return false
      detail.value = value
      return true
    } catch (cause) {
      if (!controller.signal.aborted) {
        detail.value = null
        problem.value = describeApiError(cause)
      }
      return false
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  }
  function allowed(action: 'start' | 'stop') {
    const value = detail.value
    return (
      !!value &&
      !loading.value &&
      operations.allowed(value.network.id) &&
      !confirmation.value &&
      value.liveState !== 'changed' &&
      (action === 'start'
        ? value.runtime.state === 'STOPPED'
        : ['RUNNING', 'FAILED', 'RECOVERING'].includes(value.runtime.state))
    )
  }
  function prepare(action: 'start' | 'stop') {
    const value = detail.value
    if (!value || !allowed(action)) return
    confirmation.value = {
      name: value.network.name ?? value.network.id,
      request: {
        requestId: newId(),
        networkId: value.network.id,
        action,
        expected: {
          generation: value.runtime.generation,
          state: value.runtime.state,
          configurationRevision: value.configurationRevision,
        },
      },
    }
  }
  async function submit() {
    const value = confirmation.value
    if (!value) return
    confirmation.value = null
    await operations.submit(value.request.networkId, value.request)
  }
  function close() {
    read?.abort()
    read = undefined
    id.value = null
    detail.value = null
    loading.value = false
    problem.value = null
    confirmation.value = null
  }
  return {
    supported,
    id: readonly(id),
    detail: readonly(detail),
    loading: readonly(loading),
    problem: readonly(problem),
    confirmation: readonly(confirmation),
    entry,
    pending,
    supportedActions: operations.supported,
    recoveryProblem: operations.recoveryProblem,
    clearTracking: operations.clearTracking,
    checking: operations.checking,
    reconcile: operations.reconcile,
    allowed,
    prepare,
    submit,
    cancel: () => {
      confirmation.value = null
    },
    refresh,
    close,
    open(value: string) {
      close()
      id.value = value
      return refresh()
    },
    bind(value: string) {
      if (identity !== value) {
        stopVerification()
        close()
      }
      identity = value
      operations.bind(value)
    },
    pause() {
      stopVerification()
      read?.abort()
      loading.value = false
      confirmation.value = null
      operations.pause()
    },
    reset() {
      stopVerification()
      close()
      identity = null
      operations.reset()
    },
    dispose() {
      stopVerification()
      close()
      operations.dispose()
    },
  }
}
export type NetworkRuntime = ReturnType<typeof createNetworkRuntime>
export const networkRuntimeKey: InjectionKey<NetworkRuntime> = Symbol('network-runtime')
export function useNetworkRuntime() {
  const model = inject(networkRuntimeKey)
  if (!model) throw new Error('Network runtime is not provided')
  return model
}
