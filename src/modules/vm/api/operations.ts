import type { components, paths } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type Task, type OperationTracking } from '../../tasks'

export type VmAction = components['schemas']['VmAction']
export type VmOperation = Omit<components['schemas']['VmOperationRequest'], 'context'>
export interface VmActionGateway {
  tracking?: OperationTracking<VmOperation>
  supported(): boolean
  submit(operation: VmOperation, signal: AbortSignal): Promise<Task>
  find(operation: VmOperation, signal: AbortSignal): Promise<Task | null>
}
interface VmActionAccess {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const submitPath = '/api/v1/vm-operations' satisfies keyof paths
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
const requestValid =
  compileContract<components['schemas']['VmOperationRequest']>('VmOperationRequest')

export function validTrackedVmOperation(request: unknown): request is VmOperation {
  if (!request || typeof request !== 'object' || Array.isArray(request) || 'context' in request)
    return false
  const body = { ...request, context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) } }
  return (
    requestValid(body) &&
    BigInt(body.expected.revision) <= 18446744073709551615n &&
    (body.action !== 'start' || body.expected.configRevision !== null)
  )
}

export function createHttpVmActionGateway(
  client: HttpClient,
  access: () => VmActionAccess | null,
): VmActionGateway {
  const permitted = (current: VmActionAccess | null) =>
    !!current?.administrator &&
    current.manageTasks &&
    current.capabilities.includes('vm.lifecycle.v1')
  function requireAccess() {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!permitted(current)) throw new ApiError('unsupported', 'VM lifecycle unavailable')
    return current
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    expected: VmActionAccess,
    request: VmOperation,
  ) {
    if (
      value.context.daemonEpoch !== expected.context.daemonEpoch ||
      value.context.sessionId !== expected.context.sessionId
    )
      throw new ApiError('context-changed', 'Server or browser session changed')
    if (value.task) {
      checkTask(value.task)
      if (
        value.task.requestId !== request.requestId ||
        value.task.resource !== `vm:${request.vmId}` ||
        value.task.kind !== `vm_${request.action}`
      )
        throw new ApiError('invalid-response', 'Unexpected VM operation identity')
    }
    return value.task
  }
  return {
    tracking: { namespace: 'vm', valid: validTrackedVmOperation, key: (request) => request.vmId },
    supported: () => permitted(access()),
    async submit(operation, signal) {
      const current = requireAccess()
      const body = { ...operation, context: current.context }
      if (
        !requestValid(body) ||
        BigInt(body.expected.revision) > 18446744073709551615n ||
        (body.action === 'start' && body.expected.configRevision === null)
      )
        throw new ApiError('conflict', 'Invalid VM observation')
      const value = await client.postJson(submitPath, body, signal, {
        csrf: current.csrfToken,
        status: 202,
      })
      if (!responseValid(value))
        throw new ApiError('invalid-response', 'Invalid VM operation response')
      verify(value, current, operation)
      return value.task
    },
    async find(operation, signal) {
      const current = requireAccess()
      const value = await client.getJson(
        `/api/v1/vm-operations/${encodeURIComponent(operation.requestId)}`,
        signal,
      )
      if (!lookupValid(value)) throw new ApiError('invalid-response', 'Invalid VM operation lookup')
      return verify(value, current, operation)
    },
  }
}
