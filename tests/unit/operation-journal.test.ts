import { expect, it, vi } from 'vitest'
import { createOperations } from '../../src/modules/tasks/model/operations'
import {
  OPERATION_RECORD_LIMIT,
  type OperationTracking,
} from '../../src/modules/tasks/model/operationJournal'
import type { OperationGateway, Task } from '../../src/modules/tasks/api/gateway'
import { ApiError } from '../../src/shared/api/errors'

interface Request {
  requestId: string
  resource: string
}
const name = 'droidvm.operations.v1:test'
const identity = 'daemon:session'
const request: Request = { requestId: 'request-1', resource: 'disk' }
const task: Task = {
  id: 'task-1',
  requestId: 'request-1',
  kind: 'disk_operation',
  resource: 'disk',
  revision: '1',
  state: 'running',
  cancellable: true,
  phase: '',
  unit: '',
  completed: '0',
  total: null,
  createdMs: '1',
  finishedMs: null,
  resultAvailable: false,
  errorCode: null,
}
function memory(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: vi.fn(() => values.clear()),
    key: (index) => [...values.keys()][index] ?? null,
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key) => {
      values.delete(key)
    }),
  }
}
function setup(storage = memory()) {
  const tracking: OperationTracking<Request> = {
    namespace: 'test',
    storage,
    valid(value): value is Request {
      return (
        !!value &&
        typeof value === 'object' &&
        Object.keys(value).sort().join(',') === 'requestId,resource' &&
        'requestId' in value &&
        typeof value.requestId === 'string' &&
        'resource' in value &&
        typeof value.resource === 'string'
      )
    },
    key: (value) => value.resource,
  }
  const gateway: OperationGateway<Request> = {
    supported: () => true,
    submit: vi.fn(async () => task),
    find: vi.fn(async () => task),
  }
  const refresh = vi.fn(async () => true)
  const model = createOperations(gateway, refresh, tracking)
  return { model, storage, gateway, refresh, tracking }
}
function envelope(records: unknown, owner = identity) {
  return JSON.stringify({ version: 1, identity: owner, records })
}

it('journals before POST and restores only lookup, including completed uncertain receipts', async () => {
  const first = setup()
  first.model.pause() // Initial authentication checking must preserve any saved journal.
  first.model.bind(identity)
  vi.mocked(first.gateway.submit).mockImplementationOnce(async (value) => {
    expect(first.storage.getItem(name)).toBe(envelope([{ key: 'disk', request: value }]))
    throw new ApiError('offline', 'Response lost')
  })
  await first.model.submit('disk', request)
  first.model.dispose()
  const restored = setup(first.storage)
  restored.model.pause()
  restored.model.bind(identity)
  expect(restored.model.entries.value.disk).toMatchObject({
    state: 'unknown',
    task: null,
    restored: true,
  })
  expect(restored.model.allowed('disk')).toBe(false)
  await restored.model.submit('disk', { ...request, requestId: 'must-not-replay' })
  expect(restored.gateway.submit).not.toHaveBeenCalled()
  vi.mocked(restored.gateway.find).mockResolvedValueOnce({
    ...task,
    state: 'failed',
    errorCode: 'COMMIT_UNCERTAIN',
  })
  await restored.model.reconcile()
  expect(restored.gateway.find).toHaveBeenCalledWith(request, expect.any(AbortSignal))
  expect(restored.model.entries.value.disk?.state).toBe('done')
  expect(first.storage.getItem(name)).not.toContain('COMMIT_UNCERTAIN')
  restored.model.dispose()
  const again = setup(first.storage)
  again.model.bind(identity)
  expect(again.model.allowed('disk')).toBe(false)
  vi.mocked(again.gateway.find).mockResolvedValueOnce(null)
  await again.model.reconcile()
  expect(again.model.entries.value.disk?.state).toBe('unknown')
  expect(again.gateway.submit).not.toHaveBeenCalled()
  again.model.dispose()
})

it('isolates identity and preserves journals on disposal while explicit reset clears them', async () => {
  const first = setup()
  first.model.bind(identity)
  await first.model.submit('disk', request)
  const stored = first.storage.getItem(name)
  first.model.bind('other:session')
  expect(first.model.entries.value).toEqual({})
  expect(first.storage.getItem(name)).toBe(stored)
  await first.model.reconcile()
  expect(first.gateway.find).not.toHaveBeenCalled()
  first.model.dispose()
  expect(first.storage.getItem(name)).toBe(stored)
  const disposedBeforeBind = setup(first.storage)
  disposedBeforeBind.model.dispose()
  expect(first.storage.getItem(name)).toBe(stored)
  const logout = setup(first.storage)
  logout.model.reset()
  expect(first.storage.getItem(name)).toBeNull()
})

