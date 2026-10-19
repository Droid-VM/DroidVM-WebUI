import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import { stageConfiguration } from '../../../shared/api/stagedUpload'
import { readConfigurationSnapshot } from '../../../shared/api/configurationSnapshot'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask } from '../../tasks'
import type { ConfigurationGateway } from './gateway'

type Schemas = components['schemas']
interface Access {
  context: Schemas['ServerContext']
  csrfToken: string
  capabilities: readonly string[]
  administrator: boolean
  manageTasks: boolean
}
const pageValid = compileContract<Schemas['ConfigPage']>('ConfigPage')
const defaultsValid = compileContract<Schemas['ConfigDefaults']>('ConfigDefaults')
const uploadValid = compileContract<Schemas['ConfigUpload']>('ConfigUpload')
const appendValid = compileContract<Schemas['ConfigAppend']>('ConfigAppend')
const emptyValid = compileContract<Schemas['ConfigEmpty']>('ConfigEmpty')
const statusValid = compileContract<Schemas['ConfigStatus']>('ConfigStatus')
const taskValid = compileContract<Schemas['TaskResponse']>('TaskResponse')
const maximum = 16 * 1024 * 1024
const invalid = () => new ApiError('invalid-response', 'Invalid configuration response')
export function createConfigurationGateway(
  client: HttpClient,
  access: () => Access | null,
): ConfigurationGateway {
  const permits = (value: Access | null) =>
    !!value?.administrator &&
    value.manageTasks &&
    value.capabilities.includes('vm.configuration.v1')
  function requireAccess() {
    const value = access()
    if (!value) throw new ApiError('unauthenticated', 'Session required')
    if (!permits(value)) throw new ApiError('unsupported', 'Configuration unavailable')
    return value
  }
  async function request<T extends { context: Access['context'] }>(
    current: Access,
    operation: string,
    input: object,
    signal: AbortSignal,
    validate: (value: unknown) => value is T,
    accepted: 200 | 202 = 200,
  ): Promise<T> {
    const result = await client.postJson(
      `/api/v1/vm-configuration/${operation}`,
      { ...input, context: current.context },
      signal,
      { csrf: current.csrfToken, status: accepted },
    )
    if (!validate(result)) throw invalid()
    if (
      result.context.daemonEpoch !== current.context.daemonEpoch ||
      result.context.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Configuration identity changed')
    return result
  }
  async function cleanup(current: Access, operation: 'release' | 'abort', input: object) {
    try {
      await request(current, operation, input, new AbortController().signal, emptyValid)
    } catch {
      /* Existing bounded lease expires if cleanup cannot reach the owner. */
    }
  }
  return {
    supported: () => permits(access()),
    defaultsSupported: () =>
      permits(access()) && !!access()?.capabilities.includes('vm.defaults.v1'),
    async defaults(signal) {
      const current = requireAccess()
      if (!current.capabilities.includes('vm.defaults.v1'))
        throw new ApiError('unsupported', 'VM defaults unavailable')
      const result = await request(current, 'defaults', {}, signal, defaultsValid)
      if (new TextEncoder().encode(result.json).length > 65536) throw invalid()
      return result.json
    },
    async read(signal) {
      const current = requireAccess()
      const { json, metadata } = await readConfigurationSnapshot(
        current.context.daemonEpoch,
        maximum,
        (snapshotId, offset) => request(current, 'read', { snapshotId, offset }, signal, pageValid),
        (snapshotId) => cleanup(current, 'release', { snapshotId }),
      )
      const { revision, persisted, recovered, durabilityUncertain } = metadata
      return { json, version: { revision, persisted, recovered, durabilityUncertain } }
    },
    async stage(revision, json, signal) {
      const current = requireAccess()
      return stageConfiguration(json, maximum, {
        begin: (bytes) => request(current, 'begin', { revision, bytes }, signal, uploadValid),
        append: (uploadId, offset, data) =>
          request(current, 'append', { uploadId, offset, data }, signal, appendValid),
        abort: (uploadId) => cleanup(current, 'abort', { uploadId }),
      })
    },
    async abort(uploadId, signal) {
      await request(requireAccess(), 'abort', { uploadId }, signal, emptyValid)
    },
    async commit(uploadId, requestId, signal) {
      const result = await request(
        requireAccess(),
        'commit',
        { uploadId, requestId },
        signal,
        taskValid,
        202,
      )
      if (result.task.requestId !== requestId || result.task.kind !== 'vm_configuration')
        throw invalid()
      checkTask(result.task)
      return result.task
    },
    async status(requestId, signal) {
      const result = await request(requireAccess(), 'status', { requestId }, signal, statusValid)
      if (result.task) {
        if (
          result.task.requestId !== requestId ||
          result.task.kind !== 'vm_configuration' ||
          (result.task.state === 'succeeded') !== !!result.version
        )
          throw invalid()
        checkTask(result.task)
      } else if (result.version) throw invalid()
      return result
    },
  }
}
