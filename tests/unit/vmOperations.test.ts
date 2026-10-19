import { describe, expect, it, vi } from 'vitest'
import {
  createHttpVmActionGateway,
  type VmActionGateway,
  type VmOperation,
} from '../../src/modules/vm/api/operations'
import { createVmActions } from '../../src/modules/vm/model/operations'
import type { Vm } from '../../src/modules/vm/api/gateway'
import type { Task } from '../../src/modules/tasks'
import type { HttpClient } from '../../src/shared/api/httpClient'
import { ApiError } from '../../src/shared/api/errors'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const access = () => ({
  context,
  csrfToken: 'b'.repeat(64),
  administrator: true,
  manageTasks: true,
  capabilities: ['vm.lifecycle.v1'],
})
const vm: Vm = {
  id: 'vm-1',
  name: 'VM',
  state: 'STOPPED',
  backend: 'QEMU',
  cpuCount: 2,
  memoryMiB: 2048,
  lifecycle: {
    instanceId: 'a'.repeat(32),
    revision: '9007199254740993',
    configRevision: 'config-1',
    actions: ['start'],
    uncertain: false,
  },
}
const operation: VmOperation = {
  requestId: 'request-1',
  vmId: vm.id,
  action: 'start',
  expected: {
    instanceId: 'a'.repeat(32),
    revision: '9007199254740993',
    configRevision: 'config-1',
  },
}
const task = (extra: Partial<Task> = {}): Task => ({
  id: 'task-1',
  requestId: 'request-1',
  kind: 'vm_start',
  resource: 'vm:vm-1',
  revision: '1',
  state: 'queued',
  cancellable: true,
  phase: '',
  unit: '',
  completed: '0',
  total: null,
  createdMs: '1',
  finishedMs: null,
  resultAvailable: false,
  errorCode: null,
  ...extra,
})
const done = () =>
  task({
    state: 'succeeded',
    revision: '4',
    cancellable: false,
    finishedMs: '10',
    phase: 'admitted',
  })
