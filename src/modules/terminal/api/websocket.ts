import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import type {
  TerminalCursor,
  TerminalMessage,
  TerminalMetadata,
  VmTerminalGateway,
} from './gateway'

interface Access {
  context: components['schemas']['ServerContext']
  csrfToken: string
  administrator: boolean
  capabilities: readonly string[]
}
type TerminalSocket = Pick<
  WebSocket,
  | 'onopen'
  | 'onmessage'
  | 'onclose'
  | 'onerror'
  | 'send'
  | 'close'
  | 'readyState'
  | 'bufferedAmount'
>
export interface TerminalSocketOptions {
  create?: (url: string, protocol: string) => TerminalSocket
  origin?: string
  scope?: 'vm' | 'agent-rescue'
}
const metadataValid = compileContract<TerminalMetadata>('VmTerminalMetadata')
const messageValid = compileContract<TerminalMessage>('VmTerminalMessage')
const invalid = () => new ApiError('invalid-response', 'Invalid terminal frame')
const limit64 = 18446744073709551615n
function sameContext(actual: Access['context'], expected: Access['context']) {
  if (actual.daemonEpoch !== expected.daemonEpoch || actual.sessionId !== expected.sessionId)
    throw new ApiError('context-changed', 'Terminal identity changed')
}
export function createVmTerminalGateway(
  client: HttpClient,
  access: () => Access | null,
  options: TerminalSocketOptions = {},
): VmTerminalGateway {
  // This selector is a composition-root constant, never a server-provided URL.
  const rescue = options.scope === 'agent-rescue'
  const metadataPath = rescue ? '/api/v1/agent-rescue-terminals/' : '/api/v1/vm-terminals/'
  const socketPath = rescue ? '/api/v1/agent-rescue-terminal' : '/api/v1/terminal'
  const permitted = (current: Access | null) =>
    !!current?.administrator &&
    current.capabilities.includes(rescue ? 'agent.rescue.v1' : 'vm.terminal.v1')
  function requireAccess() {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!permitted(current))
      throw new ApiError('unsupported', 'Interactive serial terminal unavailable')
    return current
  }
  return {
    supported: () => permitted(access()),
    async read(vmId, signal) {
      const current = requireAccess()
      if (!(rescue ? /^[a-f0-9]{64}$/ : /^[A-Za-z0-9_-]{1,128}$/).test(vmId)) throw invalid()
      const value = await client.getJson(`${metadataPath}${vmId}`, signal)
      if (
        !metadataValid(value) ||
        value.vmId !== vmId ||
        value.streams.includes('agent') ||
        new Set(value.streams).size !== value.streams.length ||
        BigInt(value.expected.revision) > limit64
      )
        throw invalid()
      sameContext(value.context, current.context)
      return value
    },
    connect(metadata, stream, cursor, observer) {
      const current = requireAccess()
      sameContext(metadata.context, current.context)
      if (!metadata.streams.includes(stream) || stream === 'agent') throw invalid()
      const url = new URL(socketPath, options.origin ?? location.origin)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = options.create
        ? options.create(url.toString(), 'droidvm.terminal.v1')
        : new WebSocket(url, 'droidvm.terminal.v1')
      let disposed = false,
        ready = false
      let previous = cursor,
        pending: TerminalCursor | null = null
      let watchdog: ReturnType<typeof setTimeout> | undefined
      function close() {
        disposed = true
        clearTimeout(watchdog)
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
        socket.close()
      }
      function fail(cause: ApiError) {
        if (disposed) return
        close()
        observer.closed(cause)
      }
      function deadline(milliseconds: number) {
        clearTimeout(watchdog)
        if (disposed) return
        watchdog = setTimeout(
          () => fail(new ApiError('timeout', 'Terminal stopped responding')),
          milliseconds,
        )
      }
      function send(value: object) {
        if (disposed || socket.readyState !== 1) return false
        try {
          if (socket.bufferedAmount > 32 * 1024)
            throw new ApiError('unavailable', 'Terminal send buffer exceeded')
          socket.send(JSON.stringify(value))
          return true
        } catch (cause) {
          fail(cause instanceof ApiError ? cause : new ApiError('offline', 'Terminal disconnected'))
          return false
        }
      }
      deadline(10_000)
      socket.onopen = () => {
        if (disposed) return
        send({
          type: 'open',
          context: current.context,
          csrfToken: current.csrfToken,
          vmId: metadata.vmId,
          expected: metadata.expected,
          stream,
          cursor,
        })
      }
      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (disposed) return
        try {
          if (typeof event.data !== 'string' || event.data.length > 96 * 1024) throw invalid()
          const value: unknown = JSON.parse(event.data)
          if (!messageValid(value)) throw invalid()
          sameContext(value.context, current.context)
          if (!ready && value.type !== 'ready') throw invalid()
          if (value.type === 'ready') {
            if (
              ready ||
              value.vmId !== metadata.vmId ||
              value.stream !== stream ||
              value.expected.instanceId !== metadata.expected.instanceId ||
              value.expected.revision !== metadata.expected.revision
            )
              throw invalid()
            ready = true
            observer.ready()
          } else if (value.type === 'output') {
            if (pending) throw invalid()
            const floor = BigInt(value.floor),
              start = BigInt(value.start),
              next = BigInt(value.next),
              end = BigInt(value.end)
            if (
              floor > start ||
              start > next ||
              next > end ||
              end > limit64 ||
              end - floor > 1048576n ||
              next - start > 65536n ||
              value.more !== next < end
            )
              throw invalid()
            const raw = atob(value.data)
            if (
              btoa(raw) !== value.data ||
              BigInt(raw.length) !== next - start ||
              next - start !== (end - start > 65536n ? 65536n : end - start)
            )
              throw invalid()
            if (previous) {
              if (
                value.reset
                  ? start !== floor ||
                    (value.generation === previous.generation && BigInt(previous.offset) >= floor)
                  : value.generation !== previous.generation || value.start !== previous.offset
              )
                throw invalid()
            } else if (value.reset || start !== (end - floor > 65536n ? end - 65536n : floor))
              throw invalid()
            pending = { generation: value.generation, offset: value.next }
            observer.output({
              ...value,
              bytes: Uint8Array.from(raw, (character) => character.charCodeAt(0)),
            })
          } else if (value.type === 'ack') {
            if (BigInt(value.sequence) > limit64) throw invalid()
            observer.acknowledged(value.sequence, value.accepted)
          }
          deadline(40_000)
        } catch (cause) {
          fail(cause instanceof ApiError ? cause : invalid())
        }
      }
      socket.onclose = (event) =>
        fail(
          new ApiError(
            event.code === 1008
              ? 'permission-denied'
              : event.code === 1002
                ? 'invalid-response'
                : 'offline',
            'Terminal disconnected',
          ),
        )
      socket.onerror = () => undefined
      return {
        input(sequence, bytes) {
          if (
            !ready ||
            !/^[1-9][0-9]{0,19}$/.test(sequence) ||
            BigInt(sequence) > limit64 ||
            !bytes.length ||
            bytes.length > 512
          )
            return false
          return send({ type: 'input', sequence, data: btoa(String.fromCharCode(...bytes)) })
        },
        acknowledge(value) {
          if (
            !ready ||
            !pending ||
            value.generation !== pending.generation ||
            value.offset !== pending.offset
          )
            return false
          previous = value
          pending = null
          return send({ type: 'ackOutput', generation: value.generation, offset: value.offset })
        },
        close,
      }
    },
  }
}
