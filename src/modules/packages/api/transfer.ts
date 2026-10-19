import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import type { UploadGateway } from '../../../shared/model/chunkedUpload'

export type PackageTransfer = components['schemas']['PackageTransfer']
export type PackageTransferLimits = components['schemas']['PackageTransferLimits']
type UploadFile = components['schemas']['PackageUploadBeginRequest']['files'][number]
type Kind = 'upload' | 'download'
export interface DownloadTracking {
  namespace: string
  storage?: Storage
}
export interface PackageTransferGateway {
  tracking?: UploadGateway<PackageTransfer>['tracking']
  downloadTracking?: DownloadTracking
  supported(): boolean
  beginUpload(id: string, files: UploadFile[], signal: AbortSignal): Promise<PackageTransfer>
  uploadStatus(id: string, signal: AbortSignal): Promise<PackageTransfer>
  chunk(
    id: string,
    index: number,
    offset: string,
    data: string,
    signal: AbortSignal,
  ): Promise<PackageTransfer>
  finish(id: string, signal: AbortSignal): Promise<PackageTransfer>
  beginDownload(id: string, exportRequestId: string, signal: AbortSignal): Promise<PackageTransfer>
  downloadStatus(id: string, signal: AbortSignal): Promise<PackageTransfer>
  remove(kind: Kind, id: string, signal: AbortSignal): Promise<void>
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const validResponse =
  compileContract<components['schemas']['PackageTransferResponse']>('PackageTransferResponse')
const validUpload = compileContract<components['schemas']['PackageUploadBeginRequest']>(
  'PackageUploadBeginRequest',
)
const validChunk = compileContract<components['schemas']['PackageUploadChunkRequest']>(
  'PackageUploadChunkRequest',
)
const validFinish = compileContract<components['schemas']['PackageUploadFinishRequest']>(
  'PackageUploadFinishRequest',
)
const validDownload = compileContract<components['schemas']['PackageDownloadBeginRequest']>(
  'PackageDownloadBeginRequest',
)
const validId = compileContract<string>('RequestId')
const invalid = () => new ApiError('invalid-response', 'Invalid package transfer response')
export function createPackageTransferGateway(
  client: HttpClient,
  access: () => Access | null,
): PackageTransferGateway {
  const supported = () => {
    const current = access()
    return (
      !!current?.administrator &&
      current.manageTasks &&
      current.capabilities.includes('packages.transfer.v1')
    )
  }
  function scope() {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!supported()) throw new ApiError('unsupported', 'Package transfer unavailable')
    return current
  }
  function path(kind: Kind, id: string): `/api/v1/${string}` {
    if (!validId(id)) throw new ApiError('conflict', 'Invalid transfer identifier')
    return `/api/v1/package-${kind}s/${encodeURIComponent(id)}`
  }
  function verify(value: unknown, current: Access, id: string, kind: Kind) {
    if (!validResponse(value)) throw invalid()
    if (
      value.context.daemonEpoch !== current.context.daemonEpoch ||
      value.context.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Package transfer context changed')
    const transfer = value.transfer
    if (
      transfer.id !== id ||
      transfer.kind !== kind ||
      (kind === 'download' && transfer.state === 'receiving') ||
      transfer.limits.chunkBytes <= 0 ||
      (transfer.source !== undefined && (kind !== 'upload' || transfer.state !== 'ready')) ||
      [
        transfer.limits.maxFileBytes,
        transfer.limits.maxSessionBytes,
        transfer.limits.maxTotalBytes,
      ].some((value) => BigInt(value) > 18446744073709551615n) ||
      new Set(transfer.files.map((file) => file.name)).size !== transfer.files.length ||
      transfer.files.some(
        (file, index) =>
          file.index !== index ||
          BigInt(file.offsetBytes) > BigInt(file.sizeBytes) ||
          BigInt(file.sizeBytes) > 18446744073709551615n ||
          (kind === 'download' && file.offsetBytes !== file.sizeBytes) ||
          new TextEncoder().encode(file.name).length > 255 ||
          file.name.includes('/') ||
          file.name.includes('\\') ||
          file.name === '.' ||
          file.name === '..' ||
          [...file.name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
      ) ||
      (transfer.state === 'ready' &&
        (transfer.files.some((file) => file.offsetBytes !== file.sizeBytes) ||
          (kind === 'upload' && !transfer.source)))
    )
      throw invalid()
    return transfer
  }
  async function status(kind: Kind, id: string, signal: AbortSignal) {
    const current = scope()
    return verify(await client.getJson(path(kind, id), signal), current, id, kind)
  }
  return {
    tracking: { namespace: 'package-upload' },
    downloadTracking: { namespace: 'package-download' },
    supported,
    async beginUpload(id, files, signal) {
      const current = scope(),
        body = { context: current.context, requestId: id, files }
      if (!validUpload(body)) throw new ApiError('conflict', 'Invalid package upload')
      return verify(
        await client.postJson('/api/v1/package-uploads', body, signal, {
          csrf: current.csrfToken,
          status: 200,
        }),
        current,
        id,
        'upload',
      )
    },
    uploadStatus: (id, signal) => status('upload', id, signal),
    async chunk(id, index, offset, data, signal) {
      const current = scope(),
        body = { context: current.context, index, offset, data }
      if (!validChunk(body)) throw new ApiError('conflict', 'Invalid package upload chunk')
      return verify(
        await client.postJson(`${path('upload', id)}/chunks`, body, signal, {
          csrf: current.csrfToken,
          status: 200,
        }),
        current,
        id,
        'upload',
      )
    },
    async finish(id, signal) {
      const current = scope(),
        body = { context: current.context }
      if (!validFinish(body)) throw new ApiError('conflict', 'Invalid package upload context')
      return verify(
        await client.postJson(`${path('upload', id)}/finish`, body, signal, {
          csrf: current.csrfToken,
          status: 200,
        }),
        current,
        id,
        'upload',
      )
    },
    async beginDownload(id, exportRequestId, signal) {
      const current = scope(),
        body = { context: current.context, requestId: id, exportRequestId }
      if (!validDownload(body)) throw new ApiError('conflict', 'Invalid package download')
      return verify(
        await client.postJson('/api/v1/package-downloads', body, signal, {
          csrf: current.csrfToken,
          status: 200,
        }),
        current,
        id,
        'download',
      )
    },
    downloadStatus: (id, signal) => status('download', id, signal),
    async remove(kind, id, signal) {
      const current = scope()
      await client.delete(path(kind, id), current.csrfToken, signal)
    },
  }
}
