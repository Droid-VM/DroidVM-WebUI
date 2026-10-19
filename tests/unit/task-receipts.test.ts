import { expect, it, vi } from 'vitest'
import { recoverLookup } from '../../src/modules/tasks/api/receipts'
import type { Task } from '../../src/modules/tasks'
import type { HttpClient } from '../../src/shared/api/httpClient'

const context = { daemonEpoch: 'current-epoch', sessionId: 'a'.repeat(64) }
const access = {
  context,
  hostId: 'host-1',
  administrator: true,
  manageTasks: true,
  capabilities: ['tasks.receipts.v1'],
}
const task: Task = {
  id: 'task-1',
  requestId: 'request-1',
  kind: 'disk_operation',
  resource: 'disk:disk-1',
  revision: '3',
  state: 'succeeded',
  cancellable: false,
  phase: '',
  unit: '',
  completed: '0',
  total: null,
  createdMs: '1',
  finishedMs: '2',
  resultAvailable: true,
  errorCode: null,
}
const signal = new AbortController().signal
function setup(status = 'terminal', epoch = 'old-epoch', value = task) {
  const response = { context, hostId: 'host-1', receipt: { status, epoch, task: value } }
  const client: HttpClient = {
    getJson: vi.fn(async () => response),
    postJson: vi.fn(),
    delete: vi.fn(),
  }
  return { client, response }
}

it('finds original terminal evidence across daemon epochs without replaying a write', async () => {
  const { client } = setup()
  const result = await recoverLookup(client, access, 'request-1', { context, task: null }, signal)
  expect(result.task).toEqual(task)
  expect(client.getJson).toHaveBeenCalledWith('/api/v1/tasks/receipts/request-1', signal)
  expect(client.postJson).not.toHaveBeenCalled()
})

it('keeps interrupted records unknown and rejects a different host or request', async () => {
  const { client, response } = setup('unknown')
  expect((await recoverLookup(client, access, 'request-1', { task: null }, signal)).task).toBeNull()
  response.hostId = 'other-host'
  await expect(
    recoverLookup(client, access, 'request-1', { task: null }, signal),
  ).rejects.toMatchObject({ code: 'context-changed' })
  response.hostId = access.hostId
  await expect(
    recoverLookup(client, access, 'wrong-request', { task: null }, signal),
  ).rejects.toMatchObject({ code: 'invalid-response' })
})

it('only accepts active receipts from the current daemon', async () => {
  const running = { ...task, state: 'running' as const, finishedMs: null, resultAvailable: false }
  const { client, response } = setup('active', 'old-epoch', running)
  await expect(
    recoverLookup(client, access, 'request-1', { task: null }, signal),
  ).rejects.toMatchObject({ code: 'invalid-response' })
  response.receipt.epoch = context.daemonEpoch
  expect((await recoverLookup(client, access, 'request-1', { task: null }, signal)).task).toEqual(
    running,
  )
})

it('does not look up receipts before authorization or when the live result exists', async () => {
  const { client } = setup()
  await recoverLookup(client, null, 'request-1', { task: null }, signal)
  await recoverLookup(
    client,
    { ...access, administrator: false },
    'request-1',
    { task: null },
    signal,
  )
  await recoverLookup(client, access, 'request-1', { task }, signal)
  expect(client.getJson).not.toHaveBeenCalled()
})
