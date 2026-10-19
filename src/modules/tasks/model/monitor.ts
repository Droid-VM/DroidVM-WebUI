import { computed, inject, readonly, ref, type InjectionKey } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type { MessageKey } from '../../../shared/i18n'
import type { Task, TaskGateway } from '../api/gateway'

export const taskStateKeys: Record<Task['state'], MessageKey> = {
  queued: 'taskQueued',
  running: 'taskRunning',
  cancelling: 'taskCancelling',
  succeeded: 'taskSucceeded',
  failed: 'taskFailed',
  cancelled: 'taskCancelled',
}
export function taskPercent(task: Pick<Task, 'total' | 'completed'>): number | null {
  if (task.total === null || BigInt(task.total) === 0n) return null
  // Preserve uint64 counters; only the bounded percentage becomes a JS number.
  return Number((BigInt(task.completed) * 10000n) / BigInt(task.total)) / 100
}
const terminal = (task: Task) => ['succeeded', 'failed', 'cancelled'].includes(task.state)

export function createTaskMonitor(gateway?: TaskGateway) {
  const items = ref<Task[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const problem = ref<ApiProblem | null>(null)
  const cancelProblem = ref<ApiProblem | null>(null)
  const pendingId = ref<string | null>(null)
  const uncertainId = ref<string | null>(null)
  let generation = 0,
    disposed = false
  let read: AbortController | undefined, write: AbortController | undefined
  async function reload() {
    if (disposed || pendingId.value || !gateway?.supported()) return
    read?.abort()
    const controller = new AbortController(),
      epoch = generation
    read = controller
    status.value = 'loading'
    problem.value = null
    try {
      const snapshot = await gateway.list(controller.signal)
      if (disposed || controller.signal.aborted || epoch !== generation) return
      items.value = snapshot.items.sort((a, b) => {
        const left = BigInt(a.createdMs),
          right = BigInt(b.createdMs)
        return left === right ? a.id.localeCompare(b.id) : left > right ? -1 : 1
      })
      status.value = 'ready'
      const uncertain = items.value.find((task) => task.id === uncertainId.value)
      // Missing/expired or still-running records do not prove a lost request
      // was rejected. Keep the write locked until cancellation/termination is seen.
      if (uncertain && (terminal(uncertain) || uncertain.state === 'cancelling'))
        uncertainId.value = null
    } catch (cause) {
      if (disposed || controller.signal.aborted || epoch !== generation) return
      status.value = 'error'
      items.value = []
      problem.value = describeApiError(cause)
    } finally {
      if (read === controller) read = undefined
    }
  }
  async function cancel(id: string) {
    const task = items.value.find((item) => item.id === id)
    if (
      disposed ||
      !gateway?.canCancel() ||
      status.value !== 'ready' ||
      pendingId.value ||
      uncertainId.value ||
      !task?.cancellable
    )
      return
    const controller = new AbortController(),
      epoch = generation
    write = controller
    pendingId.value = id
    cancelProblem.value = null
    // Fence off a read which started before cancellation was admitted.
    read?.abort()
    try {
      const result = await gateway.cancel(id, controller.signal)
      if (disposed || epoch !== generation) return
      items.value = items.value.map((item) => (item.id === id ? result : item))
    } catch (cause) {
      if (disposed || epoch !== generation) return
      cancelProblem.value = describeApiError(cause)
      const rejected =
        cause instanceof ApiError &&
        [
          'conflict',
          'unauthenticated',
          'permission-denied',
          'unsupported',
          'context-changed',
        ].includes(cause.code)
      if (!rejected) uncertainId.value = id
      status.value = 'idle' // A new observation is required even after explicit rejection.
    } finally {
      if (epoch === generation) {
        pendingId.value = null
        write = undefined
      }
    }
  }
  function reset() {
    generation++
    read?.abort()
    write?.abort()
    read = undefined
    write = undefined
    items.value = []
    status.value = 'idle'
    problem.value = null
    cancelProblem.value = null
    pendingId.value = null
    uncertainId.value = null
  }
  return {
    items: readonly(items),
    status: readonly(status),
    problem: readonly(problem),
    cancelProblem: readonly(cancelProblem),
    pendingId: readonly(pendingId),
    uncertainId: readonly(uncertainId),
    supported: computed(() => !!gateway?.supported()),
    canCancel: computed(() => !!gateway?.canCancel()),
    reload,
    cancel,
    reset,
    dispose() {
      disposed = true
      reset()
    },
  }
}
export type TaskMonitor = ReturnType<typeof createTaskMonitor>
export const taskMonitorKey: InjectionKey<TaskMonitor> = Symbol('task-monitor')
export function useTaskMonitor(): TaskMonitor {
  const monitor = inject(taskMonitorKey)
  if (!monitor) throw new Error('Task monitor is not provided')
  return monitor
}
