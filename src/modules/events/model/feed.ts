import { reactive, readonly, ref, watch } from 'vue'
import type { LiveResource } from '../../../shared/model/liveUpdates'
import type { EventCursor, EventGateway } from '../api/gateway'

export function createEventFeed(gateway: EventGateway) {
  const connected = ref(false)
  const revisions = reactive<Record<LiveResource, number>>({
    vms: 0,
    tasks: 0,
    disks: 0,
    networks: 0,
  })
  let close: (() => void) | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let cursor: EventCursor | null = null
  let generation = 0,
    attempts = 0,
    disposed = false,
    hidden = document.visibilityState !== 'visible'
  function stop() {
    generation++
    clearTimeout(retry)
    close?.()
    close = undefined
    connected.value = false
  }
  function connect() {
    stop()
    const access = gateway.access(),
      epoch = generation
    if (disposed || hidden || !access) return
    const disconnected = (policy = false) => {
      if (disposed || epoch !== generation) return
      stop()
      if (policy) {
        gateway.reauthenticate()
        return
      }
      retry = setTimeout(
        connect,
        Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)) + Math.random() * 500,
      )
    }
    try {
      close = gateway.connect(
        access,
        cursor,
        (message) => {
          if (disposed || epoch !== generation) return
          cursor = message.cursor
          connected.value = true
          attempts = 0
          const resources =
            message.type === 'ready' || message.type === 'resync'
              ? (Object.keys(revisions) as LiveResource[])
              : message.resources
          for (const resource of resources) revisions[resource]++
        },
        disconnected,
      )
    } catch {
      disconnected()
    }
  }
  const stopWatch = watch(
    () => {
      const access = gateway.access()
      return access
        ? `${access.context.daemonEpoch}:${access.context.sessionId}:${access.csrfToken}`
        : ''
    },
    () => {
      cursor = null
      attempts = 0
      connect()
    },
    { immediate: true, flush: 'sync' },
  )
  const visibility = () => {
    hidden = document.visibilityState !== 'visible'
    connect()
  }
  const suspend = () => {
    hidden = true
    stop()
  }
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pagehide', suspend)
  window.addEventListener('pageshow', visibility)
  return {
    connected: readonly(connected),
    revisions: readonly(revisions),
    dispose() {
      disposed = true
      stopWatch()
      stop()
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', suspend)
      window.removeEventListener('pageshow', visibility)
    },
  }
}
