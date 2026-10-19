import { expect, it, vi } from 'vitest'
import { createAgentRescueGateway, type RescueSession } from '../../src/modules/agent/api/rescue'
import { createAgentGateway } from '../../src/modules/agent/api/http'
import { createAgentRescue } from '../../src/modules/agent/model/rescue'
import { createVmTerminalGateway } from '../../src/modules/terminal/api/websocket'
import type { Task } from '../../src/modules/tasks'

vi.mock(
  '../../src/modules/terminal',
  async () => import('../../src/modules/terminal/model/terminal'),
)

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const id = 'b'.repeat(64),
  diskId = '11111111-1111-4111-8111-111111111111'
const row: RescueSession = {
  id,
  diskId,
  expected: { instanceId: 'c'.repeat(32), revision: '0' },
  remainingMs: 900000,
  closing: false,
  expired: false,
}
const access = () => ({
  context,
  csrfToken: 'd'.repeat(64),
  administrator: true,
  manageTasks: true,
  capabilities: ['agent.rescue.v1', 'agent.operations.v1', 'disks.list.v1', 'disks.inspect.v1'],
})
const task = (): Task => ({
  id: 'close-task',
  requestId: 'close-request',
  kind: 'agent_rescue_close',
  resource: 'agent-rescue:' + id,
  revision: '2',
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
  agentRescueCleanup: {
    sessionId: id,
    cleanup: { stopped: true, removed: true, diskSynced: true },
  },
})

it('validates rescue ownership, zero runtime revision, expiry and actual close cleanup', async () => {
  const client = {
    getJson: vi.fn().mockResolvedValue({ context, items: [row] }),
    postJson: vi.fn().mockResolvedValue({ context, task: task() }),
    delete: vi.fn(),
  }
  const gateway = createAgentRescueGateway(client, access),
    signal = new AbortController().signal
  expect(await gateway.list(signal)).toEqual([row])
  client.getJson.mockResolvedValueOnce({ context, items: [row, row] })
  await expect(gateway.list(signal)).rejects.toMatchObject({ code: 'invalid-response' })
  client.getJson.mockResolvedValueOnce({
    context: { ...context, sessionId: 'e'.repeat(64) },
    items: [row],
  })
  await expect(gateway.list(signal)).rejects.toMatchObject({ code: 'context-changed' })
  const request = { requestId: 'close-request', sessionId: id }
  expect((await gateway.submit(request, signal)).agentRescueCleanup?.cleanup.diskSynced).toBe(true)
  expect(client.postJson).toHaveBeenCalledWith(
    '/api/v1/agent-rescue-operations',
    { ...request, context },
    signal,
    { csrf: access().csrfToken, status: 202 },
  )
  client.getJson.mockResolvedValueOnce({
    context,
    task: {
      ...task(),
      agentRescueCleanup: {
        sessionId: id,
        cleanup: { stopped: true, removed: true, diskSynced: false },
      },
    },
  })
  await expect(gateway.find(request, signal)).rejects.toMatchObject({ code: 'invalid-response' })
})

it('only queries unknown close requests and permits an explicitly confirmed retry after failed cleanup', async () => {
  const gateway = {
    supported: () => true,
    list: vi.fn().mockResolvedValue([{ ...row, closing: true }]),
    submit: vi.fn().mockRejectedValue(new Error('lost close receipt')),
    find: vi.fn().mockResolvedValue(null),
  }
  const model = createAgentRescue(gateway, undefined, () => 'close-request')
  model.bind('session')
  await model.readList()
  expect(model.canClose(id)).toBe(true)
  await model.close(id)
  await model.close(id)
  await model.refresh()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.find).toHaveBeenCalledTimes(1)
  expect(model.canClose(id)).toBe(false)
  gateway.find.mockResolvedValueOnce({
    ...task(),
    state: 'failed',
    errorCode: 'IO_ERROR',
    agentRescueCleanup: {
      sessionId: id,
      cleanup: { stopped: true, removed: false, diskSynced: false },
    },
  })
  await model.refresh()
  expect(model.canClose(id)).toBe(true)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  let finish!: (value: RescueSession[]) => void
  gateway.list.mockImplementationOnce(
    () =>
      new Promise<RescueSession[]>((resolve) => {
        finish = resolve
      }),
  )
  const late = model.readList()
  model.bind('other-session')
  finish([row])
  await late
  expect(model.items.value).toEqual([])
  expect(model.entries.value).toEqual({})
  model.dispose()
})

