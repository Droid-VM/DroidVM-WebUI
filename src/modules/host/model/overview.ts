import {
  computed,
  inject,
  onMounted,
  onUnmounted,
  readonly,
  ref,
  shallowRef,
  watch,
  type InjectionKey,
} from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type { HostOverview, HostOverviewGateway } from '../api/overview'

/** A single polling owner shared by all visible summaries and the detail page. */
export function createHostOverview(gateway?: HostOverviewGateway, now: () => number = Date.now) {
  const data = shallowRef<HostOverview | null>(null),
    problem = shallowRef<ApiProblem | null>(null)
  const loading = ref(false),
    clock = ref(now()),
    receivedAt = ref<number | null>(null),
    paused = ref(false)
  const supported = computed(() => !!gateway?.supported())
  const stale = computed(
    () =>
      !!data.value &&
      (paused.value ||
        !!problem.value ||
        receivedAt.value === null ||
        clock.value - receivedAt.value >= 10_000),
  )
  const owners = new Set<symbol>()
  let request: AbortController | undefined, pending: Promise<boolean> | undefined
  let timer: ReturnType<typeof setInterval> | undefined,
    identity = '',
    failureUntil = 0
  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
  function abort() {
    request?.abort()
    request = undefined
    pending = undefined
    loading.value = false
  }
  function reset() {
    abort()
    data.value = null
    problem.value = null
    receivedAt.value = null
    clock.value = now()
    failureUntil = 0
  }
  function refresh(): Promise<boolean> {
    if (pending) return pending
    if (!gateway || !supported.value || paused.value || !visible()) return Promise.resolve(false)
    const current = new AbortController()
    request = current
    loading.value = true
    pending = (async () => {
      try {
        const result = await gateway.read(current.signal)
        if (current.signal.aborted || request !== current) return false
        clock.value = now()
        if (!data.value || data.value.observedAtMs !== result.observedAtMs)
          receivedAt.value = clock.value
        data.value = result
        problem.value = null
        failureUntil = 0
        return true
      } catch (cause) {
        if (current.signal.aborted || request !== current) return false
        if (
          cause instanceof ApiError &&
          (cause.code === 'context-changed' ||
            cause.code === 'unauthenticated' ||
            cause.code === 'permission-denied')
        ) {
          data.value = null
          receivedAt.value = null
        }
        problem.value = describeApiError(cause)
        failureUntil = now() + 60_000
        return false
      } finally {
        if (request === current) {
          request = undefined
          pending = undefined
          loading.value = false
        }
      }
    })()
    return pending
  }
  function tick() {
    clock.value = now()
    if (owners.size && visible() && !paused.value && clock.value >= failureUntil) void refresh()
  }
  function visibility() {
    clock.value = now()
    if (!visible()) abort()
    else {
      failureUntil = 0
      tick()
    }
  }
  function stopTimer() {
    clearInterval(timer)
    timer = undefined
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', visibility)
    abort()
  }
  const stopSupported = watch(supported, (value) => {
    if (!value) reset()
    else if (owners.size) tick()
  })
  return {
    data: readonly(data),
    problem: readonly(problem),
    loading: readonly(loading),
    supported,
    stale,
    refresh,
    reset,
    acquire() {
      const owner = Symbol('host-observer')
      owners.add(owner)
      if (!timer) {
        timer = setInterval(tick, 3000)
        if (typeof document !== 'undefined')
          document.addEventListener('visibilitychange', visibility)
        tick()
      }
      return () => {
        owners.delete(owner)
        if (!owners.size) stopTimer()
      }
    },
    bind(value: string) {
      if (identity !== value) reset()
      identity = value
      paused.value = false
      failureUntil = 0
      if (owners.size) tick()
    },
    pause() {
      paused.value = true
      abort()
    },
    dispose() {
      owners.clear()
      stopTimer()
      stopSupported()
      reset()
    },
  }
}
export type HostOverviewModel = ReturnType<typeof createHostOverview>
export const hostOverviewKey: InjectionKey<HostOverviewModel> = Symbol('host-overview')
export function useHostOverview() {
  const model = inject(hostOverviewKey)
  if (!model) throw new Error('Host overview is not provided')
  return model
}
export function useHostMonitoring(enabled: () => boolean = () => true) {
  const model = useHostOverview()
  let mounted = false,
    release: (() => void) | undefined
  function update() {
    release?.()
    release = undefined
    if (mounted && enabled()) release = model.acquire()
  }
  const stop = watch(enabled, update)
  onMounted(() => {
    mounted = true
    update()
  })
  onUnmounted(() => {
    mounted = false
    stop()
    release?.()
  })
  return model
}
