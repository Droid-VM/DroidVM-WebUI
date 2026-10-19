import { computed, readonly, shallowRef } from 'vue'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type { Task } from '../../tasks'

export interface ResizeGrowTarget {
  diskId: string
  revision: string
  vmRevision: string
  size: string
}
export interface ResizeGrowContinuation {
  available(): boolean
  start(
    target: ResizeGrowTarget,
    signal: AbortSignal,
    submitted: (requestId: string) => void,
  ): Promise<void>
}
interface Sequence {
  resizeRequestId: string
  target: ResizeGrowTarget
  state: 'waiting' | 'checking' | 'submitted' | 'stopped'
  growRequestId: string | null
  problem: ApiProblem | null
}

// The second write is authorized by the resize review, but only while its exact
// observation and uninterrupted continuation remain valid. No write is replayed.
export function createResizeGrow(continuation?: ResizeGrowContinuation) {
  const sequence = shallowRef<Sequence | null>(null)
  let read: AbortController | undefined
  const pending = computed(() => ['waiting', 'checking'].includes(sequence.value?.state ?? ''))
  function stop() {
    read?.abort()
    if (pending.value) sequence.value = { ...sequence.value!, state: 'stopped' }
  }
  function begin(resizeRequestId: string, target: ResizeGrowTarget) {
    stop()
    sequence.value = {
      resizeRequestId,
      target,
      state: 'waiting',
      growRequestId: null,
      problem: null,
    }
  }
  async function advance(
    entry:
      | {
          request: { requestId: string }
          state: string
          task: Task | null
          problem: ApiProblem | null
        }
      | undefined,
  ) {
    const current = sequence.value
    if (
      !current ||
      current.state !== 'waiting' ||
      entry?.request.requestId !== current.resizeRequestId
    )
      return
    if (
      entry.state === 'unknown' ||
      entry.problem ||
      (entry.state === 'done' && entry.task?.state !== 'succeeded')
    ) {
      stop()
      return
    }
    if (entry.state !== 'done' || entry.task?.state !== 'succeeded') return
    if (!continuation?.available()) {
      stop()
      return
    }
    const controller = new AbortController()
    read = controller
    sequence.value = { ...current, state: 'checking' }
    try {
      await continuation.start(current.target, controller.signal, (requestId) => {
        if (
          !controller.signal.aborted &&
          sequence.value?.resizeRequestId === current.resizeRequestId
        )
          sequence.value = { ...sequence.value, state: 'submitted', growRequestId: requestId }
      })
      if (!controller.signal.aborted && sequence.value?.state === 'checking') stop()
    } catch (cause) {
      if (!controller.signal.aborted && sequence.value?.state === 'checking')
        sequence.value = { ...sequence.value, state: 'stopped', problem: describeApiError(cause) }
    }
  }
  return {
    sequence: readonly(sequence),
    pending,
    available: computed(() => !!continuation?.available()),
    begin,
    advance,
    stop,
    reset() {
      stop()
      sequence.value = null
    },
  }
}
