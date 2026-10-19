import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import type { UploadGateway } from '../../../shared/model/chunkedUpload'
import { validHostPath } from '../../../shared/lib/hostPath'
import { validUploadName } from '../../../shared/lib/uploadFiles'
import { checkTask, type OperationGateway, type OperationTracking } from '../../tasks'
type Schemas = components['schemas']
export type ImageUpload = Schemas['ImageUpload']
export type ImageInstallRequest = Omit<Schemas['ImageInstallRequest'], 'context'>
export interface ImageTransferGateway {
  upload: UploadGateway<ImageUpload>
  install: OperationGateway<ImageInstallRequest> & {
    tracking?: OperationTracking<ImageInstallRequest>
  }
}
interface Access {
  context: Schemas['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const validUpload = compileContract<Schemas['ImageUploadResponse']>('ImageUploadResponse')
const validBegin = compileContract<Schemas['ImageUploadBeginRequest']>('ImageUploadBeginRequest')
const validChunk = compileContract<Schemas['ImageUploadChunkRequest']>('ImageUploadChunkRequest')
const validFinish = compileContract<Schemas['ImageUploadFinishRequest']>('ImageUploadFinishRequest')
const validInstall = compileContract<Schemas['ImageInstallRequest']>('ImageInstallRequest')
const validResponse = compileContract<Schemas['TaskResponse']>('TaskResponse')
const validLookup = compileContract<Schemas['VmOperationLookup']>('VmOperationLookup')
const validId = compileContract<string>('RequestId')
const invalid = () => new ApiError('invalid-response', 'Invalid image transfer response')
export function validImageDestination(folder: string, name: string) {
  return (
    validHostPath(folder, true) &&
    new TextEncoder().encode(`${folder === '/' ? '' : folder}/${name}`).length <= 4096 &&
    !folder.includes('//') &&
    !folder.split('/').some((part) => part === '.' || part === '..') &&
    (folder === '/' || !folder.endsWith('/')) &&
    validUploadName(name) &&
    !name.startsWith('.dvm-')
  )
}
export function validTrackedImageInstall(request: unknown): request is ImageInstallRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request) || 'context' in request)
    return false
  const body = { ...request, context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) } }
  return validInstall(body) && validImageDestination(body.folder, body.name)
}
export function createImageTransferGateway(
  client: HttpClient,
  access: () => Access | null,
): ImageTransferGateway {
  const supported = () => {
    const current = access()
    return (
      !!current?.administrator &&
      current.manageTasks &&
      current.capabilities.includes('images.upload.v1')
    )
  }
  function scope() {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!supported()) throw new ApiError('unsupported', 'Image uploads unavailable')
    return current
  }
  function context(actual: Access['context'], current: Access) {
    if (
      actual.daemonEpoch !== current.context.daemonEpoch ||
      actual.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Image transfer context changed')
  }
  function path(id: string): `/api/v1/${string}` {
    if (!validId(id)) throw new ApiError('conflict', 'Invalid upload identity')
    return `/api/v1/image-uploads/${encodeURIComponent(id)}`
  }
  function verifyUpload(value: unknown, current: Access, id: string) {
    if (!validUpload(value)) throw invalid()
    context(value.context, current)
    const upload = value.transfer
    if (
      upload.id !== id ||
      upload.kind !== 'upload' ||
      upload.files.length !== 1 ||
      upload.limits.chunkBytes <= 0 ||
      [upload.limits.maxFileBytes, upload.limits.maxSessionBytes, upload.limits.maxTotalBytes].some(
        (size) => BigInt(size) > 18446744073709551615n,
      ) ||
      upload.files.some(
        (file) =>
          file.index !== 0 ||
          BigInt(file.offsetBytes) > BigInt(file.sizeBytes) ||
          BigInt(file.sizeBytes) > 18446744073709551615n ||
          !file.name ||
          file.name.includes('/') ||
          file.name.includes('\\') ||
          file.name === '.' ||
          file.name === '..' ||
          new TextEncoder().encode(file.name).length > 255 ||
          [...file.name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
      ) ||
      (upload.state === 'ready' && upload.files.some((file) => file.offsetBytes !== file.sizeBytes))
    )
      throw invalid()
    return upload
  }
  function verifyTask(
    value: Schemas['VmOperationLookup'],
    current: Access,
    request: ImageInstallRequest,
  ) {
    context(value.context, current)
    const task = value.task
    if (!task) return null
    checkTask(task)
    if (
      task.requestId !== request.requestId ||
      task.kind !== 'image_install' ||
      task.resource !== 'image'
    )
      throw invalid()
    const result = task.imageInstall
    if (
      result &&
      (result.uploadId !== request.uploadId ||
        !validHostPath(result.source) ||
        result.source !== `${request.folder === '/' ? '' : request.folder}/${request.name}` ||
        (result.durabilityConfirmed && !result.installed))
    )
      throw invalid()
    if (
      task.state === 'succeeded' &&
      (!result ||
        !result.installed ||
        !result.durabilityConfirmed ||
        result.installationUncertain ||
        result.recoveryRequired)
    )
      throw invalid()
    return task
  }
  return {
    upload: {
      tracking: { namespace: 'image-upload' },
      supported,
      async beginUpload(id, files, signal) {
        const current = scope(),
          body = { context: current.context, requestId: id, files }
        if (!validBegin(body)) throw new ApiError('conflict', 'Invalid image upload')
        return verifyUpload(
          await client.postJson('/api/v1/image-uploads', body, signal, {
            csrf: current.csrfToken,
            status: 200,
          }),
          current,
          id,
        )
      },
      async uploadStatus(id, signal) {
        const current = scope()
        return verifyUpload(await client.getJson(path(id), signal), current, id)
      },
      async chunk(id, index, offset, data, signal) {
        const current = scope(),
          body = { context: current.context, index, offset, data }
        if (!validChunk(body)) throw new ApiError('conflict', 'Invalid image chunk')
        return verifyUpload(
          await client.postJson(`${path(id)}/chunks`, body, signal, {
            csrf: current.csrfToken,
            status: 200,
          }),
          current,
          id,
        )
      },
      async finish(id, signal) {
        const current = scope(),
          body = { context: current.context }
        if (!validFinish(body)) throw new ApiError('conflict', 'Invalid image finish')
        return verifyUpload(
          await client.postJson(`${path(id)}/finish`, body, signal, {
            csrf: current.csrfToken,
            status: 200,
          }),
          current,
          id,
        )
      },
      async remove(_kind, id, signal) {
        const current = scope()
        await client.delete(path(id), current.csrfToken, signal)
      },
    },
    install: {
      tracking: {
        namespace: 'image-install',
        valid: validTrackedImageInstall,
        key: () => 'install',
      },
      supported,
      async submit(request, signal) {
        const current = scope(),
          body = { ...request, context: current.context }
        if (!validInstall(body)) throw new ApiError('conflict', 'Invalid image installation')
        const value = await client.postJson('/api/v1/image-installs', body, signal, {
          csrf: current.csrfToken,
          status: 202,
        })
        if (!validResponse(value)) throw invalid()
        verifyTask(value, current, request)
        return value.task
      },
      async find(request, signal) {
        const current = scope()
        if (!validId(request.requestId))
          throw new ApiError('conflict', 'Invalid installation identity')
        const value = await client.getJson(
          `/api/v1/image-installs/${encodeURIComponent(request.requestId)}`,
          signal,
        )
        if (!validLookup(value)) throw invalid()
        return verifyTask(value, current, request)
      },
    },
  }
}
