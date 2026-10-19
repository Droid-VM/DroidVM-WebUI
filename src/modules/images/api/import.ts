import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient, ApiPath } from '../../../shared/api/httpClient'
import { validHostPath } from '../../../shared/lib/hostPath'
import {
  recoverLookup,
  checkTask,
  type OperationGateway,
  type OperationTracking,
} from '../../tasks'

type Schemas = components['schemas']
export type ImageImportPlan = Schemas['ImageImportPlan']
export type ImageImportPlanRequest = Omit<Schemas['ImageImportPlanRequest'], 'context'>
export type ImageImportRequest = Omit<Schemas['ImageImportRequest'], 'context'>
export interface ImageImportGateway extends OperationGateway<ImageImportRequest> {
  tracking?: OperationTracking<ImageImportRequest>
  preview: OperationGateway<ImageImportPlanRequest> & {
    tracking?: OperationTracking<ImageImportPlanRequest>
  }
}
interface Access {
  hostId?: string
  context: Schemas['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const validPlanRequest =
  compileContract<Schemas['ImageImportPlanRequest']>('ImageImportPlanRequest')
const validRequest = compileContract<Schemas['ImageImportRequest']>('ImageImportRequest')
const validResponse = compileContract<Schemas['TaskResponse']>('TaskResponse')
const validLookup = compileContract<Schemas['VmOperationLookup']>('VmOperationLookup')
const invalid = () => new ApiError('invalid-response', 'Invalid image import response')
export function validTrackedImagePreview(request: unknown): request is ImageImportPlanRequest {
  if (
    !request ||
    typeof request !== 'object' ||
    Object.keys(request).sort().join(',') !== 'requestId,source'
  )
    return false
  const body = { ...request, context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) } }
  return validPlanRequest(body) && validHostPath(body.source)
}
export function validTrackedImageImport(request: unknown): request is ImageImportRequest {
  if (
    !request ||
    typeof request !== 'object' ||
    Object.keys(request).sort().join(',') !== 'planRequestId,requestId'
  )
    return false
  return validRequest({
    ...request,
    context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) },
  })
}
export function createImageImportGateway(
  client: HttpClient,
  access: () => Access | null,
): ImageImportGateway {
  const supported = () => {
    const current = access()
    return (
      !!current?.administrator &&
      current.manageTasks &&
      current.capabilities.includes('images.import.v1')
    )
  }
  function scope() {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!supported()) throw new ApiError('unsupported', 'Image import unavailable')
    return current
  }
  function verify(
    value: Schemas['VmOperationLookup'],
    current: Access,
    request: ImageImportRequest | ImageImportPlanRequest,
    preview: boolean,
  ) {
    if (
      value.context.daemonEpoch !== current.context.daemonEpoch ||
      value.context.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Image import context changed')
    const task = value.task
    if (!task) return null
    checkTask(task)
    if (
      task.requestId !== request.requestId ||
      task.resource !== 'image' ||
      task.kind !== (preview ? 'image_import_plan' : 'image_import')
    )
      throw invalid()
    if (preview) {
      const plan = task.imageImportPlan
      if (task.state === 'succeeded' && !plan) throw invalid()
      if (
        plan &&
        (!('source' in request) ||
          plan.source !== request.source ||
          !plan.members.length ||
          plan.members.length > 64 ||
          plan.members[0]?.id !== plan.diskId ||
          new Set(plan.members.map((row) => row.id)).size !== plan.members.length ||
          new Set(plan.members.map((row) => row.path)).size !== plan.members.length ||
          plan.members.some(
            (row, index) =>
              !validHostPath(row.path) ||
              BigInt(row.virtualSizeBytes) > 9223372036854775807n ||
              row.parentId !== (plan.members[index + 1]?.id ?? null),
          ) ||
          new Set(plan.attachments.map((row) => `${row.vmId}:${row.slot}`)).size !==
            plan.attachments.length)
      )
        throw invalid()
    } else {
      const result = task.imageImport
      if (
        task.state === 'succeeded' &&
        (!result ||
          !result.registered ||
          !result.diskId ||
          result.registrationUncertain ||
          result.recoveryRequired)
      )
        throw invalid()
      if (
        result &&
        (result.added > 64 ||
          (result.registered && (!result.diskId || result.registrationUncertain)))
      )
        throw invalid()
    }
    return task
  }
  function gateway<R extends ImageImportRequest | ImageImportPlanRequest>(
    path: ApiPath,
    preview: boolean,
    valid: (value: unknown) => boolean,
  ): OperationGateway<R> {
    return {
      supported,
      async submit(request, signal) {
        const current = scope(),
          body = { ...request, context: current.context }
        if (!valid(body) || ('source' in request && !validHostPath(request.source)))
          throw new ApiError('conflict', 'Invalid image import request')
        const value = await client.postJson(path, body, signal, {
          csrf: current.csrfToken,
          status: 202,
        })
        if (!validResponse(value)) throw invalid()
        verify(value, current, request, preview)
        return value.task
      },
      async find(request, signal) {
        const current = scope()
        const value = await client.getJson(
          `${path}/${encodeURIComponent(request.requestId)}`,
          signal,
        )
        if (!validLookup(value)) throw invalid()
        return verify(
          preview ? value : await recoverLookup(client, current, request.requestId, value, signal),
          current,
          request,
          preview,
        )
      },
    }
  }
  return {
    ...gateway<ImageImportRequest>('/api/v1/image-imports', false, validRequest),
    tracking: {
      namespace: 'image-import',
      durable: true,
      valid: validTrackedImageImport,
      key: () => 'import',
    },
    preview: {
      ...gateway<ImageImportPlanRequest>('/api/v1/image-import-plans', true, validPlanRequest),
      tracking: {
        namespace: 'image-preview',
        durable: true,
        valid: validTrackedImagePreview,
        key: () => 'preview',
      },
    },
  }
}
