import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import { createOperations } from '../../tasks'
import type {
  AndroidDisplayGateway,
  AndroidDisplayObservation,
  AndroidDisplayRequest,
} from '../api/http'

// The Android panel's ownership. Stopping Android from here keeps zygote, netd
// and wpa_supplicant alive, so the browser session survives; the page polls on
// a short interval while the phone is stopped or restoring so a lost Wi-Fi
// link, a daemon restart or the sentinel's automatic restoration shows up
// without any user action.
export const autoRestoreChoices = [600, 1800, 3600, 14400] as const
export function createAndroidDisplay(gateway?: AndroidDisplayGateway, newId = requestId) {
  const status = shallowRef<AndroidDisplayObservation | null>(null)
  const loading = ref(false),
    fresh = ref(false),
    problem = shallowRef<ApiProblem | null>(null)
  const review = shallowRef<Omit<AndroidDisplayRequest, 'requestId'> | null>(null),
    confirmBlank = ref(false)
  const autoRestoreSeconds = ref<(typeof autoRestoreChoices)[number]>(1800),
    restoreOnNetworkLoss = ref(true)
  let controller: AbortController | undefined, timer: ReturnType<typeof setInterval> | undefined
  let generation = 0,
    active = false,
    ticking = false,
    failureUntil = 0,
    identity: string | null = null
  const supported = computed(() => !!gateway?.readable())
  const operations = createOperations(gateway, refresh, gateway?.tracking)
  const entry = computed(() => operations.entries.value['android-display'] ?? null)
  const receipt = computed(() => entry.value?.task?.androidDisplayResult ?? null)
  const unresolved = computed(() => !!receipt.value?.uncertain)
  const pending = computed(
    () => !!entry.value && (entry.value.state !== 'done' || unresolved.value),
  )
  const stopped = computed(() => status.value?.state === 'stopped')
  const busy = computed(
    () => status.value?.state === 'stopping' || status.value?.state === 'restoring',
  )
  const vmOwned = computed(() => status.value?.owner?.kind === 'vm')
  const editable = computed(
    () =>
      operations.supported.value &&
      operations.allowed('android-display') &&
      fresh.value &&
      !!status.value?.supported &&
      !unresolved.value &&
      !pending.value &&
      !loading.value,
  )
  const canStop = computed(
    () =>
      editable.value &&
      status.value?.state === 'android' &&
      status.value.watchdog.verified &&
      status.value.panelLit !== false,
  )
  const canRestore = computed(() => editable.value && stopped.value && !vmOwned.value)
  function cancelReview() {
    review.value = null
    confirmBlank.value = false
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
      status.value = value
      fresh.value = true
      problem.value = null
      failureUntil = 0
      if (review.value && review.value.expected.revision !== value.expected.revision) cancelReview()
      return true
    } catch (cause) {
      if (!request.signal.aborted && epoch === generation) {
        problem.value = describeApiError(cause)
        fresh.value = false
        // A stopped phone may be reconnecting its Wi-Fi: keep trying on the
        // short cadence instead of the quiet one-minute backoff.
        failureUntil = Date.now() + (stopped.value || busy.value ? 5000 : 60000)
        cancelReview()
      }
      return false
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  function prepare(kind: 'stop' | 'restore') {
    if (!(kind === 'stop' ? canStop.value : canRestore.value) || !status.value) return
    review.value = {
      expected: { ...status.value.expected },
      operation:
        kind === 'stop'
          ? {
              kind,
              autoRestoreSeconds: autoRestoreSeconds.value,
              restoreOnNetworkLoss: restoreOnNetworkLoss.value,
            }
          : { kind },
    }
    confirmBlank.value = false
  }
  async function submit() {
    const selected = review.value
    if (!selected) return
    if (selected.operation.kind === 'stop' && !confirmBlank.value) return
    const allowed = selected.operation.kind === 'stop' ? canStop.value : canRestore.value
    if (!allowed || selected.expected.revision !== status.value?.expected.revision) {
      cancelReview()
      return
    }
    cancelReview()
    await operations.submit('android-display', { ...selected, requestId: newId() })
    await refresh()
  }
  async function reconcile() {
    await operations.reconcile()
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
    problem.value = null
    identity = null
    failureUntil = 0
  }
  function reset() {
    clearState()
    operations.reset()
  }
  return {
    status: readonly(status),
    loading: readonly(loading),
    fresh: readonly(fresh),
    problem: readonly(problem),
    review: readonly(review),
    confirmBlank,
    autoRestoreSeconds,
    restoreOnNetworkLoss,
    supported,
    stopped,
    busy,
    vmOwned,
    editable,
    canStop,
    canRestore,
    pending,
    entry,
    receipt,
    unresolved,
    refresh,
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
export type AndroidDisplay = ReturnType<typeof createAndroidDisplay>
export const androidDisplayKey: InjectionKey<AndroidDisplay> = Symbol('android-display')
export function useAndroidDisplay() {
  const model = inject(androidDisplayKey)
  if (!model) throw new Error('Android display is not provided')
  return model
}
