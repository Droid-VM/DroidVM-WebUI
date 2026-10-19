import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type Task, type OperationGateway } from '../../tasks'

export type RescueSession = components['schemas']['AgentRescueSession']
export type RescueCloseRequest = Omit<components['schemas']['AgentRescueCloseRequest'], 'context'>
export interface AgentRescueGateway extends OperationGateway<RescueCloseRequest> {
  list(signal: AbortSignal): Promise<RescueSession[]>
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
const listValid =
  compileContract<components['schemas']['AgentRescueSessions']>('AgentRescueSessions')
const requestValid =
  compileContract<components['schemas']['AgentRescueCloseRequest']>('AgentRescueCloseRequest')
const invalid = () => new ApiError('invalid-response', 'Invalid agent rescue response')

export function createAgentRescueGateway(
  client: HttpClient,
  access: () => Access | null,
): AgentRescueGateway {
  const supported = () => {
    const current = access()
    return (
      !!current?.administrator &&
      current.manageTasks &&
      current.capabilities.includes('agent.rescue.v1')
    )
  }
  function scope() {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!supported()) throw new ApiError('unsupported', 'Agent rescue unavailable')
    return current
  }
  function context(value: Access['context'], current: Access) {
    if (
      value.daemonEpoch !== current.context.daemonEpoch ||
      value.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Agent rescue context changed')
  }
  function verify(task: Task | null, request: RescueCloseRequest) {
    if (!task) return null
    checkTask(task)
    if (
      task.kind !== 'agent_rescue_close' ||
      task.resource !== 'agent-rescue:' + request.sessionId ||
      task.requestId !== request.requestId
    )
      throw invalid()
    const result = task.agentRescueCleanup
    if (result && result.sessionId !== request.sessionId) throw invalid()
    if (
      task.state === 'succeeded' &&
      (!result || !result.cleanup.stopped || !result.cleanup.removed || !result.cleanup.diskSynced)
    )
      throw invalid()
    return task
  }
  return {
    supported,
    async list(signal) {
      const current = scope()
      const value = await client.getJson('/api/v1/agent-rescue-sessions', signal)
      if (!listValid(value)) throw invalid()
      context(value.context, current)
      const seen = new Set<string>()
      for (const row of value.items) {
        if (
          seen.has(row.id) ||
          BigInt(row.expected.revision) > 18446744073709551615n ||
          (row.expired && row.remainingMs !== 0)
        )
          throw invalid()
        seen.add(row.id)
      }
      return value.items
    },
    async submit(request, signal) {
      const current = scope()
      const body = { ...request, context: current.context }
      if (!requestValid(body)) throw new ApiError('conflict', 'Invalid rescue close request')
      const value = await client.postJson('/api/v1/agent-rescue-operations', body, signal, {
        csrf: current.csrfToken,
        status: 202,
      })
      if (!responseValid(value)) throw invalid()
      context(value.context, current)
      verify(value.task, request)
      return value.task
    },
    async find(request, signal) {
      const current = scope()
      const value = await client.getJson(
        `/api/v1/agent-rescue-operations/${encodeURIComponent(request.requestId)}`,
        signal,
      )
      if (!lookupValid(value)) throw invalid()
      context(value.context, current)
      return verify(value.task, request)
    },
  }
}
