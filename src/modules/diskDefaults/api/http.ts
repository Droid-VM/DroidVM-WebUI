import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type OperationGateway, type OperationTracking } from '../../tasks'

export type DiskDefaultObservation = components['schemas']['DiskDefaultObservation']
export type DiskDefaultValues = DiskDefaultObservation['values']
export type DiskDefaultRequest = Omit<
  components['schemas']['DiskDefaultOperationRequest'],
  'context'
>
export interface DiskDefaultGateway extends OperationGateway<DiskDefaultRequest> {
  tracking?: OperationTracking<DiskDefaultRequest>
  rememberTracking?: OperationTracking<DiskDefaultRequest>
  readable(): boolean
  read(signal: AbortSignal): Promise<DiskDefaultObservation>
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  administrator: boolean
  manageTasks: boolean
  csrfToken: string
}
const observationValid = compileContract<DiskDefaultObservation>('DiskDefaultObservation')
const requestValid = compileContract<components['schemas']['DiskDefaultOperationRequest']>(
  'DiskDefaultOperationRequest',
)
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
export function validTrackedDiskDefaultRequest(request: unknown): request is DiskDefaultRequest {
  if (
    !request ||
    typeof request !== 'object' ||
    Array.isArray(request) ||
    Object.keys(request).sort().join(',') !== 'changes,expected,requestId'
  )
    return false
  return requestValid({
    ...request,
    context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) },
  })
}
export function validTrackedDiskRememberRequest(request: unknown): request is DiskDefaultRequest {
  return (
    validTrackedDiskDefaultRequest(request) &&
    Object.keys(request.changes).join(',') === 'optimizeCompression' &&
    request.changes.optimizeCompression === 'none'
  )
}
function sameDefault(a: unknown, b: unknown) {
  const normalize = (value: unknown) =>
    Array.isArray(value) ? [...value].sort((a, b) => Number(a) - Number(b)) : value
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}
const path = '/api/v1/disk-default-operations'
export function createDiskDefaultGateway(
  client: HttpClient,
  access: () => Access | null,
): DiskDefaultGateway {
  const readable = () =>
    !!access()?.administrator && !!access()?.capabilities.includes('host.disk-defaults.v1')
  const supported = () => readable() && !!access()?.manageTasks
  function requireAccess(write: boolean) {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!(write ? supported() : readable()))
      throw new ApiError('unsupported', 'Disk defaults unavailable')
    return current
  }
  function context(value: components['schemas']['ServerContext'], current: Access) {
    if (
      value.daemonEpoch !== current.context.daemonEpoch ||
      value.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Disk defaults session changed')
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    current: Access,
    request: DiskDefaultRequest,
  ) {
    context(value.context, current)
    const task = value.task
    if (!task) return null
    checkTask(task)
    if (
      task.kind !== 'disk_defaults' ||
      task.resource !== 'disk-defaults' ||
      task.requestId !== request.requestId
    )
      throw new ApiError('invalid-response', 'Unexpected disk default task')
    const receipt = task.diskDefaultResult
    const queuedCancel =
      task.state === 'cancelled' &&
      receipt?.expected === null &&
      receipt.values === null &&
      receipt.revision === null &&
      receipt.saved === false &&
      receipt.uncertain === false
    if (receipt && !queuedCancel && receipt.expected?.revision !== request.expected.revision)
      throw new ApiError('invalid-response', 'Unexpected disk default receipt')
    if (
      task.state === 'succeeded' &&
      (!receipt?.saved || receipt.uncertain || !receipt.values || receipt.revision === null)
    )
      throw new ApiError('invalid-response', 'Incomplete disk default success receipt')
    if (
      receipt?.saved &&
      (!receipt.values ||
        receipt.revision === null ||
        Object.entries(request.changes).some(
          ([key, expected]) =>
            !sameDefault(receipt.values?.[key as keyof DiskDefaultValues], expected),
        ))
    )
      throw new ApiError('invalid-response', 'Saved disk defaults differ from the request')
    if (['succeeded', 'failed', 'cancelled'].includes(task.state) && !receipt)
      throw new ApiError('invalid-response', 'Missing disk default receipt')
    return task
  }
  return {
    tracking: {
      namespace: 'disk-defaults',
      valid: validTrackedDiskDefaultRequest,
      key: () => 'disk-defaults',
    },
    rememberTracking: {
      namespace: 'disk-defaults-remember',
      valid: validTrackedDiskRememberRequest,
      key: () => 'optimize-compression',
    },
    readable,
    supported,
    async read(signal) {
      const current = requireAccess(false)
      const value = await client.getJson('/api/v1/host/disk-defaults', signal)
      if (!observationValid(value)) throw new ApiError('invalid-response', 'Invalid disk defaults')
      context(value.context, current)
      return value
    },
    async submit(request, signal) {
      const current = requireAccess(true),
        body = { ...request, context: current.context }
      if (!validTrackedDiskDefaultRequest(request) || !requestValid(body))
        throw new ApiError('conflict', 'Invalid disk default request')
      const value = await client.postJson(path, body, signal, {
        csrf: current.csrfToken,
        status: 202,
      })
      if (!responseValid(value)) throw new ApiError('invalid-response', 'Invalid disk default task')
      const task = verify(value, current, request)
      if (!task) throw new ApiError('invalid-response', 'Missing disk default task')
      return task
    },
    async find(request, signal) {
      const current = requireAccess(true)
      if (!validTrackedDiskDefaultRequest(request))
        throw new ApiError('conflict', 'Invalid disk default request')
      const value = await client.getJson(`${path}/${encodeURIComponent(request.requestId)}`, signal)
      if (!lookupValid(value)) throw new ApiError('invalid-response', 'Invalid disk default lookup')
      return verify(value, current, request)
    },
  }
}
