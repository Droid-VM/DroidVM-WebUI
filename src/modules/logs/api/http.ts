import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import type { LogGateway, LogList } from './gateway'

interface LogAccess {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
}
const listValid = compileContract<LogList>('VmLogList')
const chunkValid = compileContract<components['schemas']['VmLogChunk']>('VmLogChunk')
const invalid = () => new ApiError('invalid-response', 'Invalid log response')
export function createHttpLogGateway(
  client: HttpClient,
  access: () => LogAccess | null,
): LogGateway {
  const permitted = (current: LogAccess | null) =>
    !!current?.administrator && current.capabilities.includes('vm.logs.v1')
  function requireAccess() {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!permitted(current)) throw new ApiError('unsupported', 'VM logs unavailable')
    return current
  }
  function context(actual: LogAccess['context'], expected: LogAccess['context']) {
    if (actual.daemonEpoch !== expected.daemonEpoch || actual.sessionId !== expected.sessionId)
      throw new ApiError('context-changed', 'Server or browser session changed')
  }
  return {
    supported: () => permitted(access()),
    async list(vmId, signal) {
      const current = requireAccess()
      const value = await client.getJson(`/api/v1/vm-logs/${encodeURIComponent(vmId)}`, signal)
      if (!listValid(value) || value.vmId !== vmId || value.streams.includes('agent'))
        throw invalid()
      context(value.context, current.context)
      return value
    },
    async read(request, signal) {
      const current = requireAccess()
      const value = await client.postJson(
        '/api/v1/vm-logs/read',
        { ...request, context: current.context },
        signal,
        { csrf: current.csrfToken, status: 200 },
      )
      if (!chunkValid(value)) throw invalid()
      context(value.context, current.context)
      if (
        value.vmId !== request.vmId ||
        value.instanceId !== request.instanceId ||
        value.stream !== request.stream
      )
        throw invalid()
      const floor = BigInt(value.floor),
        start = BigInt(value.start),
        next = BigInt(value.next),
        end = BigInt(value.end)
      if (
        floor > start ||
        start > next ||
        next > end ||
        end > 18446744073709551615n ||
        end - floor > 1048576n ||
        next - start > 65536n ||
        value.more !== next < end
      )
        throw invalid()
      let bytes: Uint8Array
      try {
        const raw = atob(value.data)
        if (btoa(raw) !== value.data) throw invalid()
        bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0))
      } catch {
        throw invalid()
      }
      if (
        BigInt(bytes.length) !== next - start ||
        next - start !== (end - start > 65536n ? 65536n : end - start)
      )
        throw invalid()
      if (request.cursor) {
        if (value.reset) {
          if (
            start !== floor ||
            (value.generation === request.cursor.generation &&
              BigInt(request.cursor.offset) >= floor)
          )
            throw invalid()
        } else if (
          value.generation !== request.cursor.generation ||
          value.start !== request.cursor.offset
        )
          throw invalid()
      } else {
        const expected = request.tail && end - floor > 65536n ? end - 65536n : floor
        if (value.reset || start !== expected) throw invalid()
      }
      return { ...value, bytes }
    },
  }
}
