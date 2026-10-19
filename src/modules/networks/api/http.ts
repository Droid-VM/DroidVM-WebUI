import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { stageConfiguration } from '../../../shared/api/stagedUpload'
import { readConfigurationSnapshot } from '../../../shared/api/configurationSnapshot'
import { recoverLookup, checkTask, type Task } from '../../tasks'
import { createCommitTracking } from '../../../shared/model/commitTracking'
import type { NetworkConfigurationGateway } from './gateway'

type Schemas = components['schemas']
interface Access {
  hostId?: string
  context: Schemas['ServerContext']
  csrfToken: string
  capabilities: readonly string[]
  administrator: boolean
  manageTasks: boolean
}
const pageValid = compileContract<Schemas['NetworkConfigPage']>('NetworkConfigPage')
const uploadValid = compileContract<Schemas['ConfigUpload']>('ConfigUpload')
const appendValid = compileContract<Schemas['NetworkConfigAppend']>('NetworkConfigAppend')
const emptyValid = compileContract<Schemas['ConfigEmpty']>('ConfigEmpty')
const taskValid = compileContract<Schemas['TaskResponse']>('TaskResponse')
const statusValid = compileContract<Schemas['NetworkConfigStatus']>('NetworkConfigStatus')
const invalid = () => new ApiError('invalid-response', 'Invalid network configuration response')

export function createNetworkConfigurationGateway(
  client: HttpClient,
  access: () => Access | null,
): NetworkConfigurationGateway {
  const permits = (value: Access | null) =>
    !!value?.administrator &&
    value.manageTasks &&
    value.capabilities.includes('networks.configuration.v1')
  function requireAccess() {
    const value = access()
    if (!value) throw new ApiError('unauthenticated', 'Session required')
    if (!permits(value)) throw new ApiError('unsupported', 'Network configuration unavailable')
    return value
  }
  async function request<T extends { context: Access['context'] }>(
    current: Access,
    operation: string,
    input: object,
    signal: AbortSignal,
    validate: (value: unknown) => value is T,
    status: 200 | 202 = 200,
  ): Promise<T> {
    const result = await client.postJson(
      `/api/v1/network-configuration/${operation}`,
      { ...input, context: current.context },
      signal,
      { csrf: current.csrfToken, status },
    )
    if (!validate(result)) throw invalid()
    if (
      result.context.daemonEpoch !== current.context.daemonEpoch ||
      result.context.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Network configuration identity changed')
    return result
  }
  async function cleanup(current: Access, operation: 'release' | 'abort', input: object) {
    try {
      await request(current, operation, input, new AbortController().signal, emptyValid)
    } catch {
      /* Existing bounded lease expires if cleanup cannot reach its owner. */
    }
  }
  function task(value: Task, requestId: string) {
    if (
      value.kind !== 'network_configuration' ||
      value.resource !== 'networks' ||
      value.requestId !== requestId
    )
      throw invalid()
    checkTask(value)
    return value
  }
  return {
    tracking: createCommitTracking(
      'network-configuration',
      'network-configuration',
      ['networkId'],
      ['uploadId'],
    ),
    supported: () => permits(access()),
    async read(signal) {
      const current = requireAccess()
      return (
        await readConfigurationSnapshot(
          current.context.daemonEpoch,
          8 * 1024 * 1024,
          (snapshotId, offset) =>
            request(current, 'read', { snapshotId, offset }, signal, pageValid),
          (snapshotId) => cleanup(current, 'release', { snapshotId }),
        )
      ).json
    },
    async stage(json, signal) {
      const current = requireAccess()
      return stageConfiguration(json, 17 * 1024 * 1024, {
        begin: (bytes) => request(current, 'begin', { bytes }, signal, uploadValid),
        append: (uploadId, offset, data) =>
          request(current, 'append', { uploadId, offset, data }, signal, appendValid),
        abort: (uploadId) => cleanup(current, 'abort', { uploadId }),
      })
    },
    async abort(uploadId, signal) {
      await request(requireAccess(), 'abort', { uploadId }, signal, emptyValid)
    },
    async submit(input, signal) {
      return task(
        (
          await request(
            requireAccess(),
            'commit',
            { uploadId: input.uploadId, requestId: input.requestId },
            signal,
            taskValid,
            202,
          )
        ).task,
        input.requestId,
      )
    },
    async find(input, signal) {
      const result = await request(
        requireAccess(),
        'status',
        { requestId: input.requestId },
        signal,
        statusValid,
      )
      const recovered = await recoverLookup(client, access(), input.requestId, result, signal)
      if (!statusValid(recovered)) throw invalid()
      if ((recovered.task?.state === 'succeeded') !== !!recovered.version) throw invalid()
      return recovered.task ? task(recovered.task, input.requestId) : null
    },
  }
}
