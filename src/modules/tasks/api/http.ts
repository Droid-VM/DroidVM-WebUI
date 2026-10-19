import type { components, paths } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import type { Task, TaskGateway, TaskSnapshot } from './gateway'

interface TaskAccess {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  manageTasks: boolean
}
const listPath = '/api/v1/tasks' satisfies keyof paths
const cancelPath = '/api/v1/tasks/cancel' satisfies keyof paths
const snapshotValid = compileContract<TaskSnapshot>('TaskSnapshot')
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')

function checkContext(actual: TaskAccess['context'], expected: TaskAccess['context']) {
  if (actual.daemonEpoch !== expected.daemonEpoch || actual.sessionId !== expected.sessionId)
    throw new ApiError('context-changed', 'Server or browser session changed')
}
export function checkTask(task: Task) {
  const terminal = ['succeeded', 'failed', 'cancelled'].includes(task.state)
  if (
    (task.total !== null && BigInt(task.completed) > BigInt(task.total)) ||
    ((terminal || task.state === 'cancelling') && task.cancellable) ||
    terminal !== (task.finishedMs !== null) ||
    (task.finishedMs !== null && BigInt(task.finishedMs) < BigInt(task.createdMs))
  )
    throw new ApiError('invalid-response', 'Inconsistent task state')
}
export function createHttpTaskGateway(
  client: HttpClient,
  access: () => TaskAccess | null,
): TaskGateway {
  const permits = (capability: string) => {
    const current = access()
    return !!current?.manageTasks && current.capabilities.includes(capability)
  }
  function requireAccess(capability: string) {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!current.manageTasks) throw new ApiError('permission-denied', 'Task permission required')
    if (!current.capabilities.includes(capability))
      throw new ApiError('unsupported', 'Task adapter unavailable')
    return current
  }
  return {
    supported: () => permits('tasks.list.v1'),
    canCancel: () => permits('tasks.cancel.v1'),
    async list(signal) {
      const current = requireAccess('tasks.list.v1')
      const value = await client.getJson(listPath, signal)
      if (!snapshotValid(value)) throw new ApiError('invalid-response', 'Invalid task snapshot')
      checkContext(value.context, current.context)
      if (value.cursor.epoch !== current.context.daemonEpoch)
        throw new ApiError('context-changed', 'Task epoch changed')
      const ids = new Set<string>()
      for (const task of value.items) {
        if (ids.has(task.id)) throw new ApiError('invalid-response', 'Duplicate task')
        ids.add(task.id)
        checkTask(task)
      }
      return value
    },
    async cancel(id, signal) {
      const current = requireAccess('tasks.cancel.v1')
      const body: components['schemas']['CancelTaskRequest'] = {
        context: current.context,
        taskId: id,
      }
      const value = await client.postJson(cancelPath, body, signal, {
        csrf: current.csrfToken,
        status: 200,
      })
      if (!responseValid(value)) throw new ApiError('invalid-response', 'Invalid task response')
      checkContext(value.context, current.context)
      if (value.task.id !== id) throw new ApiError('invalid-response', 'Unexpected task identity')
      checkTask(value.task)
      return value.task
    },
  }
}
