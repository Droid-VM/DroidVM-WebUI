import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import { createOperations } from '../../tasks'
import {
  sameProcess,
  type HugepageProcessGateway,
  type ProcessEntry,
  type ProcessIdentity,
  type ProcessObservation,
  type ProcessRequest,
  type ProcessSource,
  type ProcessStack,
} from '../api/http'

interface Review {
  expected: ProcessIdentity
  signal: 'term' | 'kill'
  name: string
  vmName: string | null
  controlsCurrentVm: boolean
}
const copyIdentity = (value: ProcessIdentity): ProcessIdentity => ({
  pid: value.pid,
  startTicks: value.startTicks,
  source: value.source,
  membership: value.membership,
})
export function createHugepageProcesses(
  gateway?: HugepageProcessGateway,
  newId = requestId,
  externalAvailable = () => true,
) {
  const status = shallowRef<ProcessObservation | null>(null),
    problem = shallowRef<ApiProblem | null>(null)
  const source = ref<ProcessSource>('auto'),
    loading = ref(false),
    fresh = ref(false)
  const review = shallowRef<Review | null>(null),
    confirmSignal = ref(false)
  const stackTarget = shallowRef<{ expected: ProcessIdentity; name: string } | null>(null)
  const stack = shallowRef<ProcessStack | null>(null),
    stackLoading = ref(false),
    stackProblem = shallowRef<ApiProblem | null>(null)
  let controller: AbortController | undefined, stackController: AbortController | undefined
  let generation = 0,
    active = false,
    ticking = false,
    failureUntil = 0,
    identity: string | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  const supported = computed(() => !!gateway?.readable())
  const operations = createOperations(gateway, refresh, gateway?.tracking)
  const entry = computed(() => operations.entries.value['hugepage-processes'] ?? null)
  const receipt = computed(() => entry.value?.task?.hugepageProcessResult ?? null)
  const unresolved = computed(
    () =>
      !!entry.value?.task &&
      ['succeeded', 'failed', 'cancelled'].includes(entry.value.task.state) &&
      (!receipt.value || receipt.value.uncertain),
  )
  const pending = computed(
    () =>
      !!operations.recoveryProblem.value ||
      (!!entry.value && (entry.value.state !== 'done' || unresolved.value)),
  )
  const editable = computed(
    () =>
      operations.supported.value &&
      fresh.value &&
      !loading.value &&
      status.value?.available === true &&
      !pending.value &&
      operations.allowed('hugepage-processes') &&
      externalAvailable(),
  )
  function cancelReview() {
    review.value = null
    confirmSignal.value = false
  }
  function closeStack() {
    stackController?.abort()
    stackController = undefined
    stackTarget.value = null
    stack.value = null
    stackProblem.value = null
    stackLoading.value = false
  }
  function current(expected: ProcessIdentity) {
    return status.value?.entries.find((row) => sameProcess(row.expected, expected))
  }
  function signalIdentityAllowed(row: ProcessEntry | undefined) {
    return (
      !!row &&
      row.canSignal &&
      row.alive === true &&
      row.identityStatus === 'verified' &&
      row.expected !== null
    )
  }
  function stackIdentityAllowed(row: ProcessEntry | undefined) {
    return !!row && row.canStack && row.state === 'D' && row.alive === true && row.expected !== null
  }
  async function refresh() {
    if (!gateway || !supported.value || loading.value) return false
    const epoch = generation,
      selectedSource = source.value,
      request = new AbortController()
    controller = request
    loading.value = true
    try {
      const value = await gateway.read(selectedSource, request.signal)
      if (request.signal.aborted || epoch !== generation || source.value !== selectedSource)
        return false
      status.value = value
      fresh.value = true
      problem.value = null
      failureUntil = 0
      if (
        review.value &&
        (!signalIdentityAllowed(current(review.value.expected)) ||
          !sameProcess(current(review.value.expected)?.expected, review.value.expected))
      )
        cancelReview()
      if (stackTarget.value && !stackIdentityAllowed(current(stackTarget.value.expected)))
        closeStack()
      return true
    } catch (cause) {
      if (!request.signal.aborted && epoch === generation) {
        problem.value = describeApiError(cause)
        fresh.value = false
        failureUntil = Date.now() + 60000
        cancelReview()
        closeStack()
      }
      return false
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  function canSignal(row: ProcessEntry) {
    return editable.value && row.expected !== null && signalIdentityAllowed(current(row.expected))
  }
  function prepare(row: ProcessEntry, signal: 'term' | 'kill') {
    if (!canSignal(row) || !row.expected) return
    const latest = current(row.expected)!
    review.value = {
      expected: copyIdentity(row.expected),
      signal,
      name: latest.name,
      vmName: latest.vm?.name ?? null,
      controlsCurrentVm:
        latest.source === 'ko' && !latest.attributionVerified && row.expected.source === 'scan',
    }
    confirmSignal.value = false
  }
  async function submit() {
    const selected = review.value
    if (!selected || !confirmSignal.value) return
    const row = current(selected.expected)
    if (!row || !canSignal(row)) {
      cancelReview()
      return
    }
    const request: ProcessRequest = {
      requestId: newId(),
      expected: copyIdentity(selected.expected),
      signal: selected.signal,
    }
    cancelReview()
    await operations.submit('hugepage-processes', request)
  }
  function canStack(row: ProcessEntry) {
    return (
      supported.value &&
      fresh.value &&
      !loading.value &&
      !!row.expected &&
      stackIdentityAllowed(current(row.expected))
    )
  }
  async function openStack(row: ProcessEntry) {
    if (!gateway || !canStack(row) || !row.expected) return
    closeStack()
    const expected = copyIdentity(row.expected),
      request = new AbortController(),
      epoch = generation
    stackTarget.value = { expected, name: row.name }
    stackLoading.value = true
    stackController = request
    try {
      const result = await gateway.stack(expected, request.signal)
      if (
        request.signal.aborted ||
        epoch !== generation ||
        !sameProcess(stackTarget.value?.expected, expected)
      )
        return
      if (!stackIdentityAllowed(current(expected))) {
        closeStack()
        return
      }
      stack.value = result
    } catch (cause) {
      if (!request.signal.aborted && epoch === generation)
        stackProblem.value = describeApiError(cause)
    } finally {
      if (epoch === generation && stackController === request) stackLoading.value = false
    }
  }
  function pause() {
    generation++
    controller?.abort()
    loading.value = false
    fresh.value = false
    cancelReview()
    closeStack()
    operations.pause()
  }
  async function chooseSource(value: ProcessSource) {
    if (value === source.value) return
    pause()
    source.value = value
    status.value = null
    problem.value = null
    failureUntil = 0
    await refresh()
  }
  async function tick() {
    if (
      !active ||
      ticking ||
      Date.now() < failureUntil ||
      (typeof document !== 'undefined' && document.hidden)
    )
      return
    ticking = true
    const epoch = generation
    try {
      await operations.reconcile()
      if (epoch === generation) await refresh()
    } finally {
      ticking = false
    }
  }
  function visibility() {
    if (document.hidden) pause()
    else {
      failureUntil = 0
      void tick()
    }
  }
  function deactivate() {
    active = false
    if (timer) clearInterval(timer)
    timer = undefined
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', visibility)
    pause()
  }
  function clearState() {
    pause()
    status.value = null
    problem.value = null
    source.value = 'auto'
    identity = null
    failureUntil = 0
  }
  function reset() {
    clearState()
    operations.reset()
  }
  return {
    status: readonly(status),
    problem: readonly(problem),
    source: readonly(source),
    loading: readonly(loading),
    fresh: readonly(fresh),
    supported,
    editable,
    pending,
    entry,
    receipt,
    unresolved,
    review: readonly(review),
    confirmSignal,
    stackTarget: readonly(stackTarget),
    stack: readonly(stack),
    stackLoading: readonly(stackLoading),
    stackProblem: readonly(stackProblem),
    canSignal,
    prepare,
    cancelReview,
    submit,
    canStack,
    openStack,
    closeStack,
    chooseSource,
    refresh,
    reconcile: operations.reconcile,
    checking: operations.checking,
    recoveryProblem: operations.recoveryProblem,
    clearTracking() {
      if (unresolved.value) return
      cancelReview()
      operations.clearTracking()
    },
    activate() {
      if (active) return
      active = true
      failureUntil = 0
      timer = setInterval(tick, 5000)
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility)
      void tick()
    },
    deactivate,
    pause,
    reset,
    bind(value: string) {
      if (identity !== value) clearState()
      identity = value
      operations.bind(value)
      if (active) void tick()
    },
    dispose() {
      deactivate()
      clearState()
      operations.dispose()
    },
  }
}
export type HugepageProcesses = ReturnType<typeof createHugepageProcesses>
export const hugepageProcessesKey: InjectionKey<HugepageProcesses> = Symbol('hugepage-processes')
export function useHugepageProcesses() {
  const value = inject(hugepageProcessesKey)
  if (!value) throw new Error('Hugepage processes are not provided')
  return value
}
