import { computed, inject, reactive, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import { createOperations } from '../../tasks'
import type { UsbAcmGateway, UsbAcmObservation, UsbAcmRequest } from '../api/http'

function observationUncertain(value: UsbAcmObservation | null) {
  return (
    !!value?.persistenceUncertain ||
    value?.live.reason === 'application-outcome-unknown' ||
    value?.live.reason === 'persistence-outcome-unknown'
  )
}

export function createUsbAcm(gateway?: UsbAcmGateway, newId = requestId) {
  const status = shallowRef<UsbAcmObservation | null>(null),
    base = shallowRef<UsbAcmObservation | null>(null)
  const draft = reactive({ enabled: false, ports: 1 })
  const loading = ref(false),
    fresh = ref(false),
    problem = shallowRef<ApiProblem | null>(null)
  const review = shallowRef<Omit<UsbAcmRequest, 'requestId'> | null>(null),
    confirmDisconnect = ref(false)
  let controller: AbortController | undefined, timer: ReturnType<typeof setInterval> | undefined
  let generation = 0,
    active = false,
    ticking = false,
    failureUntil = 0,
    identity: string | null = null,
    adoptedRequest: string | null = null
  const supported = computed(() => !!gateway?.readable())
  const operations = createOperations(gateway, refresh, gateway?.tracking)
  const entry = computed(() => operations.entries.value['usb-acm'] ?? null)
  const receipt = computed(() => entry.value?.task?.usbAcmResult ?? null)
  const unresolved = computed(
    () => !!receipt.value?.uncertain || observationUncertain(status.value),
  )
  const pending = computed(
    () => !!entry.value && (entry.value.state !== 'done' || unresolved.value),
  )
  const dirty = computed(
    () =>
      !!base.value &&
      (draft.enabled !== base.value.desired.enabled || draft.ports !== base.value.desired.ports),
  )
  const conflict = computed(
    () =>
      !!base.value &&
      !!status.value &&
      base.value.expected.revision !== status.value.expected.revision,
  )
  const occupied = computed(() => !!status.value?.live.owners.length)
  const editable = computed(
    () =>
      operations.supported.value &&
      operations.allowed('usb-acm') &&
      fresh.value &&
      !!status.value &&
      !unresolved.value &&
      !pending.value &&
      !loading.value,
  )
  const canConfigure = computed(
    () =>
      editable.value &&
      dirty.value &&
      !conflict.value &&
      !occupied.value &&
      Number.isInteger(draft.ports) &&
      draft.ports >= 1 &&
      draft.ports <= 6,
  )
  const canApply = computed(
    () =>
      editable.value &&
      !dirty.value &&
      !conflict.value &&
      !occupied.value &&
      !!status.value?.initialized &&
      !!status.value.live.available &&
      !status.value.live.applied,
  )
  function cancelReview() {
    review.value = null
    confirmDisconnect.value = false
  }
  function adopt(value: UsbAcmObservation) {
    base.value = value
    Object.assign(draft, value.desired)
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
      if (!wasDirty && !review.value) adopt(value)
      if (
        review.value &&
        (review.value.expected.revision !== value.expected.revision ||
          observationUncertain(value) ||
          value.live.owners.length)
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
    if (!status.value || !editable.value || !base.value) return
    if (draft.enabled === base.value.desired.enabled) draft.enabled = status.value.desired.enabled
    if (draft.ports === base.value.desired.ports) draft.ports = status.value.desired.ports
    base.value = status.value
    cancelReview()
  }
  function discard() {
    if (status.value && !pending.value) adopt(status.value)
  }
  function prepare(kind: 'configure' | 'apply') {
    if (!(kind === 'configure' ? canConfigure.value : canApply.value) || !status.value) return
    review.value = {
      expected: { ...status.value.expected },
      operation:
        kind === 'configure' ? { kind, enabled: draft.enabled, ports: draft.ports } : { kind },
    }
    confirmDisconnect.value = false
  }
  function adoptSaved() {
    if (
      entry.value?.state === 'done' &&
      entry.value.request.requestId !== adoptedRequest &&
      receipt.value?.saved &&
      !receipt.value.uncertain &&
      status.value &&
      fresh.value
    ) {
      adoptedRequest = entry.value.request.requestId
      adopt(status.value)
    }
  }
  async function submit() {
    const selected = review.value
    if (!selected || !confirmDisconnect.value) return
    const allowed = selected.operation.kind === 'configure' ? canConfigure.value : canApply.value
    if (
      !allowed ||
      selected.expected.revision !== status.value?.expected.revision ||
      (selected.operation.kind === 'configure' &&
        (selected.operation.enabled !== draft.enabled || selected.operation.ports !== draft.ports))
    ) {
      cancelReview()
      return
    }
    cancelReview()
    await operations.submit('usb-acm', { ...selected, requestId: newId() })
    adoptSaved()
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
  function clearState() {
    pause()
    status.value = null
    base.value = null
    problem.value = null
    identity = null
    failureUntil = 0
    adoptedRequest = null
    Object.assign(draft, { enabled: false, ports: 1 })
  }
  function reset() {
    clearState()
    operations.reset()
  }
  return {
    status: readonly(status),
    draft,
    loading: readonly(loading),
    fresh: readonly(fresh),
    problem: readonly(problem),
    review: readonly(review),
    confirmDisconnect,
    supported,
    dirty,
    conflict,
    occupied,
    editable,
    canConfigure,
    canApply,
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
export type UsbAcm = ReturnType<typeof createUsbAcm>
export const usbAcmKey: InjectionKey<UsbAcm> = Symbol('usb-acm')
export function useUsbAcm() {
  const model = inject(usbAcmKey)
  if (!model) throw new Error('USB ACM is not provided')
  return model
}
