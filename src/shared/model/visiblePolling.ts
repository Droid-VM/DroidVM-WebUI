import { inject, onMounted, onUnmounted, watch } from 'vue'
import { liveUpdatesKey, type LiveResource } from './liveUpdates'

// One visible page owns its timer. Errors back off to the server capacity window.
export function useVisiblePolling(
  enabled: () => boolean,
  work: () => Promise<boolean>,
  resources: LiveResource[] = [],
) {
  const live = inject(liveUpdatesKey, undefined)
  let timer: ReturnType<typeof setInterval> | undefined
  let nextRead = 0,
    errorUntil = 0,
    invalidations = 0,
    running = false,
    disposed = false
  async function refresh() {
    if (
      disposed ||
      running ||
      !enabled() ||
      document.visibilityState !== 'visible' ||
      Date.now() < Math.max(nextRead, errorUntil)
    )
      return
    running = true
    const observed = invalidations
    try {
      if (await work()) {
        errorUntil = 0
        nextRead =
          Date.now() +
          (observed !== invalidations
            ? 150
            : live?.connected.value && resources.length
              ? 60_000
              : 5000)
      } else errorUntil = nextRead = Date.now() + 60_000
    } catch {
      errorUntil = nextRead = Date.now() + 60_000
    } finally {
      running = false
    }
  }
  if (live && resources.length) {
    watch(
      () => resources.map((resource) => live.revisions[resource]),
      () => {
        invalidations++
        nextRead = Math.min(nextRead, Date.now() + 150)
      },
    )
    watch(live.connected, () => {
      nextRead = 0
    })
  }
  watch(
    enabled,
    (value) => {
      if (value) {
        nextRead = 0
        void refresh()
      }
    },
    { immediate: true },
  )
  onMounted(() => {
    timer = setInterval(() => void refresh(), 500)
    document.addEventListener('visibilitychange', refresh)
  })
  onUnmounted(() => {
    disposed = true
    clearInterval(timer)
    document.removeEventListener('visibilitychange', refresh)
  })
}
