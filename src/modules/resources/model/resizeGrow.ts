import { computed, readonly, shallowRef } from 'vue'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type { Task } from '../../tasks'
import {
  createOperationJournal,
  JournalError,
  type RecoveryProblem,
} from '../../../shared/model/operationJournal'

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
interface TrackedSequence {
  resizeRequestId: string
  target: ResizeGrowTarget
  growRequestId: string | null
}
function validSequence(value: unknown): value is TrackedSequence {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).sort().join(',') !== 'growRequestId,resizeRequestId,target'
  )
    return false
  const row = value as TrackedSequence
  const id = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
  return (
    id(row.resizeRequestId) &&
    (row.growRequestId === null || id(row.growRequestId)) &&
    !!row.target &&
    Object.keys(row.target).sort().join(',') === 'diskId,revision,size,vmRevision' &&
    id(row.target.diskId) &&
    typeof row.target.revision === 'string' &&
    row.target.revision.length > 0 &&
    row.target.revision.length <= 256 &&
    typeof row.target.vmRevision === 'string' &&
    row.target.vmRevision.length > 0 &&
    row.target.vmRevision.length <= 256 &&
    typeof row.target.size === 'string' &&
    /^[1-9][0-9]{0,18}$/.test(row.target.size) &&
    BigInt(row.target.size) <= 9223372036854775807n
  )
}

// The second write is authorized by the resize review, but only while its exact
// observation and uninterrupted continuation remain valid. No write is replayed.
export function createResizeGrow(continuation?: ResizeGrowContinuation, storage?: Storage) {
  const sequence = shallowRef<Sequence | null>(null)
  const recoveryProblem = shallowRef<RecoveryProblem | null>(null)
  const journal = createOperationJournal<TrackedSequence>({
    namespace: 'resize-grow',
    durable: true,
    valid: validSequence,
    key: () => 'sequence',
    storage,
  })
  let identity: string | null = null
  function persist() {
    if (!identity) return
    const current = sequence.value
    try {
      journal.save(
        identity,
        current
          ? [
              {
                key: 'sequence',
                request: {
                  resizeRequestId: current.resizeRequestId,
                  target: current.target,
                  growRequestId: current.growRequestId,
                },
              },
            ]
          : [],
      )
    } catch (cause) {
      recoveryProblem.value = cause instanceof JournalError ? cause.problem : 'invalid'
      throw cause
    }
  }
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
    try {
      persist()
    } catch {
      sequence.value = null
      return false
    }
    return true
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
        ) {
          sequence.value = { ...sequence.value, state: 'submitted', growRequestId: requestId }
          persist()
        }
      })
      if (!controller.signal.aborted && sequence.value?.state === 'checking') stop()
    } catch (cause) {
      if (!controller.signal.aborted && sequence.value?.state === 'checking')
        sequence.value = { ...sequence.value, state: 'stopped', problem: describeApiError(cause) }
    }
  }
  return {
    sequence: readonly(sequence),
    recoveryProblem: readonly(recoveryProblem),
    pending,
    available: computed(() => !!continuation?.available()),
    begin,
    advance,
    stop,
    async resume(entry: Parameters<typeof advance>[0]) {
      const current = sequence.value
      if (
        !current ||
        current.state !== 'stopped' ||
        current.growRequestId ||
        recoveryProblem.value ||
        entry?.request.requestId !== current.resizeRequestId ||
        entry.state !== 'done' ||
        entry.task?.state !== 'succeeded'
      )
        return
      sequence.value = { ...current, state: 'waiting', problem: null }
      await advance(entry)
    },
    bind(value: string) {
      if (identity === value) return
      stop()
      sequence.value = null
      identity = value
      recoveryProblem.value = null
      try {
        const saved = journal.load(value)[0]?.request
        if (saved)
          sequence.value = {
            ...saved,
            state: saved.growRequestId ? 'submitted' : 'stopped',
            problem: null,
          }
      } catch (cause) {
        recoveryProblem.value = cause instanceof JournalError ? cause.problem : 'invalid'
      }
    },
    reset(preserveTracking = false) {
      stop()
      sequence.value = null
      if (preserveTracking) identity = null
      else
        try {
          persist()
        } catch {
          /* A failed journal prevents a new continuation. */
        }
    },
    dispose() {
      stop()
      sequence.value = null
      identity = null
    },
  }
}