function client(value: unknown) {
  return {
    getJson: vi.fn<HttpClient['getJson']>().mockResolvedValue(value),
    postJson: vi.fn<HttpClient['postJson']>().mockResolvedValue(value),
    delete: vi.fn<HttpClient['delete']>(),
  }
}
function fixture() {
  const submit = vi.fn<VmActionGateway['submit']>().mockResolvedValue(task())
  const find = vi.fn<VmActionGateway['find']>().mockResolvedValue(null)
  const refresh = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
  const model = createVmActions({ supported: () => true, submit, find }, refresh, () => 'request-1')
  model.bind('epoch:session')
  return { model, submit, find, refresh }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
describe('VM HTTP operations', () => {
  it('binds writes to identity, CSRF and exact observation without numeric rounding', async () => {
    const transport = client({ context, task: task() })
    const signal = new AbortController().signal
    await createHttpVmActionGateway(transport, access).submit(operation, signal)
    expect(transport.postJson).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/vm-operations',
      { ...operation, context },
      signal,
      { csrf: access().csrfToken, status: 202 },
    )
  })
  it('requires actual capability and both permissions before transport', async () => {
    const transport = client({})
    for (const value of [
      null,
      { ...access(), administrator: false },
      { ...access(), manageTasks: false },
      { ...access(), capabilities: [] },
    ]) {
      const gateway = createHttpVmActionGateway(transport, () => value)
      expect(gateway.supported()).toBe(false)
      await expect(gateway.submit(operation, new AbortController().signal)).rejects.toBeInstanceOf(
        ApiError,
      )
    }
    expect(transport.postJson).not.toHaveBeenCalled()
  })
  it.each([
    { context: { ...context, daemonEpoch: 'other' }, task: task() },
    { context, task: task({ requestId: 'other' }) },
    { context, task: task({ resource: 'vm:other' }) },
    { context, task: task({ kind: 'vm_stop' }) },
    { context, task: task({ state: 'succeeded', cancellable: true }) },
    { context, task: null },
  ])('rejects mismatched or invalid operation responses', async (value) => {
    await expect(
      createHttpVmActionGateway(client(value), access).submit(
        operation,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ApiError)
  })
  it('preserves a missing request as unknown and uses only GET for lookup', async () => {
    const transport = client({ context, task: null })
    const signal = new AbortController().signal
    expect(await createHttpVmActionGateway(transport, access).find(operation, signal)).toBeNull()
    expect(transport.getJson).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/vm-operations/request-1',
      signal,
    )
    expect(transport.postJson).not.toHaveBeenCalled()
  })
  it.each(['18446744073709551616', '01'])(
    'rejects invalid runtime revision %s before submitting',
    async (revision) => {
      const transport = client({})
      await expect(
        createHttpVmActionGateway(transport, access).submit(
          { ...operation, expected: { ...operation.expected, revision } },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: 'conflict' })
      expect(transport.postJson).not.toHaveBeenCalled()
    },
  )
})
describe('VM operation model', () => {
  it('locks repeated clicks until task completion and a fresh inventory observation', async () => {
    const f = fixture()
    await f.model.submit(vm, 'start')
    await f.model.submit(vm, 'start')
    expect(f.submit).toHaveBeenCalledTimes(1)
    expect(f.model.allowed(vm, 'start')).toBe(false)
    f.find.mockResolvedValue(done())
    f.refresh.mockResolvedValue(false)
    await f.model.reconcile()
    expect(f.model.allowed(vm, 'start')).toBe(false)
    f.refresh.mockResolvedValue(true)
    await f.model.reconcile()
    expect(f.model.entries.value[vm.id]?.state).toBe('done')
    expect(f.model.allowed(vm, 'start')).toBe(true)
  })
  it('lost response never retries POST, and missing or running records stay locked', async () => {
    const f = fixture()
    f.submit.mockRejectedValue(new ApiError('offline', 'lost'))
    await f.model.submit(vm, 'start')
    await f.model.reconcile()
    expect(f.model.entries.value[vm.id]?.state).toBe('unknown')
    f.find.mockResolvedValue(task({ state: 'running', cancellable: false }))
    await f.model.reconcile()
    await f.model.submit(vm, 'start')
    expect(f.model.allowed(vm, 'start')).toBe(false)
    expect(f.submit).toHaveBeenCalledTimes(1)
    f.find.mockResolvedValue(done())
    await f.model.reconcile()
    expect(f.model.entries.value[vm.id]?.task?.state).toBe('succeeded')
  })
  it('keeps an explicit rejection locked while the new inventory is loading', async () => {
    const f = fixture(),
      pending = deferred<boolean>()
    f.submit.mockRejectedValue(new ApiError('conflict', 'stale'))
    f.refresh.mockReturnValue(pending.promise)
    const write = f.model.submit(vm, 'start')
    await vi.waitFor(() => expect(f.refresh).toHaveBeenCalled())
    expect(f.model.allowed(vm, 'start')).toBe(false)
    pending.resolve(true)
    await write
    expect(f.model.allowed(vm, 'start')).toBe(true)
  })
  it('preserves unknown requests while restoring the same session and fences late responses', async () => {
    const f = fixture(),
      pending = deferred<Task>()
    f.submit.mockReturnValue(pending.promise)
    const write = f.model.submit(vm, 'start')
    f.model.pause()
    pending.resolve(done())
    await write
    f.model.bind('epoch:session')
    expect(f.model.entries.value[vm.id]?.state).toBe('unknown')
    expect(f.model.entries.value[vm.id]?.task).toBeNull()
    f.find.mockResolvedValue(done())
    await f.model.reconcile()
    expect(f.submit).toHaveBeenCalledTimes(1)
    expect(f.model.entries.value[vm.id]?.state).toBe('done')
    f.model.bind('other:session')
    expect(f.model.entries.value).toEqual({})
  })
  it('rejects task replacement and revision regression during read recovery', async () => {
    const f = fixture()
    await f.model.submit(vm, 'start')
    for (const value of [task({ id: 'other' }), task({ revision: '0' })]) {
      f.find.mockResolvedValue(value)
      await f.model.reconcile()
      expect(f.model.entries.value[vm.id]?.problem?.code).toBe('invalid-response')
      expect(f.model.allowed(vm, 'start')).toBe(false)
    }
  })
  it('can resolve failure without claiming VM transition success', async () => {
    const f = fixture()
    f.submit.mockResolvedValue(
      task({ state: 'failed', cancellable: false, finishedMs: '2', errorCode: 'COMMIT_UNCERTAIN' }),
    )
    await f.model.submit(vm, 'start')
    expect(f.model.entries.value[vm.id]?.task?.errorCode).toBe('COMMIT_UNCERTAIN')
    expect(f.refresh).toHaveBeenCalledTimes(1)
    expect(
      f.model.allowed(
        { ...vm, lifecycle: { ...vm.lifecycle!, uncertain: true, actions: ['stop'] } },
        'start',
      ),
    ).toBe(false)
  })
  it('does not submit unsupported actions or alter an already captured observation', async () => {
    const f = fixture()
    await f.model.submit(vm, 'stop')
    expect(f.submit).not.toHaveBeenCalled()
    await f.model.submit(vm, 'start')
    expect(f.submit.mock.calls[0]?.[0]).toEqual(operation)
  })
})
