import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import {
  recoverLookup,
  checkTask,
  type OperationGateway,
  type OperationTracking,
} from '../../tasks'
import { createResourceGateway } from './http'
import type { DiskBaseline, DiskDetail } from './gateway'

export type DiskOperation = components['schemas']['DiskOperation']
export type DiskAction = DiskOperation['action']
export type DiskRequest = Omit<components['schemas']['DiskOperationRequest'], 'context'>
export type DiskRecoveryRequest = Omit<components['schemas']['DiskRecoveryRequest'], 'context'> & {
  diskRequestId?: string | null
}
export interface DiskRecoveryGateway extends OperationGateway<DiskRecoveryRequest> {
  tracking?: OperationTracking<DiskRecoveryRequest>
  status(signal: AbortSignal): Promise<number>
}
export interface DiskPreparation {
  catalog: DiskBaseline
  detail: DiskDetail | null
  parent: DiskDetail | null
}
export interface DiskActionGateway extends OperationGateway<DiskRequest> {
  tracking?: OperationTracking<DiskRequest>
  recovery?: DiskRecoveryGateway
  compressionSupported?(): boolean
  cloneDirectorySupported?(): boolean
  compression?(id: string, signal: AbortSignal): Promise<DiskDetail>
  prepare(id: string | null, action: DiskAction, signal: AbortSignal): Promise<DiskPreparation>
}
interface Access {
  hostId?: string
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const requestValid =
  compileContract<components['schemas']['DiskOperationRequest']>('DiskOperationRequest')
const operationValid = compileContract<DiskOperation>('DiskOperation')
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
const detailValid = compileContract<DiskDetail>('DiskDetail')
const recoveryStatusValid =
  compileContract<components['schemas']['DiskRecoveryStatus']>('DiskRecoveryStatus')
const recoveryRequestValid =
  compileContract<components['schemas']['DiskRecoveryRequest']>('DiskRecoveryRequest')
export function validTrackedDiskRecovery(request: unknown): request is DiskRecoveryRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return false
  const value = request as Record<string, unknown>
  if (!['requestId', 'diskRequestId,requestId'].includes(Object.keys(value).sort().join(',')))
    return false
  if (
    value.diskRequestId !== undefined &&
    value.diskRequestId !== null &&
    (typeof value.diskRequestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.diskRequestId))
  )
    return false
  return recoveryRequestValid({
    requestId: value.requestId,
    context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) },
  })
}
export function validDiskOperation(operation: unknown): operation is DiskOperation {
  if (!operationValid(operation)) return false
  const op = operation
  if (
    'format' in op &&
    op.format !== 'qcow2' &&
    'compress' in op &&
    op.compress &&
    op.compress !== 'none'
  )
    return false
  const text = (value: string, limit: number) =>
    !value.includes('\0') && new TextEncoder().encode(value).length <= limit
  if ('size' in op && op.size !== undefined && BigInt(op.size) > 9223372036854775807n) return false
  if (
    op.action === 'create' &&
    ((!op.backingId && !op.size) ||
      (op.backingId && op.format !== 'qcow2') ||
      (op.attach && !op.backingId))
  )
    return false
  if ('folder' in op || 'name' in op) {
    if (
      !('folder' in op && 'name' in op) ||
      !op.folder ||
      !op.name ||
      !text(op.folder, 4096) ||
      !text(op.name, 255)
    )
      return false
    if (
      !/^\/(?:[^/]+(?:\/[^/]+)*)?$/.test(op.folder) ||
      op.folder.split('/').some((part) => part === '.' || part === '..') ||
      op.name.includes('/') ||
      op.name === '.' ||
      op.name === '..' ||
      op.name.startsWith('.dvm-')
    )
      return false
  }
  return true
}
export const diskOperationResource = (op: DiskOperation) =>
  `disk:${'diskId' in op ? op.diskId : (op.backingId ?? 'new')}`

