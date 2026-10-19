import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { stageConfiguration } from '../../../shared/api/stagedUpload'
import { checkTask, type OperationGateway } from '../../tasks'

type Schemas = components['schemas']
export type ConfigurationBackupPreview = Schemas['ConfigurationBackupPreview']
export type ConfigurationBackupRequest = Omit<
  Schemas['ConfigurationBackupCommitRequest'],
  'context'
>
export interface ConfigurationBackupGateway extends OperationGateway<ConfigurationBackupRequest> {
  stage(raw: string, signal: AbortSignal): Promise<string>
  preview(uploadId: string, signal: AbortSignal): Promise<ConfigurationBackupPreview>
  abort(uploadId: string, signal: AbortSignal): Promise<void>
}
interface Access {
  context: Schemas['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
export const backupMaximumBytes = 31 * 1024 * 1024
const validUpload = compileContract<Schemas['ConfigUpload']>('ConfigUpload')
const validAppend = compileContract<Schemas['ConfigurationBackupAppend']>(
  'ConfigurationBackupAppend',
)
const validEmpty = compileContract<Schemas['ConfigEmpty']>('ConfigEmpty')
const validPreview = compileContract<ConfigurationBackupPreview>('ConfigurationBackupPreview')
const validRequest = compileContract<Schemas['ConfigurationBackupCommitRequest']>(
  'ConfigurationBackupCommitRequest',
)
const validTask = compileContract<Schemas['TaskResponse']>('TaskResponse')
const validLookup = compileContract<Schemas['VmOperationLookup']>('VmOperationLookup')
const invalid = () => new ApiError('invalid-response', 'Invalid configuration backup response')

export function createConfigurationBackupGateway(
  client: HttpClient,
  access: () => Access | null,
): ConfigurationBackupGateway {
  const supported = () => {
    const value = access()
    return (
      !!value?.administrator &&
      value.manageTasks &&
      value.capabilities.includes('configuration.backup.v1')
    )
  }
  function scope() {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!supported()) throw new ApiError('unsupported', 'Configuration backups unavailable')
    return current
  }
  async function post<T extends { context: Access['context'] }>(
    current: Access,
    operation: string,
    body: object,
    signal: AbortSignal,
    validate: (value: unknown) => value is T,
    status: 200 | 202 = 200,
  ) {
    const value = await client.postJson(
      `/api/v1/configuration-backup/${operation}`,
      { ...body, context: current.context },
      signal,
      { csrf: current.csrfToken, status },
    )
    if (!validate(value)) throw invalid()
    if (
      value.context.daemonEpoch !== current.context.daemonEpoch ||
      value.context.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Configuration backup context changed')
    return value
  }
  function verifyTask(task: Schemas['Task'] | null, request: ConfigurationBackupRequest) {
    if (!task) return null
    checkTask(task)
    if (
      task.requestId !== request.requestId ||
      task.kind !== 'configuration_backup' ||
      task.resource !== 'configuration' ||
      (task.state === 'succeeded' && !task.configurationBackup)
    )
      throw invalid()
    const result = task.configurationBackup
    if (
      result &&
      (new Set(result.completed).size !== result.completed.length ||
        (task.state === 'succeeded' &&
          (result.failedStage || result.uncertainStage || result.recoveryRequired)))
    )
      throw invalid()
    return task
  }
  return {
    supported,
    async stage(raw, signal) {
      const current = scope()
      return stageConfiguration(raw, backupMaximumBytes, {
        begin: (bytes) => post(current, 'begin', { bytes }, signal, validUpload),
        append: (uploadId, offset, data) =>
          post(current, 'append', { uploadId, offset, data }, signal, validAppend),
        async abort(uploadId) {
          await post(current, 'abort', { uploadId }, new AbortController().signal, validEmpty)
        },
      })
    },
    async preview(uploadId, signal) {
      const result = await post(scope(), 'preview', { uploadId }, signal, validPreview)
      for (const category of Object.values(result.categories))
        if (
          category.added + category.replaced !== category.count ||
          (!category.present && category.count !== 0)
        )
          throw invalid()
      return result
    },
    async abort(uploadId, signal) {
      await post(scope(), 'abort', { uploadId }, signal, validEmpty)
    },
    async submit(request, signal) {
      const current = scope()
      if (!validRequest({ ...request, context: current.context }))
        throw new ApiError('conflict', 'Invalid configuration backup commit')
      const result = await post(current, 'commit', request, signal, validTask, 202)
      verifyTask(result.task, request)
      return result.task
    },
    async find(request, signal) {
      const result = await post(
        scope(),
        'status',
        { requestId: request.requestId },
        signal,
        validLookup,
      )
      return verifyTask(result.task, request)
    },
  }
}
