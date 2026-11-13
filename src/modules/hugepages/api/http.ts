import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type OperationGateway, type OperationTracking } from '../../tasks'

export type HugepageObservation = components['schemas']['HugepageObservation']
export type HugepageRequest = Omit<components['schemas']['HugepageOperationRequest'], 'context'>
export type HugepageOperation = HugepageRequest['operation']
export interface HugepageGateway extends OperationGateway<HugepageRequest> {
  tracking?: OperationTracking<HugepageRequest>
  readable(): boolean
  management(): boolean
  read(signal: AbortSignal): Promise<HugepageObservation>
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  administrator: boolean
  manageTasks: boolean
  csrfToken: string
}
const observationValid = compileContract<HugepageObservation>('HugepageObservation')
const requestValid = compileContract<components['schemas']['HugepageOperationRequest']>(
  'HugepageOperationRequest',
)
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
const path = '/api/v1/hugepage-operations'
export function validTrackedHugepageRequest(request: unknown): request is HugepageRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request) || 'context' in request)
    return false
  const body = { ...request, context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) } }
  if (!requestValid(body)) return false
  const operation = body.operation
  if (operation.kind === 'targets')
    return [operation.poolPages, operation.cmaPages].every(
      (value) => value === null || BigInt(value) <= 1073741824n,
    )
  if (operation.kind === 'cma' || operation.kind === 'cma-save')
    return BigInt(operation.pages) <= 1073741824n
  return true
}
function quantities(value: components['schemas']['HugepageSnapshot']) {
  for (const key of [
    'consumerPages',
    'manualPoolPages',
    'actualPoolPages',
    'actualCmaPages',
    'savedPoolPages',
    'savedCmaPages',
    'poolTotalPages',
    'poolAvailablePages',
    'servedPages',
    'cmaPoolPages',
    'cmaLentPages',
  ] as const) {
    const amount = value[key]
    if (amount != null && BigInt(amount) > 18446744073709551615n)
      throw new ApiError('invalid-response', 'Invalid hugepage quantity')
  }
}
export function createHugepageGateway(
  client: HttpClient,
  access: () => Access | null,
): HugepageGateway {
  const readable = () =>
    !!access()?.administrator && !!access()?.capabilities.includes('host.hugepages.v1')
  const supported = () => readable() && !!access()?.manageTasks
  const management = () =>
    supported() && !!access()?.capabilities.includes('host.hugepages.manage.v1')
  function requireAccess(write: boolean) {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!(write ? supported() : readable()))
      throw new ApiError('unsupported', 'Hugepage management unavailable')
    return current
  }
  function context(value: components['schemas']['ServerContext'], current: Access) {
    if (
      value.daemonEpoch !== current.context.daemonEpoch ||
      value.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Hugepage identity changed')
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    current: Access,
    request: HugepageRequest,
  ) {
    context(value.context, current)
    if (value.task) {
      checkTask(value.task)
      if (
        value.task.kind !== 'hugepage_operation' ||
        value.task.resource !== 'hugepages' ||
        value.task.requestId !== request.requestId
      )
        throw new ApiError('invalid-response', 'Unexpected hugepage operation')
      if (value.task.hugepageResult?.snapshot) quantities(value.task.hugepageResult.snapshot)
    }
    return value.task
  }
  return {
    tracking: {
      namespace: 'hugepages',
      valid: validTrackedHugepageRequest,
      key: () => 'hugepages',
    },
    readable,
    supported,
    management,
    async read(signal) {
      const current = requireAccess(false)
      const value = await client.getJson('/api/v1/host/hugepages', signal)
      if (!observationValid(value))
        throw new ApiError('invalid-response', 'Invalid hugepage observation')
      context(value.context, current)
      quantities(value)
      return value
    },
    async submit(request, signal) {
      const current = requireAccess(true),
        body = { ...request, context: current.context }
      if (!['targets', 'acquire', 'stop-acquire'].includes(request.operation.kind) && !management())
        throw new ApiError('unsupported', 'Complete hugepage management unavailable')
      if (!requestValid(body)) throw new ApiError('conflict', 'Invalid hugepage operation')
      if (
        request.operation.kind === 'targets' &&
        [request.operation.poolPages, request.operation.cmaPages].some(
          (value) => value !== null && BigInt(value) > 1073741824n,
        )
      )
        throw new ApiError('conflict', 'Hugepage target out of range')
      if (
        (request.operation.kind === 'cma' || request.operation.kind === 'cma-save') &&
        BigInt(request.operation.pages) > 1073741824n
      )
        throw new ApiError('conflict', 'CMA target out of range')
      const value = await client.postJson(path, body, signal, {
        csrf: current.csrfToken,
        status: 202,
      })
      if (!responseValid(value)) throw new ApiError('invalid-response', 'Invalid hugepage task')
      verify(value, current, request)
      return value.task
    },
    async find(request, signal) {
      const current = requireAccess(true)
      const value = await client.getJson(`${path}/${encodeURIComponent(request.requestId)}`, signal)
      if (!lookupValid(value)) throw new ApiError('invalid-response', 'Invalid hugepage lookup')
      return verify(value, current, request)
    },
  }
}
