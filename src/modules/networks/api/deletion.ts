import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { stageConfiguration } from '../../../shared/api/stagedUpload'
import { createCommitTracking } from '../../../shared/model/commitTracking'
import {
  recoverLookup,
  checkTask,
  type OperationGateway,
  type OperationTracking,
  type Task,
} from '../../tasks'

type Schemas = components['schemas']
export interface NetworkDeletionCommit {
  networkId: string
  uploadId: string
  requestId: string
}
export interface NetworkDeletionGateway extends OperationGateway<NetworkDeletionCommit> {
  tracking?: OperationTracking<NetworkDeletionCommit>
  stage(json: string, revision: string, signal: AbortSignal): Promise<string>
  abort(uploadId: string, signal: AbortSignal): Promise<void>
}
export interface ConfigurationRecoveryRequest {
  requestId: string
}
export interface ConfigurationRecoveryGateway
  extends OperationGateway<ConfigurationRecoveryRequest> {
  tracking?: OperationTracking<ConfigurationRecoveryRequest>
}
interface Access {
  hostId?: string
  context: Schemas['ServerContext']
  csrfToken: string
  capabilities: readonly string[]
  administrator: boolean
  manageTasks: boolean
}
const uploadValid = compileContract<Schemas['ConfigUpload']>('ConfigUpload')
const appendValid = compileContract<Schemas['NetworkConfigAppend']>('NetworkConfigAppend')
const emptyValid = compileContract<Schemas['ConfigEmpty']>('ConfigEmpty')
const taskValid = compileContract<Schemas['TaskResponse']>('TaskResponse')
const statusValid = compileContract<Schemas['NetworkDeletionStatus']>('NetworkDeletionStatus')
const lookupValid = compileContract<Schemas['VmOperationLookup']>('VmOperationLookup')
const invalid = () => new ApiError('invalid-response', 'Invalid network deletion response')
function boundary(client: HttpClient, access: () => Access | null, capability: string) {
  const permitted = (value: Access | null) =>
    !!value?.administrator && value.manageTasks && value.capabilities.includes(capability)
  function current() {
    const value = access()
    if (!value) throw new ApiError('unauthenticated', 'Session required')
    if (!permitted(value)) throw new ApiError('unsupported', 'Configuration operation unavailable')
    return value
  }
  function check<T extends { context: Access['context'] }>(
    value: unknown,
    expected: Access,
    valid: (value: unknown) => value is T,
  ): T {
    if (!valid(value)) throw invalid()
    if (
      value.context.daemonEpoch !== expected.context.daemonEpoch ||
      value.context.sessionId !== expected.context.sessionId
    )
      throw new ApiError('context-changed', 'Configuration operation identity changed')
    return value
  }
  return {
    supported: () => permitted(access()),
    async post<T extends { context: Access['context'] }>(
      path: `/api/v1/${string}`,
      input: object,
      signal: AbortSignal,
      valid: (value: unknown) => value is T,
      status: 200 | 202 = 200,
    ) {
      const expected = current()
      return check(
        await client.postJson(path, { ...input, context: expected.context }, signal, {
          csrf: expected.csrfToken,
          status,
        }),
        expected,
        valid,
      )
    },
    async get<T extends { context: Access['context'] }>(
      path: `/api/v1/${string}`,
      signal: AbortSignal,
      valid: (value: unknown) => value is T,
    ) {
      const expected = current()
      return check(await client.getJson(path, signal), expected, valid)
    },
  }
}
function task(value: Task, requestId: string, kind: 'network_deletion' | 'configuration_recovery') {
  if (value.requestId !== requestId || value.kind !== kind || value.resource !== 'networks')
    throw invalid()
  checkTask(value)
  return value
}
export function createNetworkDeletionGateway(
  client: HttpClient,
  access: () => Access | null,
): NetworkDeletionGateway {
  const api = boundary(client, access, 'networks.deletion.v1'),
    base = '/api/v1/network-deletion'
  async function abort(uploadId: string, signal: AbortSignal) {
    await api.post(`${base}/abort`, { uploadId }, signal, emptyValid)
  }
  return {
    supported: api.supported,
    tracking: createCommitTracking('network-deletion', 'deletion', ['networkId'], ['uploadId']),
    async stage(json, revision, signal) {
      return stageConfiguration(json, 9 * 1024 * 1024, {
        begin: (bytes) => api.post(`${base}/begin`, { revision, bytes }, signal, uploadValid),
        append: (uploadId, offset, data) =>
          api.post(`${base}/append`, { uploadId, offset, data }, signal, appendValid),
        abort: async (uploadId) => {
          try {
            await abort(uploadId, new AbortController().signal)
          } catch {
            /* Bounded upload lease. */
          }
        },
      })
    },
    abort,
    async submit(input, signal) {
      const result = await api.post(
        `${base}/commit`,
        { uploadId: input.uploadId, requestId: input.requestId },
        signal,
        taskValid,
        202,
      )
      return task(result.task, input.requestId, 'network_deletion')
    },
    async find(input, signal) {
      const result = await api.post(
        `${base}/status`,
        { requestId: input.requestId },
        signal,
        statusValid,
      )
      const recovered = await recoverLookup(client, access(), input.requestId, result, signal)
      if (!statusValid(recovered)) throw invalid()
      if (
        (recovered.task?.state === 'succeeded') !== !!recovered.version ||
        (recovered.version && recovered.version.networkId !== input.networkId)
      )
        throw invalid()
      return recovered.task ? task(recovered.task, input.requestId, 'network_deletion') : null
    },
  }
}
export function createConfigurationRecoveryGateway(
  client: HttpClient,
  access: () => Access | null,
): ConfigurationRecoveryGateway {
  const api = boundary(client, access, 'configuration.recovery.v1'),
    base = '/api/v1/configuration-recovery'
  return {
    tracking: createCommitTracking('configuration-recovery', 'recovery'),
    supported: api.supported,
    async submit(input, signal) {
      const result = await api.post(base, input, signal, taskValid, 202)
      return task(result.task, input.requestId, 'configuration_recovery')
    },
    async find(input, signal) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId)) throw invalid()
      const result = await api.get(`${base}/${input.requestId}`, signal, lookupValid)
      const recovered = await recoverLookup(client, access(), input.requestId, result, signal)
      return recovered.task ? task(recovered.task, input.requestId, 'configuration_recovery') : null
    },
  }
}
