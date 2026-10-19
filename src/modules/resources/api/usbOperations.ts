import type { components, paths } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type OperationGateway, type OperationTracking } from '../../tasks'

export type UsbOperation = Omit<components['schemas']['UsbOperationRequest'], 'context'>
export type UsbTarget = components['schemas']['UsbTarget']
export interface UsbActionGateway extends OperationGateway<UsbOperation> {
  tracking?: OperationTracking<UsbOperation>
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const path = '/api/v1/usb-operations' satisfies keyof paths
const requestValid =
  compileContract<components['schemas']['UsbOperationRequest']>('UsbOperationRequest')
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
function fitsNativeLimits(operation: UsbOperation) {
  const bytes = new TextEncoder()
  const text = (value: string, limit: number) =>
    !value.includes('\0') && bytes.encode(value).length <= limit
  const { deviceId, expected, target } = operation
  // JsonCpp's compact writer escapes non-ASCII code units in task signatures.
  const signature = JSON.stringify({ deviceId, expected, target }).replace(
    /[\u007f-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
  return (
    signature.length <= 1024 &&
    deviceId.endsWith(`#${expected.deviceNumber}`) &&
    text(expected.vendorId, 16) &&
    text(expected.productId, 16) &&
    (!expected.owner?.controllerId || text(expected.owner.controllerId, 128)) &&
    (target.kind !== 'vm' || text(target.controllerId, 128))
  )
}

export function validTrackedUsbOperation(request: unknown): request is UsbOperation {
  if (!request || typeof request !== 'object' || Array.isArray(request) || 'context' in request)
    return false
  const body = { ...request, context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) } }
  return (
    requestValid(body) &&
    fitsNativeLimits(body) &&
    (body.target.kind !== 'vm' || BigInt(body.target.revision) <= 18446744073709551615n)
  )
}

export function createUsbActionGateway(
  client: HttpClient,
  access: () => Access | null,
): UsbActionGateway {
  const permitted = (value: Access | null) =>
    !!value?.administrator &&
    value.manageTasks &&
    value.capabilities.includes('usb.target.v1') &&
    value.capabilities.includes('usb.list.v1')
  function requireAccess() {
    const value = access()
    if (!value) throw new ApiError('unauthenticated', 'Session required')
    if (!permitted(value)) throw new ApiError('unsupported', 'USB operations unavailable')
    return value
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    current: Access,
    request: UsbOperation,
  ) {
    if (
      value.context.daemonEpoch !== current.context.daemonEpoch ||
      value.context.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Server or browser session changed')
    if (value.task) {
      checkTask(value.task)
      if (
        value.task.requestId !== request.requestId ||
        value.task.resource !== `usb:${request.deviceId}` ||
        value.task.kind !== 'usb_target'
      )
        throw new ApiError('invalid-response', 'Unexpected USB operation identity')
    }
    return value.task
  }
  return {
    tracking: {
      namespace: 'usb',
      valid: validTrackedUsbOperation,
      key: (request) => request.deviceId,
    },
    supported: () => permitted(access()),
    async submit(operation, signal) {
      const current = requireAccess()
      const body = { ...operation, context: current.context }
      if (
        !requestValid(body) ||
        !fitsNativeLimits(operation) ||
        (body.target.kind === 'vm' && BigInt(body.target.revision) > 18446744073709551615n)
      )
        throw new ApiError('conflict', 'Invalid USB observation')
      const value = await client.postJson(path, body, signal, {
        csrf: current.csrfToken,
        status: 202,
      })
      if (!responseValid(value))
        throw new ApiError('invalid-response', 'Invalid USB operation response')
      verify(value, current, operation)
      return value.task
    },
    async find(operation, signal) {
      const current = requireAccess()
      const value = await client.getJson(
        `${path}/${encodeURIComponent(operation.requestId)}`,
        signal,
      )
      if (!lookupValid(value))
        throw new ApiError('invalid-response', 'Invalid USB operation lookup')
      return verify(value, current, operation)
    },
  }
}