it('uses fixed rescue metadata and WS endpoints with the original protocol and separate capability', async () => {
  const metadata = {
    context,
    vmId: id,
    expected: row.expected,
    streams: ['uart'],
    resizeSupported: false as const,
  }
  const client = {
    getJson: vi.fn().mockResolvedValue(metadata),
    postJson: vi.fn(),
    delete: vi.fn(),
  }
  const socket = {
    readyState: 1,
    bufferedAmount: 0,
    onopen: null as ((event: Event) => void) | null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: vi.fn(),
    close: vi.fn(),
  }
  const create = vi.fn().mockReturnValue(socket)
  const rescue = createVmTerminalGateway(client, access, {
    scope: 'agent-rescue',
    origin: 'http://127.0.0.1:8080',
    create,
  })
  const ordinary = createVmTerminalGateway(client, access)
  expect(rescue.supported()).toBe(true)
  expect(ordinary.supported()).toBe(false)
  const signal = new AbortController().signal
  expect(await rescue.read(id, signal)).toEqual(metadata)
  expect(client.getJson).toHaveBeenCalledWith('/api/v1/agent-rescue-terminals/' + id, signal)
  const connection = rescue.connect(metadata, 'uart', null, {
    ready: vi.fn(),
    output: vi.fn(),
    acknowledged: vi.fn(),
    closed: vi.fn(),
  })
  expect(create).toHaveBeenCalledWith(
    'ws://127.0.0.1:8080/api/v1/agent-rescue-terminal',
    'droidvm.terminal.v1',
  )
  socket.onopen!(new Event('open'))
  expect(JSON.parse(socket.send.mock.calls[0]![0])).toMatchObject({
    vmId: id,
    csrfToken: access().csrfToken,
    expected: row.expected,
  })
  connection.close()
  expect(client.postJson).not.toHaveBeenCalled()
})

it('accepts rescue handoff only after explicit opt-in and keeps a failed guest outcome distinct', async () => {
  const result = {
    diskId,
    action: 'autogrow',
    outcome: 'rescue_ready',
    rescueSessionId: id,
    guestOutcome: 'failed',
    guestCode: null,
    guestCleanup: 'pending',
    cleanup: { stopped: false, removed: false, diskSynced: false },
    durabilityConfirmed: false,
    committed: true,
    actions: [{ action: 'autogrow', state: 'failed', code: null }],
    reason: 'none',
    recoveryRequired: false,
  }
  const handoff = {
    ...task(),
    requestId: 'agent-request',
    kind: 'agent_operation',
    resource: 'disk:' + diskId,
    agentRescueCleanup: undefined,
    agentResult: result,
  }
  const client = {
    getJson: vi.fn(),
    postJson: vi.fn().mockResolvedValue({ context, task: handoff }),
    delete: vi.fn(),
  }
  const gateway = createAgentGateway(client, access, vi.fn())
  const request = {
      requestId: 'agent-request',
      revision: 'disks',
      vmRevision: 'vms',
      operation: { action: 'autogrow' as const, diskId },
    },
    signal = new AbortController().signal
  await expect(gateway.submit(request, signal)).rejects.toMatchObject({ code: 'invalid-response' })
  const value = await gateway.submit({ ...request, rescue: true }, signal)
  expect(value.agentResult?.outcome).toBe('rescue_ready')
  expect(value.agentResult?.guestOutcome).toBe('failed')
  expect(value.agentResult?.durabilityConfirmed).toBe(false)
  expect(client.postJson.mock.calls[1]?.[1]).toMatchObject({ rescue: true })
})
