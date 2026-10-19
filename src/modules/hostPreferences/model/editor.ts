import { computed, shallowReactive, readonly, ref, shallowRef } from 'vue'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import {
  createOperations,
  type OperationGateway,
  type OperationTracking,
  type Task,
} from '../../tasks'

interface PreferenceObservation<V> {
  expected: { revision: string }
  values: V
  uncertain: boolean
}
interface PreferenceReceipt {
  saved: boolean
  uncertain: boolean
}
interface PreferenceRequest<V> {
  requestId: string
  expected: { revision: string }
  changes: Partial<V>
}
interface PreferenceGateway<V, O> extends OperationGateway<PreferenceRequest<V>> {
  tracking?: OperationTracking<PreferenceRequest<V>>
  readable(): boolean
  read(signal: AbortSignal): Promise<O>
}
// Values are JSON data. Copies isolate mutable draft/review arrays from observations.
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function createPreferenceEditor<
  V extends object,
  O extends PreferenceObservation<V>,
  R extends PreferenceReceipt,
>(
  options: {
    gateway?: PreferenceGateway<V, O>
    defaults: V
    resource: string
    receipt: (task: Task) => R | undefined
    valid?: (value: V) => boolean
    writeAllowed?: () => boolean
  },
  newId = requestId,
) {
  const { gateway } = options
  const keys = Object.keys(options.defaults) as (keyof V)[]
  const status = shallowRef<O | null>(null)
  const base = shallowRef<O | null>(null)
  const draft = shallowReactive<V>(copy(options.defaults))
  const loading = ref(false),
    fresh = ref(false),
    problem = shallowRef<ApiProblem | null>(null)
  const review = shallowRef<Omit<PreferenceRequest<V>, 'requestId'> | null>(null)
  let controller: AbortController | undefined, timer: ReturnType<typeof setInterval> | undefined
  let generation = 0,
    active = false,
    ticking = false,
    failureUntil = 0,
    identity: string | null = null
  let adoptedRequest: string | null = null
  const supported = computed(() => !!gateway?.readable())
  const operations = createOperations(gateway, refresh, gateway?.tracking)
  const entry = computed(() => operations.entries.value[options.resource] ?? null)
  const receipt = computed(() =>
    entry.value?.task ? (options.receipt(entry.value.task) ?? null) : null,
  )
  const unresolved = computed(() => !!receipt.value?.uncertain)
  const pending = computed(
    () => !!entry.value && (entry.value.state !== 'done' || unresolved.value),
  )
  const dirty = computed(
    () => !!base.value && keys.some((key) => !same(draft[key], base.value!.values[key])),
  )
  const conflict = computed(
    () =>
      !!base.value &&
      !!status.value &&
      base.value.expected.revision !== status.value.expected.revision,
  )
  const editable = computed(
    () =>
      operations.supported.value &&
      operations.allowed(options.resource) &&
      (!options.writeAllowed || options.writeAllowed()) &&
      fresh.value &&
      !!status.value &&
      !status.value.uncertain &&
      !pending.value &&
      !loading.value,
  )
  const canSave = computed(
    () =>
      editable.value && dirty.value && !conflict.value && (!options.valid || options.valid(draft)),
  )
  function cancelReview() {
    review.value = null
  }
  function adopt(value: O) {
    base.value = value
    Object.assign(draft, copy(value.values))
    cancelReview()
  }
  async function refresh() {
    if (!gateway || !supported.value || loading.value) return false
    const epoch = generation,
      request = new AbortController()
    controller = request
    loading.value = true
    try {
      const value = await gateway.read(request.signal)
      if (request.signal.aborted || epoch !== generation) return false
      const wasDirty = dirty.value
      status.value = value
      fresh.value = true
      problem.value = null
      failureUntil = 0
      if (!wasDirty) adopt(value)
      if (
        review.value &&
        (review.value.expected.revision !== value.expected.revision || value.uncertain)
      )
        cancelReview()
      return true
    } catch (cause) {
      if (!request.signal.aborted && epoch === generation) {
        problem.value = describeApiError(cause)
        fresh.value = false
        failureUntil = Date.now() + 60000
        cancelReview()
      }
      return false
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  function rebase() {
    if (!status.value || !fresh.value || pending.value || loading.value) return
    for (const key of keys)
      if (same(draft[key], base.value?.values[key])) draft[key] = copy(status.value.values[key])
    base.value = status.value
    cancelReview()
  }
  function discard() {
    if (status.value && !pending.value) adopt(status.value)
  }
  function prepare() {
    if (!canSave.value || !base.value) return
    const changes: PreferenceRequest<V>['changes'] = {}
    for (const key of keys)
      if (!same(draft[key], base.value.values[key])) changes[key] = copy(draft[key])
    review.value = { expected: { ...base.value.expected }, changes }
  }
  async function submit() {
    const selected = review.value
    if (
      !selected ||
      !canSave.value ||
      selected.expected.revision !== status.value?.expected.revision
    ) {
      cancelReview()
      return
    }
    if (keys.some((key) => !same(selected.changes[key] ?? base.value!.values[key], draft[key]))) {
      cancelReview()
      return
    }
    cancelReview()
    await operations.submit(options.resource, { ...selected, requestId: newId() })
    adoptSaved()
  }
  function adoptSaved() {
    if (
      entry.value?.state === 'done' &&
      entry.value.request.requestId !== adoptedRequest &&
      entry.value.task?.state === 'succeeded' &&
      receipt.value?.saved &&
      !receipt.value.uncertain &&
      status.value &&
      fresh.value
    ) {
      adoptedRequest = entry.value.request.requestId
      adopt(status.value)
    }
  }
  async function reconcile() {
    await operations.reconcile()
    adoptSaved()
  }
  function pause() {
    generation++
    controller?.abort()
    loading.value = false
    fresh.value = false
    cancelReview()
    operations.pause()
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
      await reconcile()
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
  function clearLocal() {
    pause()
    status.value = null
    base.value = null
    problem.value = null
    identity = null
    failureUntil = 0
    adoptedRequest = null
    Object.assign(draft, copy(options.defaults))
  }
  function reset() {
    clearLocal()
    operations.reset()
  }
  function clearTracking() {
    // Domain uncertainty may exist without a COMMIT_UNCERTAIN task error.
    if (receipt.value?.uncertain || status.value?.uncertain) return
    operations.clearTracking()
  }
  return {
    status: readonly(status),
    draft,
    loading: readonly(loading),
    fresh: readonly(fresh),
    problem: readonly(problem),
    review: readonly(review),
    supported,
    dirty,
    conflict,
    editable,
    canSave,
    pending,
    entry,
    receipt,
    unresolved,
    refresh,
    rebase,
    discard,
    prepare,
    submit,
    cancelReview,
    reconcile,
    checking: operations.checking,
    recoveryProblem: operations.recoveryProblem,
    clearTracking,
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
      if (identity !== value) clearLocal()
      identity = value
      operations.bind(value)
      if (active) void tick()
    },
    dispose() {
      deactivate()
      clearLocal()
      operations.dispose()
    },
  }
}
