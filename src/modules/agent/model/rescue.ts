import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import { createOperations } from '../../tasks'
import { createVmTerminal, type VmTerminalGateway } from '../../terminal'
import type { AgentRescueGateway, RescueSession } from '../api/rescue'
export type { RescueSession } from '../api/rescue'

export function createAgentRescue(
  gateway?: AgentRescueGateway,
  terminalGateway?: VmTerminalGateway,
  newId = requestId,
) {
  const items = shallowRef<RescueSession[]>([]),
    problem = shallowRef<ApiProblem | null>(null)
  const loading = ref(false),
    observed = ref(false)
  const terminal = createVmTerminal(terminalGateway)
  let generation = 0,
    identity: string | null = null,
    read: AbortController | undefined
  const supported = computed(() => !!gateway?.supported())
  async function readList() {
    if (!gateway || !supported.value || loading.value) return false
    const controller = new AbortController(),
      epoch = generation
    read = controller
    loading.value = true
    problem.value = null
    try {
      const value = await gateway.list(controller.signal)
      if (controller.signal.aborted || epoch !== generation) return false
      items.value = value
      observed.value = true
      const selected = value.find((row) => row.id === terminal.target.value)
      if (!selected || selected.closing || selected.expired || selected.remainingMs === 0)
        terminal.disconnect()
      return true
    } catch (cause) {
      if (epoch === generation && !controller.signal.aborted)
        problem.value = describeApiError(cause)
      return false
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  const operations = createOperations(gateway, readList)
  const pending = computed(() =>
    Object.values(operations.entries.value).some((row) => row.state !== 'done'),
  )
  function canClose(id: string) {
    // A closing record may remain after failed cleanup. Another explicit review
    // may retry it, but an unknown local close must only query its original ID.
    return (
      supported.value &&
      observed.value &&
      !problem.value &&
      operations.allowed(id) &&
      !!items.value.find((row) => row.id === id)
    )
  }
  async function close(id: string) {
    if (!canClose(id)) return
    if (terminal.target.value === id) terminal.disconnect()
    await operations.submit(id, { requestId: newId(), sessionId: id })
  }
  async function refresh() {
    await operations.reconcile()
    return readList()
  }
  function pause() {
    generation++
    read?.abort()
    loading.value = false
    terminal.pause()
    operations.pause()
  }
  function reset() {
    pause()
    items.value = []
    problem.value = null
    observed.value = false
    identity = null
    terminal.reset()
    operations.reset()
  }
  return {
    supported,
    terminal,
    pending,
    items: readonly(items),
    loading: readonly(loading),
    observed: readonly(observed),
    problem: readonly(problem),
    entries: operations.entries,
    checking: operations.checking,
    canClose,
    close,
    refresh,
    readList,
    reconcile: operations.reconcile,
    pause,
    reset,
    bind(value: string) {
      if (identity !== value) reset()
      identity = value
      terminal.bind(value)
      operations.bind(value)
    },
    dispose() {
      reset()
      terminal.dispose()
      operations.dispose()
    },
  }
}
export type AgentRescue = ReturnType<typeof createAgentRescue>
export const agentRescueKey: InjectionKey<AgentRescue> = Symbol('agent-rescue')
export function useAgentRescue() {
  const value = inject(agentRescueKey)
  if (!value) throw new Error('Agent rescue is not provided')
  return value
}
