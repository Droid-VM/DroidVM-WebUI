import { describe, expect, it, vi } from 'vitest'
import { createHttpTaskGateway } from '../../src/modules/tasks/api/http'
import { createTaskMonitor, taskPercent } from '../../src/modules/tasks/model/monitor'
import type { Task, TaskGateway, TaskSnapshot } from '../../src/modules/tasks/api/gateway'
import { ApiError } from '../../src/shared/api/errors'
import { createOperations } from '../../src/modules/tasks/model/operations'
import { createHttpClient, type HttpClient } from '../../src/shared/api/httpClient'

const context = { daemonEpoch: 'epoch-a', sessionId: 'a'.repeat(64) }
const access = () => ({
  context,
  csrfToken: 'b'.repeat(64),
  manageTasks: true,
  capabilities: ['tasks.list.v1', 'tasks.cancel.v1'],
})
const signal = () => new AbortController().signal
const task = (values: Partial<Task> = {}): Task => ({
  id: 'task-1',
  kind: 'disk_operation',
  resource: 'disk-1',
  state: 'running',
  cancellable: true,
  revision: '9007199254740993',
  phase: 'copy',
  unit: 'bytes',
  completed: '9007199254740993',
  total: '18014398509481986',
  createdMs: '100',
  finishedMs: null,
  resultAvailable: false,
  errorCode: null,
  ...values,
})
const snapshot = (items: Task[] = [task()]): TaskSnapshot => ({
  context,
  cursor: { epoch: context.daemonEpoch, sequence: '9007199254740994' },
  items,
})
function fixture() {
  const list = vi.fn<TaskGateway['list']>().mockResolvedValue(snapshot())
  const cancel = vi
    .fn<TaskGateway['cancel']>()
    .mockResolvedValue(task({ state: 'cancelling', cancellable: false }))
  return {
    list,
    cancel,
    model: createTaskMonitor({ supported: () => true, canCancel: () => true, list, cancel }),
  }
}
function client(value: unknown) {
  return {
    getJson: vi.fn<HttpClient['getJson']>().mockResolvedValue(value),
    postJson: vi.fn<HttpClient['postJson']>().mockResolvedValue(value),
    delete: vi.fn<HttpClient['delete']>(),
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('task HTTP adapter', () => {
  it('joins an active operation lookup and waits for its resource refresh', async () => {
    const lookup = deferred<Task>(),
      refreshed = deferred<boolean>()
    const find = vi.fn().mockReturnValue(lookup.promise)
    const model = createOperations(
      { supported: () => true, submit: async () => task(), find },
      () => refreshed.promise,
    )
    await model.submit('disk', { requestId: 'same-request' })
    const first = model.reconcile()
    let joined = false
    const second = model.reconcile().then(() => {
      joined = true
    })
    lookup.resolve(task({ state: 'succeeded' }))
    await Promise.resolve()
    expect(joined).toBe(false)
    expect(model.allowed('disk')).toBe(false)
    refreshed.resolve(true)
    await Promise.all([first, second])
    expect(find).toHaveBeenCalledTimes(1)
    expect(model.allowed('disk')).toBe(true)
    model.dispose()
  })
  it('binds writes to the captured session, epoch and CSRF', async () => {
    const transport = client({ context, task: task({ state: 'cancelling', cancellable: false }) })
    const gateway = createHttpTaskGateway(transport, access)
    const abort = signal()
    await gateway.cancel('task-1', abort)
    expect(transport.postJson).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/tasks/cancel',
      { context, taskId: 'task-1' },
      abort,
      { csrf: 'b'.repeat(64), status: 200 },
    )
  })
  it('requires authenticated capabilities and task permission before transport', async () => {
    const transport = client(snapshot())
    for (const [current, code] of [
      [null, 'unauthenticated'],
      [{ ...access(), manageTasks: false }, 'permission-denied'],
      [{ ...access(), capabilities: [] }, 'unsupported'],
    ] as const) {
      await expect(
        createHttpTaskGateway(transport, () => current).list(signal()),
      ).rejects.toMatchObject({ code })
    }
    expect(transport.getJson).not.toHaveBeenCalled()
  })
  it('preserves counters beyond JS safe integers', async () => {
    const data = await createHttpTaskGateway(client(snapshot()), access).list(signal())
    expect(data.items[0]?.revision).toBe('9007199254740993')
    expect(taskPercent(data.items[0]!)).toBe(50)
    expect(taskPercent(task({ total: null }))).toBeNull()
    expect(taskPercent(task({ completed: '0', total: '0' }))).toBeNull()
  })
  it.each([
    { ...snapshot(), context: { ...context, sessionId: 'c'.repeat(64) } },
    { ...snapshot(), cursor: { epoch: 'other', sequence: '1' } },
  ])('rejects mixed process/session data', async (value) => {
    await expect(createHttpTaskGateway(client(value), access).list(signal())).rejects.toMatchObject(
      { code: 'context-changed' },
    )
  })
  it.each([
    snapshot([task(), task()]),
    snapshot([task({ total: '1' })]),
    snapshot([task({ state: 'cancelled' })]),
    snapshot([task({ finishedMs: '1' })]),
    snapshot([{ ...task(), completed: 9007199254740992 } as unknown as Task]),
  ])('rejects duplicate, imprecise and inconsistent records', async (value) => {
    await expect(createHttpTaskGateway(client(value), access).list(signal())).rejects.toMatchObject(
      { code: 'invalid-response' },
    )
  })
  it('does not accept a cancellation response for another task', async () => {
    const transport = client({ context, task: task({ id: 'task-other' }) })
    await expect(
      createHttpTaskGateway(transport, access).cancel('task-1', signal()),
    ).rejects.toMatchObject({ code: 'invalid-response' })
  })
  it('sends a single authenticated POST and reads structured conflict codes', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'context_changed' } }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const gateway = createHttpTaskGateway(createHttpClient({ fetch }), access)
    await expect(gateway.cancel('task-1', signal())).rejects.toMatchObject({
      code: 'context-changed',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'X-DroidVM-CSRF': 'b'.repeat(64) })
  })
})

