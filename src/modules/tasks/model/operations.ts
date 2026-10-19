import { computed, readonly, ref, shallowRef, shallowReactive } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type { Task, OperationGateway } from '../api/gateway'
import {
  createOperationJournal,
  JournalError,
  type OperationTracking,
  type RecoveryProblem,
} from './operationJournal'
interface Pending<R> {
  request: R
  state: 'posting' | 'waiting' | 'unknown' | 'done'
  task: Task | null
  problem: ApiProblem | null
  restored?: boolean
}
export function createOperations<R>(
  gateway: OperationGateway<R> | undefined,
  refresh: () => Promise<boolean>,
  tracking?: OperationTracking<R>,
) {
  const entries = shallowRef<Record<string, Pending<R>>>({})
  const checking = ref(false)
  const recoveryProblem = ref<RecoveryProblem | null>(null)
  const journal = tracking ? createOperationJournal(tracking) : undefined
  const safelyRejected = new WeakSet<Pending<R>>()
  const reads = new Set<AbortController>()
  let reconciliation: Promise<void> | undefined
  let generation = 0,
    disposed = false,
    context: string | null = null
  const supported = computed(() => !disposed && !!gateway?.supported())
  const terminal = (task: Task | null) =>
    !!task && ['succeeded', 'failed', 'cancelled'].includes(task.state)
  const allowed = (key: string) =>
    supported.value &&
    !recoveryProblem.value &&
    (!journal || context !== null) &&
    !['__proto__', 'constructor', 'prototype'].includes(key) &&
    (!entries.value[key] || entries.value[key]?.state === 'done')
  function journalFailed(cause: unknown) {
    recoveryProblem.value = cause instanceof JournalError ? cause.problem : 'invalid'
  }
  function persist(value = entries.value, replace = false) {
    if (!journal || context === null) return
    journal.save(
      context,
      Object.entries(value)
        .filter(([, entry]) => !safelyRejected.has(entry))
        .map(([key, entry]) => ({ key, request: entry.request })),
      replace,
    )
  }
  async function settle(entry: Pending<R>, epoch: number) {
    if (!terminal(entry.task)) return
    const fresh = await refresh()
    if (!disposed && epoch === generation && fresh) {
      entry.state = 'done'
      entry.problem = null
    }
  }
  async function submit(key: string, request: R) {
    if (!allowed(key) || !gateway) return
    let snapshot = request
    if (journal) {
      try {
        snapshot = journal.snapshot(request)
      } catch (cause) {
        journalFailed(cause)
        return
      }
    }
    const entry = shallowReactive<Pending<R>>({
      request: snapshot,
      state: 'posting',
      task: null,
      problem: null,
    })
    const next = { ...entries.value, [key]: entry }
    try {
      persist(next)
    } catch (cause) {
      journalFailed(cause)
      return
    }
    entries.value = next
    const controller = new AbortController(),
      epoch = generation
    reads.add(controller)
    try {
      const task = await gateway.submit(entry.request, controller.signal)
      if (disposed || epoch !== generation) return
      entry.task = task
      entry.state = 'waiting'
      await settle(entry, epoch)
    } catch (cause) {
      if (disposed || epoch !== generation) return
      entry.problem = describeApiError(cause)
      const rejected =
        !entry.task &&
        cause instanceof ApiError &&
        [
          'conflict',
          'unauthenticated',
          'permission-denied',
          'unsupported',
          'context-changed',
        ].includes(cause.code)
      entry.state = 'unknown'
      // An explicit rejection still requires a new read before another action.
      if (rejected && (await refresh()) && epoch === generation) {
        entry.state = 'done'
        safelyRejected.add(entry)
        try {
          persist()
        } catch (failure) {
          journalFailed(failure)
        }
      }
    } finally {
      reads.delete(controller)
    }
  }
  async function reconcile() {
    if (reconciliation) return reconciliation
    const current = reconcilePending()
    reconciliation = current
    try {
      await current
    } finally {
      if (reconciliation === current) reconciliation = undefined
    }
  }
  async function reconcilePending() {
    if (disposed || checking.value || !gateway || !supported.value) return
    const epoch = generation
    checking.value = true
    try {
      for (const entry of Object.values(entries.value)) {
        if (entry.state === 'posting' || entry.state === 'done' || epoch !== generation) continue
        const controller = new AbortController()
        reads.add(controller)
        try {
          const task = await gateway.find(entry.request, controller.signal)
          if (disposed || epoch !== generation) return
          // Missing/expired records never unlock an unknown write.
          if (task) {
            if (
              entry.task &&
              (entry.task.id !== task.id || BigInt(task.revision) < BigInt(entry.task.revision))
            )
              throw new ApiError('invalid-response', 'Operation task identity or revision changed')
            entry.task = task
            entry.state = 'waiting'
            entry.problem = null
            await settle(entry, epoch)
          } else entry.state = 'unknown'
        } catch (cause) {
          if (epoch !== generation) return
          entry.problem = describeApiError(cause)
        } finally {
          reads.delete(controller)
        }
      }
    } finally {
      if (epoch === generation) checking.value = false
    }
  }
  function pause() {
    generation++
    reconciliation = undefined
    for (const request of reads) request.abort()
    reads.clear()
    checking.value = false
    for (const entry of Object.values(entries.value))
      if (entry.state === 'posting') entry.state = 'unknown'
  }
  function reset(preserveTracking = false) {
    pause()
    entries.value = {}
    try {
      if (!preserveTracking) journal?.clear(null, true)
      recoveryProblem.value = null
    } catch (cause) {
      journalFailed(cause)
    }
    context = null
  }
  function clearTracking() {
    if (!journal || !recoveryProblem.value) return
    try {
      // Only an explicitly confirmed cleanup may release verified final receipts.
      // Unknown writes and uncertain commits must survive even this cleanup.
      const retained = Object.fromEntries(
        Object.entries(entries.value).filter(
          ([, entry]) =>
            entry.state !== 'done' ||
            (!safelyRejected.has(entry) &&
              (!terminal(entry.task) || entry.task?.errorCode === 'COMMIT_UNCERTAIN')),
        ),
      )
      if (context !== null) persist(retained, true)
      else journal.clear(null, true)
      entries.value = retained
      recoveryProblem.value = null
    } catch (cause) {
      journalFailed(cause)
    }
  }
  return {
    entries: computed(() => entries.value),
    checking: readonly(checking),
    recoveryProblem: readonly(recoveryProblem),
    clearTracking,
    supported,
    allowed,
    submit,
    reconcile,
    pause,
    reset,
    bind(identity: string) {
      if (disposed || context === identity) return
      pause()
      entries.value = {}
      context = identity
      recoveryProblem.value = null
      if (journal) {
        try {
          const restored: Record<string, Pending<R>> = {}
          for (const { key, request } of journal.load(identity))
            restored[key] = shallowReactive<Pending<R>>({
              request,
              state: 'unknown',
              task: null,
              problem: null,
              restored: true,
            })
          entries.value = restored
        } catch (cause) {
          journalFailed(cause)
        }
      }
    },
    dispose() {
      disposed = true
      pause()
      entries.value = {}
      context = null
    },
  }
}
