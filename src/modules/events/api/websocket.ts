import { EventNotification as validateNotification } from '../../../generated/validators.js'
import type { EventAccess, EventCursor, EventGateway, EventNotification } from './gateway'

export function createEventGateway(
  access: () => EventAccess | null,
  reauthenticate: () => void,
): EventGateway {
  return {
    access,
    reauthenticate,
    connect(session, cursor, receive, closed) {
      const url = new URL('/api/v1/events', location.origin)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(url, 'droidvm.events.v1')
      let disposed = false,
        ready = false
      let previous: EventCursor | null = cursor
      // Also bounds a silent upgrade / a server which stops emitting heartbeat.
      let watchdog = setTimeout(() => socket.close(), 10_000)
      socket.onopen = () => {
        if (disposed) return
        socket.send(
          JSON.stringify({
            type: 'subscribe',
            context: session.context,
            csrfToken: session.csrfToken,
            cursor,
          }),
        )
      }
      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (disposed) return
        try {
          if (typeof event.data !== 'string' || event.data.length > 4096)
            throw new Error('Invalid event frame')
          const message: unknown = JSON.parse(event.data)
          if (!validateNotification(message)) throw new Error('Invalid event notification')
          const value = message as EventNotification
          if (
            value.context.daemonEpoch !== session.context.daemonEpoch ||
            value.context.sessionId !== session.context.sessionId ||
            value.cursor.epoch !== session.context.daemonEpoch ||
            BigInt(value.cursor.sequence) > 18446744073709551615n ||
            (!ready && !['ready', 'resync'].includes(value.type)) ||
            (ready && value.type === 'ready') ||
            (previous &&
              value.type !== 'resync' &&
              BigInt(value.cursor.sequence) < BigInt(previous.sequence)) ||
            (value.type !== 'invalidate' && value.resources.length)
          )
            throw new Error('Event context or order changed')
          ready = true
          previous = value.cursor
          clearTimeout(watchdog)
          watchdog = setTimeout(() => socket.close(), 40_000)
          receive(value)
        } catch {
          socket.close(1002, 'Invalid notification')
        }
      }
      socket.onclose = (event) => {
        clearTimeout(watchdog)
        if (!disposed) closed(event.code === 1008)
      }
      // Browser errors are followed by close; never log URLs, credentials or frames.
      socket.onerror = () => undefined
      return () => {
        disposed = true
        clearTimeout(watchdog)
        socket.onmessage = null
        socket.close()
      }
    },
  }
}
