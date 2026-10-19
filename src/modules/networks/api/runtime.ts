import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type OperationGateway, type OperationTracking, type Task } from '../../tasks'

type Schemas = components['schemas']
export type NetworkDetail = Schemas['NetworkDetail']
export type NetworkOperation = Omit<Schemas['NetworkOperationRequest'], 'context'>
export interface NetworkRuntimeGateway extends OperationGateway<NetworkOperation> {
  tracking?: OperationTracking<NetworkOperation>
  inspectSupported(): boolean
  read(id: string, signal: AbortSignal): Promise<NetworkDetail>
}
interface Access {
  context: Schemas['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const detailValid = compileContract<NetworkDetail>('NetworkDetail')
const taskValid = compileContract<Schemas['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<Schemas['VmOperationLookup']>('VmOperationLookup')
const requestValid = compileContract<Schemas['NetworkOperationRequest']>('NetworkOperationRequest')
const invalid = () => new ApiError('invalid-response', 'Invalid network observation')
export function validTrackedNetworkOperation(request: unknown): request is NetworkOperation {
  if (
    !request ||
    typeof request !== 'object' ||
    Array.isArray(request) ||
    Object.keys(request).sort().join(',') !== 'action,expected,networkId,requestId'
  )
    return false
  const body = { ...request, context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) } }
  return requestValid(body) && BigInt(body.expected.generation) <= 18446744073709551615n
}
export function createNetworkRuntimeGateway(
  client: HttpClient,
  access: () => Access | null,
): NetworkRuntimeGateway {
  const permits = (write: boolean) => {
    const current = access()
    return (
      !!current?.administrator &&
      current.capabilities.includes('networks.inspect.v1') &&
      (!write || (current.manageTasks && current.capabilities.includes('networks.lifecycle.v1')))
    )
  }
  function current(write: boolean) {
    const value = access()
    if (!value) throw new ApiError('unauthenticated', 'Session required')
    if (!permits(write)) throw new ApiError('unsupported', 'Network operation unavailable')
    return value
  }
  function identity(value: { context: Access['context'] }, expected: Access['context']) {
    if (
      value.context.daemonEpoch !== expected.daemonEpoch ||
      value.context.sessionId !== expected.sessionId
    )
      throw new ApiError('context-changed', 'Network observation identity changed')
  }
  function task(value: Task, requestId: string) {
    if (
      value.requestId !== requestId ||
      value.kind !== 'network_lifecycle' ||
      value.resource !== 'networks'
    )
      throw invalid()
    checkTask(value)
    return value
  }
  return {
    tracking: {
      namespace: 'network-runtime',
      valid: validTrackedNetworkOperation,
      key: (request) => request.networkId,
    },
    supported: () => permits(true),
    inspectSupported: () => permits(false),
    async read(id, signal) {
      const expected = current(false)
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw invalid()
      const value = await client.getJson(`/api/v1/networks/${id}`, signal)
      if (!detailValid(value)) throw invalid()
      identity(value, expected.context)
      if (value.network.id !== id || BigInt(value.runtime.generation) > 18446744073709551615n)
        throw invalid()
      if (
        [value.addresses, value.interfaces, value.pd, value.neighbors, value.leases].some(
          (rows) => (value.liveState === 'observed') !== Array.isArray(rows),
        ) ||
        new Set(value.attachments.map((item) => `${item.vmId}:${item.slot}`)).size !==
          value.attachments.length
      )
        throw invalid()
      return value
    },
    async submit(request, signal) {
      const expected = current(true)
      if (!validTrackedNetworkOperation(request))
        throw new ApiError('conflict', 'Invalid network operation')
      const value = await client.postJson(
        '/api/v1/network-operations',
        { ...request, context: expected.context },
        signal,
        { csrf: expected.csrfToken, status: 202 },
      )
      if (!taskValid(value)) throw invalid()
      identity(value, expected.context)
      return task(value.task, request.requestId)
    },
    async find(request, signal) {
      const expected = current(true)
      if (!validTrackedNetworkOperation(request))
        throw new ApiError('conflict', 'Invalid network operation')
      const value = await client.getJson(
        `/api/v1/network-operations/${encodeURIComponent(request.requestId)}`,
        signal,
      )
      if (!lookupValid(value)) throw invalid()
      identity(value, expected.context)
      return value.task ? task(value.task, request.requestId) : null
    },
  }
}
