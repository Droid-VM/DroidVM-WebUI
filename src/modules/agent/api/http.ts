import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask } from '../../tasks'
import {
  clearAgentPassword,
  validAgentPassword,
  type AgentGateway,
  type AgentReference,
  type AgentPreparation,
} from './gateway'

interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
const requestValid =
  compileContract<components['schemas']['AgentOperationRequest']>('AgentOperationRequest')
const recoveryRequestValid =
  compileContract<components['schemas']['AgentRecoveryRequest']>('AgentRecoveryRequest')
const recoveryStatusValid =
  compileContract<components['schemas']['AgentRecoveryStatus']>('AgentRecoveryStatus')

export function createAgentGateway(
  client: HttpClient,
  access: () => Access | null,
  prepare: (id: string, signal: AbortSignal) => Promise<AgentPreparation>,
): AgentGateway {
  const permits = (capability: string) => {
    const value = access()
    return !!value?.administrator && value.manageTasks && value.capabilities.includes(capability)
  }
  const supported = () =>
    permits('agent.operations.v1') &&
    ['disks.list.v1', 'disks.inspect.v1'].every((cap) => access()?.capabilities.includes(cap))
  const recoverySupported = () => permits('agent.recovery.v1')
  function scope(recovery = false) {
    const value = access()
    if (!value) throw new ApiError('unauthenticated', 'Session required')
    if (!(recovery ? recoverySupported() : supported()))
      throw new ApiError('unsupported', 'Agent operations unavailable')
    return value
  }
  function context(actual: Access['context'], expected: Access) {
    if (
      actual.daemonEpoch !== expected.context.daemonEpoch ||
      actual.sessionId !== expected.context.sessionId
    )
      throw new ApiError('context-changed', 'Agent context changed')
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    expected: Access,
    reference: AgentReference | { requestId: string },
  ) {
    context(value.context, expected)
    const task = value.task
    if (!task) return null
    checkTask(task)
    const operation = 'diskId' in reference
    if (
      task.requestId !== reference.requestId ||
      task.kind !== (operation ? 'agent_operation' : 'agent_recovery') ||
      task.resource !== (operation ? 'disk:' + reference.diskId : 'agent')
    )
      throw new ApiError('invalid-response', 'Agent task identity changed')
    const result = task.agentResult
    if (operation) {
      if (
        result &&
        ((result.outcome === 'rescue_ready' && task.state !== 'succeeded') ||
          (result.rescueSessionId && result.outcome !== 'rescue_ready'))
      )
        throw new ApiError('invalid-response', 'Invalid rescue handoff state')
      if (
        result &&
        (result.diskId !== reference.diskId ||
          result.action !== reference.action ||
          result.actions.some((row) => row.action !== reference.action))
      )
        throw new ApiError('invalid-response', 'Agent result identity changed')
      if (
        task.state === 'succeeded' &&
        (!result ||
          (result.outcome === 'rescue_ready'
            ? !reference.rescue ||
              !result.rescueSessionId ||
              !/^[a-f0-9]{64}$/.test(result.rescueSessionId) ||
              result.durabilityConfirmed ||
              result.cleanup.stopped ||
              result.cleanup.removed ||
              result.cleanup.diskSynced
            : result.outcome !== 'succeeded' ||
              !result.durabilityConfirmed ||
              !result.cleanup.stopped ||
              !result.cleanup.removed ||
              !result.cleanup.diskSynced) ||
          result.recoveryRequired)
      )
        throw new ApiError('invalid-response', 'Agent success lacks durable cleanup')
    } else if (result || (task.state === 'succeeded' && task.pendingRecords === undefined)) {
      throw new ApiError('invalid-response', 'Invalid agent recovery result')
    }
    return task
  }
  return {
    supported,
    rescueSupported: () => supported() && permits('agent.rescue.v1'),
    async prepare(id, signal) {
      scope()
      const { catalog, detail } = await prepare(id, signal)
      if (
        !catalog.vmRevision ||
        detail.revision !== catalog.revision ||
        detail.vmRevision !== catalog.vmRevision
      )
        throw new ApiError('conflict', 'Disk confirmation changed')
      return { catalog, detail }
    },
    async submit(request, signal) {
      // Capture only non-secret lookup identity. The mutation body is never saved.
      const reference = {
        requestId: request.requestId,
        diskId: request.operation.diskId,
        action: request.operation.action,
        ...(request.rescue ? { rescue: true } : {}),
      }
      try {
        const current = scope()
        if (request.rescue && !permits('agent.rescue.v1'))
          throw new ApiError('unsupported', 'Rescue terminal unavailable')
        const body = { ...request, context: current.context }
        if (
          !requestValid(body) ||
          (request.operation.action === 'chpasswd' &&
            !validAgentPassword(request.operation.password))
        )
          throw new ApiError('conflict', 'Invalid agent operation')
        const response = client.postJson('/api/v1/agent-operations', body, signal, {
          csrf: current.csrfToken,
          status: 202,
        })
        // HttpClient serializes synchronously before its first await.
        clearAgentPassword(request.operation)
        const value = await response
        if (!responseValid(value)) throw new ApiError('invalid-response', 'Invalid agent receipt')
        verify(value, current, reference)
        return value.task
      } finally {
        clearAgentPassword(request.operation)
      }
    },
    async find(reference, signal) {
      const current = scope()
      const value = await client.getJson(
        `/api/v1/agent-operations/${encodeURIComponent(reference.requestId)}`,
        signal,
      )
      if (!lookupValid(value)) throw new ApiError('invalid-response', 'Invalid agent lookup')
      return verify(value, current, reference)
    },
    recovery: {
      supported: recoverySupported,
      async status(signal) {
        const current = scope(true)
        const value = await client.getJson('/api/v1/agent-recovery', signal)
        if (!recoveryStatusValid(value))
          throw new ApiError('invalid-response', 'Invalid agent recovery status')
        context(value.context, current)
        return value.pendingRecords
      },
      async submit(request, signal) {
        const current = scope(true)
        const body = { ...request, context: current.context }
        if (!recoveryRequestValid(body)) throw new ApiError('conflict', 'Invalid recovery request')
        const value = await client.postJson('/api/v1/agent-recovery', body, signal, {
          csrf: current.csrfToken,
          status: 202,
        })
        if (!responseValid(value))
          throw new ApiError('invalid-response', 'Invalid recovery receipt')
        verify(value, current, request)
        return value.task
      },
      async find(request, signal) {
        const current = scope(true)
        const value = await client.getJson(
          `/api/v1/agent-recovery/${encodeURIComponent(request.requestId)}`,
          signal,
        )
        if (!lookupValid(value)) throw new ApiError('invalid-response', 'Invalid recovery lookup')
        return verify(value, current, request)
      },
    },
  }
}
