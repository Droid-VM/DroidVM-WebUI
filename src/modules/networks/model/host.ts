import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type { HostNetworkGateway, HostNetworkObservation } from '../api/host'

export function createHostNetwork(gateway?: HostNetworkGateway) {
  const data = shallowRef<HostNetworkObservation | null>(null)
  const loading = ref(false)
  const problem = shallowRef<ApiProblem | null>(null)
  const supported = computed(() => !!gateway?.supported())
  let request: AbortController | null = null
  let pending: Promise<boolean> | null = null
  function reset() {
    request?.abort()
    request = null
    pending = null
    data.value = null
    loading.value = false
    problem.value = null
  }
  function refresh(): Promise<boolean> {
    if (!supported.value) {
      reset()
      return Promise.resolve(false)
    }
    if (pending) return pending
    const current = new AbortController()
    request = current
    loading.value = true
    problem.value = null
    pending = (async () => {
      try {
        const result = await gateway!.read(current.signal)
        if (current.signal.aborted || request !== current) return false
        data.value = result
        return true
      } catch (cause) {
        if (current.signal.aborted || request !== current) return false
        data.value = null
        problem.value = describeApiError(cause)
        return false
      } finally {
        if (request === current) {
          pending = null
          loading.value = false
        }
      }
    })()
    return pending
  }
  return {
    data: readonly(data),
    loading: readonly(loading),
    problem: readonly(problem),
    supported,
    refresh,
    ensure: () => (data.value ? Promise.resolve(true) : refresh()),
    reset,
  }
}
export type HostNetwork = ReturnType<typeof createHostNetwork>
export const hostNetworkKey: InjectionKey<HostNetwork> = Symbol('host-network')
export function useHostNetwork() {
  const state = inject(hostNetworkKey)
  if (!state) throw new Error('Host network is not provided')
  return state
}