it('blocks corrupt and unavailable storage without posting or losing known pending records', async () => {
  const f = setup()
  f.storage.setItem(name, '{broken')
  f.model.bind(identity)
  expect(f.model.recoveryProblem.value).toBe('invalid')
  await f.model.submit('disk', request)
  expect(f.gateway.submit).not.toHaveBeenCalled()
  f.model.clearTracking()
  expect(f.model.recoveryProblem.value).toBeNull()
  await f.model.submit('disk', request)
  const known = f.model.entries.value.disk
  vi.mocked(f.storage.setItem).mockImplementation(() => {
    throw new Error('Quota exceeded')
  })
  await f.model.submit('usb', { requestId: 'request-2', resource: 'usb' })
  expect(f.gateway.submit).toHaveBeenCalledTimes(1)
  expect(f.model.entries.value.disk).toBe(known)
  expect(f.model.entries.value.usb).toBeUndefined()
  expect(f.model.recoveryProblem.value).toBe('unavailable')
  expect(f.model.allowed('other')).toBe(false)
  f.model.clearTracking()
  expect(f.model.recoveryProblem.value).toBe('unavailable')
  await f.model.reconcile()
  expect(f.gateway.find).toHaveBeenCalledTimes(1)
  f.model.dispose()
  const denied = setup()
  vi.mocked(denied.storage.getItem).mockImplementation(() => {
    throw new Error('Storage denied')
  })
  denied.model.bind(identity)
  await denied.model.submit('disk', request)
  expect(denied.model.recoveryProblem.value).toBe('unavailable')
  expect(denied.gateway.submit).not.toHaveBeenCalled()
})

it('validates restored requests, keys, pollution boundaries and capacity before any POST', async () => {
  for (const records of [
    [{ key: 'other', request }],
    [{ key: 'disk', request: { ...request, csrfToken: 'secret' } }],
    [
      { key: 'disk', request },
      { key: 'disk', request },
    ],
    [{ key: '__proto__', request: { ...request, resource: '__proto__' } }],
    JSON.parse('[{"key":"disk","request":{"requestId":"r","resource":"disk","__proto__":{}}}]'),
  ]) {
    const f = setup()
    f.storage.setItem(name, envelope(records))
    f.model.bind(identity)
    expect(f.model.recoveryProblem.value).toBe('invalid')
    expect(f.model.entries.value).toEqual({})
    await f.model.submit('disk', request)
    expect(f.gateway.submit).not.toHaveBeenCalled()
    f.model.dispose()
  }
  const full = setup()
  const records = Array.from({ length: OPERATION_RECORD_LIMIT }, (_, i) => ({
    key: `disk-${i}`,
    request: { requestId: `request-${i}`, resource: `disk-${i}` },
  }))
  full.storage.setItem(name, envelope(records))
  full.model.bind(identity)
  await full.model.submit('disk', request)
  expect(full.gateway.submit).not.toHaveBeenCalled()
  expect(Object.keys(full.model.entries.value)).toHaveLength(OPERATION_RECORD_LIMIT)
  expect(full.storage.getItem(name)).toBe(envelope(records))
  vi.mocked(full.gateway.find).mockImplementation(async (value) => ({
    ...task,
    requestId: value.requestId,
    resource: value.resource,
    state: value.resource === 'disk-0' ? 'failed' : 'succeeded',
    errorCode: value.resource === 'disk-0' ? 'COMMIT_UNCERTAIN' : null,
  }))
  await full.model.reconcile()
  expect(Object.values(full.model.entries.value).every((entry) => entry.state === 'done')).toBe(
    true,
  )
  vi.mocked(full.storage.setItem).mockImplementationOnce(() => {
    throw new Error('Quota exceeded')
  })
  full.model.clearTracking()
  expect(Object.keys(full.model.entries.value)).toHaveLength(OPERATION_RECORD_LIMIT)
  expect(full.model.recoveryProblem.value).toBe('unavailable')
  expect(full.storage.getItem(name)).toBe(envelope(records))
  full.model.clearTracking()
  expect(Object.keys(full.model.entries.value)).toEqual(['disk-0'])
  expect(full.model.entries.value['disk-0']?.task?.errorCode).toBe('COMMIT_UNCERTAIN')
  expect(full.model.recoveryProblem.value).toBeNull()
  expect(full.storage.getItem(name)).toBe(envelope([records[0]]))
  await full.model.submit('disk', request)
  expect(full.gateway.submit).toHaveBeenCalledTimes(1)
  full.model.dispose()
  const oversized = setup()
  oversized.model.bind(identity)
  await oversized.model.submit('disk', { ...request, requestId: 'x'.repeat(256 * 1024) })
  expect(oversized.gateway.submit).not.toHaveBeenCalled()
  expect(oversized.model.entries.value).toEqual({})
})

