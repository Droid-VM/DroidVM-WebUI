import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type OperationGateway, type OperationTracking } from '../../tasks'

export type HostPreferenceObservation = components['schemas']['HostPreferenceObservation']
export type HostPreferenceValues = HostPreferenceObservation['values']
export type HostPreferenceRequest = Omit<
  components['schemas']['HostPreferenceOperationRequest'],
  'context'
>
export interface HostPreferenceGateway extends OperationGateway<HostPreferenceRequest> {
  tracking?: OperationTracking<HostPreferenceRequest>
  readable(): boolean
  read(signal: AbortSignal): Promise<HostPreferenceObservation>
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  administrator: boolean
  manageTasks: boolean
  csrfToken: string
}
const observationValid = compileContract<HostPreferenceObservation>('HostPreferenceObservation')
const requestValid = compileContract<components['schemas']['HostPreferenceOperationRequest']>(
  'HostPreferenceOperationRequest',
)
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
export function validTrackedHostPreferenceRequest(
  request: unknown,
): request is HostPreferenceRequest {
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
const path = '/api/v1/host-preference-operations'
export function createHostPreferenceGateway(
  client: HttpClient,
  access: () => Access | null,
): HostPreferenceGateway {
  const readable = () =>
    !!access()?.administrator && !!access()?.capabilities.includes('host.preferences.v1')
  const supported = () => readable() && !!access()?.manageTasks
  function requireAccess(write: boolean) {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!(write ? supported() : readable()))
      throw new ApiError('unsupported', 'Host preferences unavailable')
    return current
  }
  function context(value: components['schemas']['ServerContext'], current: Access) {
    if (
      value.daemonEpoch !== current.context.daemonEpoch ||
      value.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Host preferences session changed')
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    current: Access,
    request: HostPreferenceRequest,
  ) {
    context(value.context, current)
    const task = value.task
    if (!task) return null
    checkTask(task)
    if (
      task.kind !== 'host_preferences' ||
      task.resource !== 'host-preferences' ||
      task.requestId !== request.requestId
    )
      throw new ApiError('invalid-response', 'Unexpected host preference task')
    const receipt = task.hostPreferenceResult
    const queuedCancel =
      task.state === 'cancelled' &&
      receipt?.expected === null &&
      receipt.values === null &&
      receipt.revision === null &&
      receipt.saved === false &&
      receipt.uncertain === false
    if (receipt && !queuedCancel && receipt.expected?.revision !== request.expected.revision)
      throw new ApiError('invalid-response', 'Unexpected host preference receipt')
    if (
      task.state === 'succeeded' &&
      (!receipt?.saved || receipt.uncertain || !receipt.values || receipt.revision === null)
    )
      throw new ApiError('invalid-response', 'Incomplete host preference success receipt')
    if (
      receipt?.saved &&
      (!receipt.values ||
        receipt.revision === null ||
        Object.entries(request.changes).some(
          ([key, expected]) => receipt.values?.[key as keyof HostPreferenceValues] !== expected,
        ))
    )
      throw new ApiError('invalid-response', 'Saved host preferences differ from the request')
    if (['succeeded', 'failed', 'cancelled'].includes(task.state) && !receipt)
      throw new ApiError('invalid-response', 'Missing host preference receipt')
    return task
  }
  return {
    tracking: {
      namespace: 'host-preferences',
      valid: validTrackedHostPreferenceRequest,
      key: () => 'host-preferences',
    },
    readable,
    supported,
    async read(signal) {
      const current = requireAccess(false)
      const value = await client.getJson('/api/v1/host/preferences', signal)
      if (!observationValid(value))
        throw new ApiError('invalid-response', 'Invalid host preferences')
      context(value.context, current)
      return value
    },
    async submit(request, signal) {
      const current = requireAccess(true),
        body = { ...request, context: current.context }
      if (!validTrackedHostPreferenceRequest(request) || !requestValid(body))
        throw new ApiError('conflict', 'Invalid host preference request')
      const value = await client.postJson(path, body, signal, {
        csrf: current.csrfToken,
        status: 202,
      })
      if (!responseValid(value))
        throw new ApiError('invalid-response', 'Invalid host preference task')
      const task = verify(value, current, request)
      if (!task) throw new ApiError('invalid-response', 'Missing host preference task')
      return task
    },
    async find(request, signal) {
      const current = requireAccess(true)
      if (!validTrackedHostPreferenceRequest(request))
        throw new ApiError('conflict', 'Invalid host preference request')
      const value = await client.getJson(`${path}/${encodeURIComponent(request.requestId)}`, signal)
      if (!lookupValid(value))
        throw new ApiError('invalid-response', 'Invalid host preference lookup')
      return verify(value, current, request)
    },
  }
}