export function validTrackedDiskRequest(request: unknown): request is DiskRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request) || 'context' in request)
    return false
  const body = { ...request, context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) } }
  if (!requestValid(body) || !validDiskOperation(body.operation)) return false
  const signature = JSON.stringify({
    revision: body.revision,
    vmRevision: body.vmRevision,
    operation: body.operation,
  }).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return signature.length <= 32768 && new TextEncoder().encode(JSON.stringify(body)).length <= 32768
}
export function createDiskActionGateway(
  client: HttpClient,
  access: () => Access | null,
): DiskActionGateway {
  const resources = createResourceGateway(client, access)
  const supported = () => {
    const value = access()
    return (
      !!value?.administrator &&
      value.manageTasks &&
      ['disks.operations.v1', 'disks.list.v1', 'disks.inspect.v1'].every((cap) =>
        value.capabilities.includes(cap),
      )
    )
  }
  function current() {
    const value = access()
    if (!value) throw new ApiError('unauthenticated', 'Session required')
    if (!supported()) throw new ApiError('unsupported', 'Disk operations unavailable')
    return value
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    scope: Access,
    request: DiskRequest,
  ) {
    if (
      value.context.daemonEpoch !== scope.context.daemonEpoch ||
      value.context.sessionId !== scope.context.sessionId
    )
      throw new ApiError('context-changed', 'Disk task context changed')
    if (value.task) {
      checkTask(value.task)
      if (
        value.task.requestId !== request.requestId ||
        value.task.kind !== 'disk_operation' ||
        value.task.resource !== diskOperationResource(request.operation) ||
        (value.task.diskId && value.task.state !== 'succeeded')
      )
        throw new ApiError('invalid-response', 'Disk task identity changed')
    }
    return value.task
  }
  const recoverySupported = () =>
    supported() && !!access()?.capabilities.includes('disks.recovery.v1')
  function recoveryScope() {
    const scope = current()
    if (!recoverySupported()) throw new ApiError('unsupported', 'Disk recovery unavailable')
    return scope
  }
  function recoveryTask(
    value: components['schemas']['VmOperationLookup'],
    scope: Access,
    request: DiskRecoveryRequest,
  ) {
    if (
      value.context.daemonEpoch !== scope.context.daemonEpoch ||
      value.context.sessionId !== scope.context.sessionId
    )
      throw new ApiError('context-changed', 'Recovery task context changed')
    if (value.task) {
      checkTask(value.task)
      if (
        value.task.kind !== 'disk_recovery' ||
        value.task.resource !== 'disks' ||
        value.task.requestId !== request.requestId ||
        (value.task.state === 'succeeded'
          ? value.task.pendingRecords === undefined
          : value.task.pendingRecords !== undefined)
      )
        throw new ApiError('invalid-response', 'Invalid disk recovery task')
    }
    return value.task
  }
  return {
    tracking: {
      namespace: 'disk',
      durable: true,
      valid: validTrackedDiskRequest,
      key: () => 'disk',
    },
    supported,
    cloneDirectorySupported: () =>
      supported() && !!access()?.capabilities.includes('disks.clone-directory.v1'),
    compressionSupported: () =>
      supported() && !!access()?.capabilities.includes('disks.compression.v1'),
    async compression(id, signal) {
      const scope = current()
      if (!scope.capabilities.includes('disks.compression.v1'))
        throw new ApiError('unsupported', 'Effective compression inspection unavailable')
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
        throw new ApiError('conflict', 'Invalid disk identity')
      const value = await client.getJson(`/api/v1/disks/${id}/compression`, signal)
      if (!detailValid(value))
        throw new ApiError('invalid-response', 'Invalid compression inspection')
      if (
        value.context.daemonEpoch !== scope.context.daemonEpoch ||
        value.context.sessionId !== scope.context.sessionId
      )
        throw new ApiError('context-changed', 'Compression inspection context changed')
      if (value.disk.id !== id || value.chain[0]?.id !== id)
        throw new ApiError('invalid-response', 'Compression disk identity changed')
      return value
    },
    recovery: {
      tracking: {
        namespace: 'disk-recovery',
        durable: true,
        valid: validTrackedDiskRecovery,
        key: () => 'recovery',
      },
      supported: recoverySupported,
      async status(signal) {
        const scope = recoveryScope(),
          value = await client.getJson('/api/v1/disk-recovery', signal)
        if (!recoveryStatusValid(value))
          throw new ApiError('invalid-response', 'Invalid disk recovery status')
        if (
          value.context.daemonEpoch !== scope.context.daemonEpoch ||
          value.context.sessionId !== scope.context.sessionId
        )
          throw new ApiError('context-changed', 'Disk recovery context changed')
        return value.pendingRecords
      },
      async submit(request, signal) {
        const scope = recoveryScope(),
          body = { requestId: request.requestId, context: scope.context }
        if (!recoveryRequestValid(body))
          throw new ApiError('conflict', 'Invalid disk recovery request')
        const value = await client.postJson('/api/v1/disk-recovery', body, signal, {
          csrf: scope.csrfToken,
          status: 202,
        })
        if (!responseValid(value))
          throw new ApiError('invalid-response', 'Invalid recovery receipt')
        recoveryTask(value, scope, request)
        return value.task
      },
      async find(request, signal) {
        const scope = recoveryScope(),
          value = await client.getJson(
            `/api/v1/disk-recovery/${encodeURIComponent(request.requestId)}`,
            signal,
          )
        if (!lookupValid(value)) throw new ApiError('invalid-response', 'Invalid recovery lookup')
        return recoveryTask(
          await recoverLookup(client, scope, request.requestId, value, signal),
          scope,
          request,
        )
      },
    },
    async prepare(id, action, signal) {
      current()
      const catalog = await resources.diskBaseline(signal)
      if (!catalog.vmRevision)
        throw new ApiError('unsupported', 'Disk confirmation baseline unavailable')
      const detail = id ? await resources.diskDetail(id, signal) : null
      const parent =
        action === 'commit' && detail?.disk.parentId
          ? await resources.diskDetail(detail.disk.parentId, signal)
          : null
      for (const view of [detail, parent])
        if (view && (view.revision !== catalog.revision || view.vmRevision !== catalog.vmRevision))
          throw new ApiError('conflict', 'Disk references changed while preparing')
      return { catalog, detail, parent }
    },
    async submit(request, signal) {
      const scope = current(),
        body = { ...request, context: scope.context }
      if (
        request.operation.action === 'clone' &&
        request.operation.createFolder !== undefined &&
        !scope.capabilities.includes('disks.clone-directory.v1')
      )
        throw new ApiError('unsupported', 'Clone directory creation unavailable')
      const signature = JSON.stringify({
        revision: request.revision,
        vmRevision: request.vmRevision,
        operation: request.operation,
      }).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
      if (
        !requestValid(body) ||
        !validDiskOperation(request.operation) ||
        signature.length > 32768 ||
        new TextEncoder().encode(JSON.stringify(body)).length > 32768
      )
        throw new ApiError('conflict', 'Invalid disk operation')
      const value = await client.postJson('/api/v1/disk-operations', body, signal, {
        csrf: scope.csrfToken,
        status: 202,
      })
      if (!responseValid(value)) throw new ApiError('invalid-response', 'Invalid disk task receipt')
      verify(value, scope, request)
      return value.task
    },
    async find(request, signal) {
      const scope = current(),
        value = await client.getJson(
          `/api/v1/disk-operations/${encodeURIComponent(request.requestId)}`,
          signal,
        )
      if (!lookupValid(value)) throw new ApiError('invalid-response', 'Invalid disk task lookup')
      return verify(
        await recoverLookup(client, scope, request.requestId, value, signal),
        scope,
        request,
      )
    },
  }
}
