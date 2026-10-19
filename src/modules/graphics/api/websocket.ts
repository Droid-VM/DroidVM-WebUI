import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import type { DisplayMetadata, VmGraphicsGateway } from './gateway'

interface Access {
  context: components['schemas']['ServerContext']
  csrfToken: string
  administrator: boolean
  capabilities: readonly string[]
}
const validMetadata = compileContract<DisplayMetadata>('VmDisplayMetadata')
const validReady = compileContract<components['schemas']['VmDisplayReady']>('VmDisplayReady')
const invalid = () => new ApiError('invalid-response', 'Invalid graphics response')
function contextMatches(actual: Access['context'], expected: Access['context']) {
  return actual.daemonEpoch === expected.daemonEpoch && actual.sessionId === expected.sessionId
}
export function createVmGraphicsGateway(
  client: HttpClient,
  access: () => Access | null,
  options: { origin?: string; create?: (url: string, protocol: string) => WebSocket } = {},
): VmGraphicsGateway {
  const supported = () =>
    !!access()?.administrator && !!access()?.capabilities.includes('vm.display.v1')
  function requireAccess() {
    const value = access()
    if (!value) throw new ApiError('unauthenticated', 'Session required')
    if (!supported()) throw new ApiError('unsupported', 'Graphics unavailable')
    return value
  }
  return {
    supported,
    async read(vmId, signal) {
      const current = requireAccess()
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(vmId)) throw invalid()
      const value = await client.getJson(`/api/v1/vm-displays/${vmId}`, signal)
      if (
        !validMetadata(value) ||
        value.vmId !== vmId ||
        BigInt(value.expected.revision) > 18446744073709551615n ||
        new Set(value.screens.map((screen) => screen.id)).size !== value.screens.length
      )
        throw invalid()
      if (!contextMatches(value.context, current.context))
        throw new ApiError('context-changed', 'Graphics identity changed')
      return value
    },
    connect(metadata, screenId, observer) {
      const current = requireAccess()
      if (!contextMatches(metadata.context, current.context))
        throw new ApiError('context-changed', 'Graphics identity changed')
      if (!metadata.screens.some((screen) => screen.id === screenId && screen.available))
        throw invalid()
      const url = new URL('/api/v1/display', options.origin ?? location.origin)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = options.create
        ? options.create(url.toString(), 'droidvm.display.v1')
        : new WebSocket(url, 'droidvm.display.v1')
      socket.binaryType = 'arraybuffer'
      let disposed = false,
        accepted = false
      const timer = setTimeout(
        () => fail(new ApiError('timeout', 'Graphics handshake timed out')),
        10_000,
      )
      function close() {
        if (disposed) return
        disposed = true
        clearTimeout(timer)
        socket.removeEventListener('close', closed)
        socket.onopen = socket.onmessage = socket.onerror = null
        socket.close()
      }
      function fail(cause: ApiError) {
        if (disposed) return
        close()
        observer.closed(cause)
      }
      function closed(event: CloseEvent) {
        fail(
          new ApiError(
            event.code === 1008
              ? 'permission-denied'
              : event.code === 1002
                ? 'invalid-response'
                : 'offline',
            'Graphics disconnected',
          ),
        )
      }
      socket.addEventListener('close', closed)
      socket.onerror = () => undefined
      socket.onopen = () => {
        if (disposed) return
        socket.send(
          JSON.stringify({
            type: 'open',
            context: current.context,
            csrfToken: current.csrfToken,
            vmId: metadata.vmId,
            screenId,
            expected: metadata.expected,
          }),
        )
      }
      socket.onmessage = (event) => {
        try {
          if (disposed || accepted || typeof event.data !== 'string' || event.data.length > 16384)
            throw invalid()
          const value: unknown = JSON.parse(event.data)
          if (
            !validReady(value) ||
            !contextMatches(value.context, current.context) ||
            value.vmId !== metadata.vmId ||
            value.screenId !== screenId ||
            value.expected.instanceId !== metadata.expected.instanceId ||
            value.expected.revision !== metadata.expected.revision
          )
            throw invalid()
          accepted = true
          clearTimeout(timer)
          // Hand off synchronously, before the next binary WebSocket message can arrive.
          socket.onmessage = socket.onopen = null
          observer.ready(socket, value.password)
          value.password = ''
        } catch (cause) {
          fail(cause instanceof ApiError ? cause : invalid())
        }
      }
      return { close }
    },
  }
}
