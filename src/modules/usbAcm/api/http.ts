import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type OperationGateway, type OperationTracking } from '../../tasks'

export type UsbAcmObservation = components['schemas']['UsbAcmObservation']
export type UsbAcmRequest = Omit<components['schemas']['UsbAcmOperationRequest'], 'context'>
export interface UsbAcmGateway extends OperationGateway<UsbAcmRequest> {
  tracking?: OperationTracking<UsbAcmRequest>
  readable(): boolean
  read(signal: AbortSignal): Promise<UsbAcmObservation>
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  administrator: boolean
  manageTasks: boolean
  csrfToken: string
}
const observationValid = compileContract<UsbAcmObservation>('UsbAcmObservation')
const requestValid =
  compileContract<components['schemas']['UsbAcmOperationRequest']>('UsbAcmOperationRequest')
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
const path = '/api/v1/usb-acm-operations'
export function validTrackedUsbAcmRequest(request: unknown): request is UsbAcmRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request) || 'context' in request)
    return false
  return requestValid({
    ...request,
    context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) },
  })
}
export function createUsbAcmGateway(
  client: HttpClient,
  access: () => Access | null,
): UsbAcmGateway {
  const readable = () =>
    !!access()?.administrator && !!access()?.capabilities.includes('host.usb-acm.v1')
  const supported = () => readable() && !!access()?.manageTasks
  function requireAccess(write: boolean) {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!(write ? supported() : readable()))
      throw new ApiError('unsupported', 'USB ACM unavailable')
    return current
  }
  function context(value: components['schemas']['ServerContext'], current: Access) {
    if (
      value.daemonEpoch !== current.context.daemonEpoch ||
      value.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'USB ACM session changed')
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    current: Access,
    request: UsbAcmRequest,
  ) {
    context(value.context, current)
    const task = value.task
    if (!task) return null
    checkTask(task)
    if (
      task.kind !== 'usb_acm' ||
      task.resource !== 'usb-acm' ||
      task.requestId !== request.requestId
    )
      throw new ApiError('invalid-response', 'Unexpected USB ACM task')
    const receipt = task.usbAcmResult
    const queuedCancel =
      task.state === 'cancelled' &&
      receipt?.expected === null &&
      receipt.desired === null &&
      receipt.revision === null &&
      receipt.live === null &&
      receipt.saved === false &&
      receipt.applied === false &&
      receipt.uncertain === false
    if (receipt && !queuedCancel && receipt.expected?.revision !== request.expected.revision)
      throw new ApiError('invalid-response', 'Unexpected USB ACM receipt')
    if (
      receipt?.saved &&
      (!receipt.desired ||
        receipt.revision === null ||
        (request.operation.kind === 'apply' && receipt.revision !== request.expected.revision) ||
        (request.operation.kind === 'configure' &&
          (receipt.desired.enabled !== request.operation.enabled ||
            receipt.desired.ports !== request.operation.ports)))
    )
      throw new ApiError('invalid-response', 'Saved USB ACM target differs from request')
    if (
      task.state === 'succeeded' &&
      (!receipt?.saved ||
        !receipt.applied ||
        receipt.uncertain ||
        !receipt.desired ||
        !receipt.live ||
        receipt.revision === null)
    )
      throw new ApiError('invalid-response', 'Incomplete USB ACM success receipt')
    if (['succeeded', 'failed', 'cancelled'].includes(task.state) && !receipt)
      throw new ApiError('invalid-response', 'Missing USB ACM receipt')
    return task
  }
  return {
    tracking: { namespace: 'usb-acm', valid: validTrackedUsbAcmRequest, key: () => 'usb-acm' },
    readable,
    supported,
    async read(signal) {
      const current = requireAccess(false)
      const value = await client.getJson('/api/v1/host/usb-acm', signal)
      if (!observationValid(value))
        throw new ApiError('invalid-response', 'Invalid USB ACM observation')
      context(value.context, current)
      return value
    },
    async submit(request, signal) {
      const current = requireAccess(true),
        body = { ...request, context: current.context }
      if (!requestValid(body)) throw new ApiError('conflict', 'Invalid USB ACM request')
      const value = await client.postJson(path, body, signal, {
        csrf: current.csrfToken,
        status: 202,
      })
      if (!responseValid(value)) throw new ApiError('invalid-response', 'Invalid USB ACM task')
      const task = verify(value, current, request)
      if (!task) throw new ApiError('invalid-response', 'Missing USB ACM task')
      return task
    },
    async find(request, signal) {
      const current = requireAccess(true)
      const value = await client.getJson(`${path}/${encodeURIComponent(request.requestId)}`, signal)
      if (!lookupValid(value)) throw new ApiError('invalid-response', 'Invalid USB ACM lookup')
      return verify(value, current, request)
    },
  }
}