describe('task observations and cancellation state', () => {
  it('locks repeated clicks and does not equate cancelling with cancelled', async () => {
    const f = fixture(),
      pending = deferred<Task>()
    f.cancel.mockReturnValue(pending.promise)
    await f.model.reload()
    const first = f.model.cancel('task-1')
    await f.model.cancel('task-1')
    await f.model.reload()
    expect(f.cancel).toHaveBeenCalledTimes(1)
    expect(f.list).toHaveBeenCalledTimes(1)
    pending.resolve(task({ state: 'cancelling', cancellable: false }))
    await first
    expect(f.model.items.value[0]?.state).toBe('cancelling')
    expect(f.model.pendingId.value).toBeNull()
  })
  it('keeps an unknown cancellation locked across reads and missing records', async () => {
    const f = fixture()
    f.cancel.mockRejectedValue(new ApiError('offline', 'lost response'))
    await f.model.reload()
    await f.model.cancel('task-1')
    expect(f.model.uncertainId.value).toBe('task-1')
    await f.model.reload()
    await f.model.cancel('task-1')
    f.list.mockResolvedValue(snapshot([]))
    await f.model.reload()
    expect(f.model.uncertainId.value).toBe('task-1')
    f.list.mockResolvedValue(
      snapshot([task({ state: 'cancelled', cancellable: false, finishedMs: '200' })]),
    )
    await f.model.reload()
    expect(f.model.uncertainId.value).toBeNull()
    expect(f.cancel).toHaveBeenCalledTimes(1)
  })
  it('requires a fresh observation after an explicit cancellation conflict', async () => {
    const f = fixture()
    f.cancel.mockRejectedValue(new ApiError('conflict', 'commit in progress'))
    await f.model.reload()
    await f.model.cancel('task-1')
    await f.model.cancel('task-1')
    expect(f.model.status.value).toBe('idle')
    expect(f.model.uncertainId.value).toBeNull()
    expect(f.cancel).toHaveBeenCalledTimes(1)
  })
  it('discards old identity results and clears task state on reset', async () => {
    const f = fixture(),
      pending = deferred<TaskSnapshot>()
    f.list.mockReturnValue(pending.promise)
    const read = f.model.reload()
    f.model.reset()
    pending.resolve(snapshot())
    await read
    expect(f.model.items.value).toEqual([])
    expect(f.model.status.value).toBe('idle')
  })
  it('rejects a late write completion after reset', async () => {
    const f = fixture(),
      pending = deferred<Task>()
    await f.model.reload()
    f.cancel.mockReturnValue(pending.promise)
    const write = f.model.cancel('task-1')
    f.model.reset()
    pending.resolve(task({ state: 'cancelling', cancellable: false }))
    await write
    expect(f.model.items.value).toEqual([])
    expect(f.model.pendingId.value).toBeNull()
  })
  it('clears stale data on read errors and keeps monotonic ordering precise', async () => {
    const f = fixture()
    f.list.mockResolvedValue(
      snapshot([
        task({ id: 'old', createdMs: '9007199254740992' }),
        task({ id: 'new', createdMs: '9007199254740993' }),
      ]),
    )
    await f.model.reload()
    expect(f.model.items.value.map((item) => item.id)).toEqual(['new', 'old'])
    f.list.mockRejectedValue(new ApiError('unauthenticated', 'expired'))
    await f.model.reload()
    expect(f.model.items.value).toEqual([])
    expect(f.model.problem.value?.code).toBe('unauthenticated')
  })
})
