import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask } from './http'

interface ReceiptAccess {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  administrator: boolean
  manageTasks: boolean
  hostId?: string
}

// Historical receipts are evidence for the original operation, never a current
// task handle: callers only settle their journal and refresh resource snapshots.
export async function recoverLookup<T extends { task: components['schemas']['Task'] | null }>(
  client: HttpClient,
  access: ReceiptAccess | null,
  requestId: string,
  lookup: T,
  signal: AbortSignal,
): Promise<T> {
  if (
    lookup.task ||
    !access?.hostId ||
    !access.administrator ||
    !access.manageTasks ||
    !access.capabilities.includes('tasks.receipts.v1')
  )
    return lookup
  const value = await client.getJson(
    `/api/v1/tasks/receipts/${encodeURIComponent(requestId)}`,
    signal,
  )
  const valid = compileContract<components['schemas']['TaskReceiptResponse']>('TaskReceiptResponse')
  if (!valid(value)) throw new ApiError('invalid-response', 'Invalid operation receipt')
  if (
    value.hostId !== access.hostId ||
    value.context.daemonEpoch !== access.context.daemonEpoch ||
    value.context.sessionId !== access.context.sessionId
  )
    throw new ApiError('context-changed', 'Operation receipt host or session changed')
  const receipt = value.receipt
  if (!receipt) return lookup
  if (receipt.task.requestId !== requestId)
    throw new ApiError('invalid-response', 'Operation receipt identity changed')
  checkTask(receipt.task)
  const terminal = ['succeeded', 'failed', 'cancelled'].includes(receipt.task.state)
  if (receipt.status === 'unknown') return lookup
  if (
    (receipt.status === 'terminal') !== terminal ||
    (receipt.status === 'active' && receipt.epoch !== access.context.daemonEpoch)
  )
    throw new ApiError('invalid-response', 'Inconsistent historical operation receipt')
  return {
    ...lookup,
    task: receipt.task,
    ...('version' in receipt ? { version: receipt.version } : {}),
  }
}