it('ignores late responses after a session change and keeps the stored request immutable', async () => {
  const f = setup()
  f.model.bind(identity)
  let resolve!: (value: Task) => void
  vi.mocked(f.gateway.submit).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const value = { ...request }
  const pending = f.model.submit('disk', value)
  value.requestId = 'modified'
  expect(f.model.entries.value.disk?.request.requestId).toBe('request-1')
  f.model.bind('other:session')
  resolve(task)
  await pending
  expect(f.model.entries.value).toEqual({})
  expect(f.refresh).not.toHaveBeenCalled()
  expect(f.storage.getItem(name)).toBe(envelope([{ key: 'disk', request }]))
  f.model.dispose()
})

it('removes verified rejected writes from the journal without losing their current error feedback', async () => {
  const accepted = setup()
  accepted.model.bind(identity)
  vi.mocked(accepted.gateway.submit).mockResolvedValueOnce({
    ...task,
    state: 'succeeded',
    cancellable: false,
    finishedMs: '2',
  })
  accepted.refresh.mockRejectedValueOnce(new ApiError('conflict', 'Resource read changed'))
  await accepted.model.submit('disk', request)
  expect(accepted.model.entries.value.disk?.state).toBe('unknown')
  expect(accepted.storage.getItem(name)).toBe(envelope([{ key: 'disk', request }]))
  expect(accepted.model.allowed('disk')).toBe(false)
  accepted.model.dispose()

  const f = setup()
  f.model.bind(identity)
  vi.mocked(f.gateway.submit).mockRejectedValueOnce(new ApiError('conflict', 'Stale request'))
  await f.model.submit('disk', request)
  expect(f.model.entries.value.disk).toMatchObject({
    state: 'done',
    task: null,
    problem: { code: 'conflict' },
  })
  expect(f.storage.getItem(name)).toBe(envelope([]))
  const restored = setup(f.storage)
  restored.model.bind(identity)
  expect(restored.model.entries.value).toEqual({})
  expect(restored.model.allowed('disk')).toBe(true)
  await restored.model.reconcile()
  expect(restored.gateway.find).not.toHaveBeenCalled()
  restored.model.dispose()

  const writes = vi.mocked(f.storage.setItem)
  const write = writes.getMockImplementation()!
  vi.mocked(f.gateway.submit).mockRejectedValueOnce(new ApiError('conflict', 'Rejected again'))
  // Allow the write-ahead snapshot; fail only the cleanup after the rejection.
  writes.mockImplementation((key, value) => {
    if (value === envelope([])) throw new Error('Cannot remove rejected receipt')
    write(key, value)
  })
  await f.model.submit('disk', { ...request, requestId: 'request-2' })
  expect(f.model.recoveryProblem.value).toBe('unavailable')
  expect(f.model.allowed('disk')).toBe(false)
  expect(f.model.entries.value.disk?.problem?.code).toBe('conflict')
  writes.mockImplementation(write)
  f.model.clearTracking()
  expect(f.model.entries.value).toEqual({})
  expect(f.storage.getItem(name)).toBe(envelope([]))
  f.model.dispose()

  const late = setup()
  late.model.bind(identity)
  let finish!: (value: boolean) => void
  vi.mocked(late.gateway.submit).mockRejectedValueOnce(new ApiError('conflict', 'Stale request'))
  late.refresh.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = late.model.submit('disk', request)
  await Promise.resolve()
  late.model.bind('other:session')
  finish(true)
  await pending
  expect(late.model.entries.value).toEqual({})
  expect(late.storage.getItem(name)).toBe(envelope([{ key: 'disk', request }]))
  late.model.dispose()
})
