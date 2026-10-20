import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type OperationGateway, type OperationTracking } from '../../tasks'

export type AndroidDisplayObservation = components['schemas']['AndroidDisplayObservation']
export type AndroidDisplayRequest = Omit<
  components['schemas']['AndroidDisplayOperationRequest'],
  'context'
>
export type AndroidDisplayOperation = AndroidDisplayRequest['operation']
export interface AndroidDisplayGateway extends OperationGateway<AndroidDisplayRequest> {
  tracking?: OperationTracking<AndroidDisplayRequest>
  readable(): boolean
  read(signal: AbortSignal): Promise<AndroidDisplayObservation>
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  administrator: boolean
  manageTasks: boolean
  csrfToken: string
}
const observationValid = compileContract<AndroidDisplayObservation>('AndroidDisplayObservation')
const requestValid = compileContract<components['schemas']['AndroidDisplayOperationRequest']>(
  'AndroidDisplayOperationRequest',
)
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
const path = '/api/v1/android-display-operations'
export function validTrackedAndroidDisplayRequest(
  request: unknown,
): request is AndroidDisplayRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request) || 'context' in request)
    return false
  return requestValid({
    ...request,
    context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) },
  })
}
export function createAndroidDisplayGateway(
  client: HttpClient,
  access: () => Access | null,
): AndroidDisplayGateway {
  const readable = () =>
    !!access()?.administrator && !!access()?.capabilities.includes('host.android-display.v1')
  const supported = () => readable() && !!access()?.manageTasks
  function requireAccess(write: boolean) {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!(write ? supported() : readable()))
      throw new ApiError('unsupported', 'Android display control unavailable')
    return current
  }
  function context(value: components['schemas']['ServerContext'], current: Access) {
    if (
      value.daemonEpoch !== current.context.daemonEpoch ||
      value.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Android display session changed')
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    current: Access,
    request: AndroidDisplayRequest,
  ) {
    context(value.context, current)
    const task = value.task
    if (!task) return null
    checkTask(task)
    if (
      task.kind !== 'android_display' ||
      task.resource !== 'android-display' ||
      task.requestId !== request.requestId
    )
      throw new ApiError('invalid-response', 'Unexpected Android display task')
    const receipt = task.androidDisplayResult
    const queuedCancel =
      task.state === 'cancelled' &&
      receipt?.expected === null &&
      receipt.kind === null &&
      receipt.stopped === false &&
      receipt.restored === false &&
      receipt.uncertain === false
    if (receipt && !queuedCancel) {
      if (
        receipt.expected?.revision !== request.expected.revision ||
        receipt.kind !== request.operation.kind
      )
        throw new ApiError('invalid-response', 'Unexpected Android display receipt')
      if (
        task.state === 'succeeded' &&
        (request.operation.kind === 'stop' ? !receipt.stopped : !receipt.restored)
      )
        throw new ApiError('invalid-response', 'Incomplete Android display success receipt')
    }
    if (['succeeded', 'failed', 'cancelled'].includes(task.state) && !receipt)
      throw new ApiError('invalid-response', 'Missing Android display receipt')
    return task
  }
  return {
    tracking: {
      namespace: 'android-display',
      valid: validTrackedAndroidDisplayRequest,
      key: () => 'android-display',
    },
    readable,
    supported,
    async read(signal) {
      const current = requireAccess(false)
      const value = await client.getJson('/api/v1/host/android-display', signal)
      if (!observationValid(value))
        throw new ApiError('invalid-response', 'Invalid Android display observation')
      context(value.context, current)
      return value
    },
    async submit(request, signal) {
      const current = requireAccess(true),
        body = { ...request, context: current.context }
      if (!requestValid(body)) throw new ApiError('conflict', 'Invalid Android display request')
      const value = await client.postJson(path, body, signal, {
        csrf: current.csrfToken,
        status: 202,
      })
      if (!responseValid(value))
        throw new ApiError('invalid-response', 'Invalid Android display task')
      const task = verify(value, current, request)
      if (!task) throw new ApiError('invalid-response', 'Missing Android display task')
      return task
    },
    async find(request, signal) {
      const current = requireAccess(true)
      const value = await client.getJson(`${path}/${encodeURIComponent(request.requestId)}`, signal)
      if (!lookupValid(value))
        throw new ApiError('invalid-response', 'Invalid Android display lookup')
      return verify(value, current, request)
    },
  }
}
