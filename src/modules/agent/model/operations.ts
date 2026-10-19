import {
  computed,
  inject,
  readonly,
  ref,
  shallowReadonly,
  shallowRef,
  type InjectionKey,
} from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import { createOperations, type Task } from '../../tasks'
import {
  createOperationJournal,
  JournalError,
  type RecoveryProblem,
} from '../../../shared/model/operationJournal'
import {
  clearAgentPassword,
  validAgentPassword,
  type AgentAction,
  type AgentGateway,
  type AgentOperation,
  type AgentPreparation,
  type AgentReference,
} from '../api/gateway'
export { validAgentPassword } from '../api/gateway'
export type { AgentOperation } from '../api/gateway'

interface Entry {
  reference: AgentReference
  state: 'posting' | 'waiting' | 'unknown' | 'done'
  task: Task | null
  problem: ApiProblem | null
}
interface AutoGrowConfirmation {
  diskId: string
  revision: string
  vmRevision: string
  size: string
}
export function createAgentOperations(
  gateway: AgentGateway | undefined,
  refresh: () => Promise<boolean>,
  newId = requestId,
) {
  const entry = shallowRef<Entry | null>(null)
  const journal = gateway?.tracking ? createOperationJournal(gateway.tracking) : undefined
  const trackingProblem = shallowRef<RecoveryProblem | null>(null)
  const contextBound = ref(false)
  function trackingFailed(cause: unknown) {
    trackingProblem.value = cause instanceof JournalError ? cause.problem : 'invalid'
  }
  function persist(reference: AgentReference | null, replace = false) {
    if (!journal || identity === null) return
    journal.save(identity, reference ? [{ key: 'agent', request: reference }] : [], replace)
  }
  const preparation = shallowRef<AgentPreparation | null>(null)
  const problem = shallowRef<ApiProblem | null>(null)
  const open = ref(false),
    loading = ref(false),
    checking = ref(false),
    autoChecking = ref(false)
  const action = ref<AgentAction>('chpasswd')
  const pendingRecords = ref<number | null>(null),
    recoveryLoading = ref(false)
  const recoveryProblem = shallowRef<ApiProblem | null>(null)
  const recoveredRequest = ref<string | null>(null)
  const reads = new Set<AbortController>()
  let generation = 0,
    identity: string | null = null,
    disposed = false
  let recoveryForRequest: string | null = null
  let preparationRead: AbortController | undefined
  const supported = computed(() => !disposed && !!gateway?.supported())
  const busy = computed(() => !!entry.value && entry.value.state !== 'done')
  const recovery = createOperations(gateway?.recovery, refresh, gateway?.recovery.tracking)
  const recoveryBusy = computed(() =>
    Object.values(recovery.entries.value).some((row) => row.state !== 'done'),
  )
  const recoveryAllowed = computed(
    () =>
      recovery.supported.value &&
      !trackingProblem.value &&
      recovery.allowed('agent') &&
      !busy.value &&
      !open.value &&
      !autoChecking.value &&
      !recoveryLoading.value,
  )
  const allowed = computed(
    () =>
      supported.value &&
      !trackingProblem.value &&
      (!journal || contextBound.value) &&
      !recovery.recoveryProblem.value &&
      !busy.value &&
      !recoveryBusy.value &&
      (!recovery.supported.value || (pendingRecords.value !== null && !recoveryProblem.value)) &&
      entry.value?.task?.agentResult?.outcome !== 'uncertain' &&
      !(pendingRecords.value && pendingRecords.value > 0) &&
      (!entry.value?.task?.agentResult?.recoveryRequired ||
        recoveredRequest.value === entry.value.reference.requestId),
  )
  const writable = computed(() => {
    const detail = preparation.value?.detail
    return (
      !!detail &&
      detail.chainComplete &&
      !detail.readOnlyRequired &&
      !detail.children.length &&
      detail.inspection.state === 'ready'
    )
  })
  function close() {
    preparationRead?.abort()
    preparationRead = undefined
    preparation.value = null
    problem.value = null
    open.value = loading.value = false
  }
  async function prepare(id: string, next: AgentAction) {
    if (!gateway || !allowed.value || autoChecking.value) return
    close()
    const controller = new AbortController(),
      epoch = generation
    preparationRead = controller
    open.value = loading.value = true
    action.value = next
    try {
      const value = await gateway.prepare(id, controller.signal)
      if (!controller.signal.aborted && epoch === generation) preparation.value = value
    } catch (cause) {
      if (!controller.signal.aborted && epoch === generation)
        problem.value = describeApiError(cause)
    } finally {
      if (!controller.signal.aborted && epoch === generation) loading.value = false
    }
  }
  async function accept(task: Task, epoch: number) {
    const current = entry.value
    if (!current || epoch !== generation) return
    if (
      current.task &&
      (current.task.id !== task.id || BigInt(task.revision) < BigInt(current.task.revision))
    )
      throw new ApiError('invalid-response', 'Agent task identity or revision changed')
    entry.value = { ...current, task, state: 'waiting', problem: null }
    if (
      ['succeeded', 'failed', 'cancelled'].includes(task.state) &&
      (await refresh()) &&
      epoch === generation
    )
      entry.value = { ...entry.value!, state: 'done' }
  }
  async function submit(operation: AgentOperation, rescue = false) {
    const baseline = preparation.value
    if (
      !gateway ||
      (rescue && !gateway.rescueSupported?.()) ||
      !allowed.value ||
      autoChecking.value ||
      !writable.value ||
      !baseline?.catalog.vmRevision ||
      operation.diskId !== baseline.detail.disk.id ||
      operation.action !== action.value ||
      (operation.action === 'chpasswd' && !validAgentPassword(operation.password))
    ) {
      clearAgentPassword(operation)
      return
    }
    await send(operation, baseline, undefined, rescue)
  }
  async function send(
    operation: AgentOperation,
    baseline: AgentPreparation,
    submitted?: (requestId: string) => void,
    rescue = false,
  ) {
    if (!gateway || !baseline.catalog.vmRevision) return
    const reference = {
      requestId: newId(),
      diskId: operation.diskId,
      action: operation.action,
      ...(rescue ? { rescue: true } : {}),
    }
    try {
      persist(reference)
    } catch (cause) {
      trackingFailed(cause)
      clearAgentPassword(operation)
      return
    }
    const epoch = generation,
      controller = new AbortController()
    entry.value = { reference, state: 'posting', task: null, problem: null }
    close()
    reads.add(controller)
    try {
      submitted?.(reference.requestId)
      const response = gateway.submit(
        {
          requestId: reference.requestId,
          revision: baseline.catalog.revision,
          vmRevision: baseline.catalog.vmRevision,
          operation,
          ...(rescue ? { rescue: true } : {}),
        },
        controller.signal,
      )
      clearAgentPassword(operation)
      await accept(await response, epoch)
    } catch (cause) {
      if (epoch !== generation || !entry.value) return
      entry.value = { ...entry.value, state: 'unknown', problem: describeApiError(cause) }
      // Only explicit pre-admission rejections unlock after a fresh read.
      if (
        cause instanceof ApiError &&
        ['conflict', 'unauthenticated', 'permission-denied', 'unsupported'].includes(cause.code) &&
        (await refresh()) &&
        epoch === generation
      ) {
        entry.value = { ...entry.value!, state: 'done' }
        try {
          persist(null)
        } catch (failure) {
          trackingFailed(failure)
        }
      }
    } finally {
      clearAgentPassword(operation)
      reads.delete(controller)
    }
  }
  async function submitAutoGrow(
    expected: AutoGrowConfirmation,
    signal: AbortSignal,
    submitted: (requestId: string) => void,
  ) {
    if (!gateway || signal.aborted || !allowed.value || open.value || autoChecking.value)
      throw new ApiError('conflict', 'Agent operation is unavailable')
    const epoch = generation,
      controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    reads.add(controller)
    autoChecking.value = true
    try {
      const baseline = await gateway.prepare(expected.diskId, controller.signal)
      if (controller.signal.aborted || epoch !== generation) return
      const detail = baseline.detail
      if (
        !allowed.value ||
        open.value ||
        baseline.catalog.revision !== expected.revision ||
        baseline.catalog.vmRevision !== expected.vmRevision ||
        detail.revision !== expected.revision ||
        detail.vmRevision !== expected.vmRevision ||
        detail.disk.id !== expected.diskId ||
        detail.inspection.virtualBytes !== expected.size ||
        !detail.chainComplete ||
        detail.readOnlyRequired ||
        detail.children.length ||
        detail.inspection.state !== 'ready'
      )
        throw new ApiError('conflict', 'Disk or VM configuration changed; confirm again')
      // Only the pre-submission read is abortable by leaving the page. Once the
      // write starts, its original request is retained and queried by the model.
      signal.removeEventListener('abort', abort)
      await send({ action: 'autogrow', diskId: expected.diskId }, baseline, submitted)
    } finally {
      signal.removeEventListener('abort', abort)
      reads.delete(controller)
      if (epoch === generation) autoChecking.value = false
    }
  }
  async function reconcile() {
    const current = entry.value
    if (
      disposed ||
      checking.value ||
      !gateway ||
      !supported.value ||
      !current ||
      current.state === 'posting' ||
      current.state === 'done'
    )
      return
    const epoch = generation,
      controller = new AbortController()
    reads.add(controller)
    checking.value = true
    try {
      // Lookup has no operation payload and cannot repost a lost mutation.
      const task = await gateway.find(current.reference, controller.signal)
      if (epoch !== generation) return
      if (task) await accept(task, epoch)
      else entry.value = { ...entry.value!, state: 'unknown' }
    } catch (cause) {
      if (epoch === generation && entry.value)
        entry.value = { ...entry.value, problem: describeApiError(cause) }
    } finally {
      reads.delete(controller)
      if (epoch === generation) checking.value = false
    }
  }
  async function readRecovery() {
    if (!gateway?.recovery.supported() || recoveryLoading.value || disposed) return
    const epoch = generation,
      controller = new AbortController()
    reads.add(controller)
    recoveryLoading.value = true
    recoveryProblem.value = null
    try {
      const count = await gateway.recovery.status(controller.signal)
      if (epoch === generation) pendingRecords.value = count
    } catch (cause) {
      if (epoch === generation) {
        pendingRecords.value = null
        recoveryProblem.value = describeApiError(cause)
      }
    } finally {
      reads.delete(controller)
      if (epoch === generation) recoveryLoading.value = false
    }
  }
  async function reconcileRecovery() {
    const epoch = generation
    await recovery.reconcile()
    if (epoch !== generation) return
    const task = recovery.entries.value.agent?.task
    if (
      recovery.entries.value.agent?.state === 'done' &&
      task?.state === 'succeeded' &&
      task.pendingRecords === 0
    )
      recoveredRequest.value =
        recovery.entries.value.agent?.request.agentRequestId ?? recoveryForRequest
    await readRecovery()
  }
  async function recover() {
    if (!recoveryAllowed.value || pendingRecords.value === null) return
    const epoch = generation
    recoveryForRequest = entry.value?.reference.requestId ?? null
    await recovery.submit('agent', { requestId: newId(), agentRequestId: recoveryForRequest })
    if (epoch === generation) await reconcileRecovery()
  }
  function pause() {
    generation++
    close()
    for (const read of reads) read.abort()
    reads.clear()
    checking.value = recoveryLoading.value = autoChecking.value = false
    if (entry.value?.state === 'posting') entry.value = { ...entry.value, state: 'unknown' }
    recovery.pause()
  }
  function reset(preserveTracking = false) {
    pause()
    if (!preserveTracking) {
      try {
        journal?.clear(identity)
        trackingProblem.value = null
      } catch (cause) {
        trackingFailed(cause)
      }
    }
    entry.value = null
    pendingRecords.value = null
    recoveredRequest.value = null
    recoveryForRequest = null
    recoveryProblem.value = null
    identity = null
    contextBound.value = false
    recovery.reset(preserveTracking)
  }
  return {
    supported,
    trackingProblem: readonly(trackingProblem),
    clearTracking() {
      if (!trackingProblem.value || !journal) return
      try {
        // Cleanup cannot release an unknown write or an uncertain guest outcome.
        const current = entry.value
        const retained =
          current &&
          (current.state !== 'done' ||
            current.task?.agentResult?.outcome === 'uncertain' ||
            current.task?.agentResult?.recoveryRequired)
        if (identity) persist(retained ? current.reference : null, true)
        else journal.clear(null, true)
        if (!retained) entry.value = null
        trackingProblem.value = null
      } catch (cause) {
        trackingFailed(cause)
      }
    },
    rescueSupported: computed(() => supported.value && !!gateway?.rescueSupported?.()),
    allowed: computed(() => allowed.value && !autoChecking.value),
    writable,
    busy: computed(() => busy.value || recoveryBusy.value || autoChecking.value),
    entry: shallowReadonly(entry),
    preparation: readonly(preparation),
    problem: readonly(problem),
    open: readonly(open),
    loading: readonly(loading),
    checking: readonly(checking),
    action: readonly(action),
    recovery,
    recoveryAllowed,
    pendingRecords: readonly(pendingRecords),
    recoveryLoading: readonly(recoveryLoading),
    recoveryProblem: readonly(recoveryProblem),
    prepare,
    close,
    submit,
    submitAutoGrow,
    reconcile,
    readRecovery,
    reconcileRecovery,
    recover,
    pause,
    reset,
    bind(value: string) {
      if (identity === value) return
      reset(true)
      identity = value
      contextBound.value = true
      trackingProblem.value = null
      try {
        const reference = journal?.load(value)[0]?.request
        if (reference) entry.value = { reference, state: 'unknown', task: null, problem: null }
      } catch (cause) {
        trackingFailed(cause)
      }
      recovery.bind(value)
    },
    dispose() {
      disposed = true
      reset(true)
      recovery.dispose()
    },
  }
}
export type AgentOperations = ReturnType<typeof createAgentOperations>
export const agentOperationsKey: InjectionKey<AgentOperations> = Symbol('agent-operations')
export function useAgentOperations() {
  const value = inject(agentOperationsKey)
  if (!value) throw new Error('Agent operations are not provided')
  return value
}
