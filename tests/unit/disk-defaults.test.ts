import { expect, it, vi } from 'vitest'
import { createDiskDefaults } from '../../src/modules/diskDefaults/model/defaults'
import type {
  DiskDefaultGateway,
  DiskDefaultObservation,
  DiskDefaultRequest,
} from '../../src/modules/diskDefaults/api/http'
import type { Task } from '../../src/modules/tasks'

function snapshot(revision = 'initial'): DiskDefaultObservation {
  return {
    context: { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) },
    capability: 'disk-defaults-v1',
    expected: { revision },
    values: { optimizeCompression: 'ask', qemuImgCpus: [2, 3] },
    initialized: true,
    uncertain: false,
  }
}
function fixture() {
  let value = snapshot()
  const gateway = {
    readable: () => true,
    supported: () => true,
    read: vi.fn(async () => value),
    submit: vi.fn(async (request: DiskDefaultRequest): Promise<Task> => {
      value = { ...snapshot('saved'), values: { ...value.values, ...request.changes } }
      return {
        id: 'task',
        requestId: request.requestId,
        kind: 'disk_defaults',
        resource: 'disk-defaults',
        revision: '1',
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
        diskDefaultResult: {
          expected: request.expected,
          values: value.values,
          saved: true,
          uncertain: false,
          revision: value.expected.revision,
        },
      }
    }),
    find: vi.fn(async (_request: DiskDefaultRequest): Promise<Task | null> => {
      void _request
      return null
    }),
  } satisfies DiskDefaultGateway
  return {
    gateway,
    model: createDiskDefaults(gateway, () => 'request'),
    set: (next: DiskDefaultObservation) => {
      value = next
    },
  }
}

it('compares CPU arrays by content and retains edited cores during a revision conflict without mutating observations', async () => {
  const { model, gateway, set } = fixture()
  await model.refresh()
  model.draft.qemuImgCpus = [2, 3]
  expect(model.dirty.value).toBe(false)
  model.chooseCpus('4-5')
  model.prepare()
  const reviewed = model.review.value
  expect(model.status.value?.values.qemuImgCpus).toEqual([2, 3])
  model.draft.qemuImgCpus = [6]
  expect(reviewed?.changes.qemuImgCpus).toEqual([4, 5])
  const changed = snapshot('other')
  changed.values.optimizeCompression = 'none'
  set(changed)
  await model.refresh()
  expect(model.conflict.value).toBe(true)
  expect(model.review.value).toBeNull()
  model.rebase()
  expect(model.draft.optimizeCompression).toBe('none')
  expect(model.draft.qemuImgCpus).toEqual([6])
  await model.submit()
  expect(gateway.submit).not.toHaveBeenCalled()
  model.prepare()
  await model.submit()
  expect(model.dirty.value).toBe(false)
  model.chooseCpus('7')
  model.prepare()
  set({ ...snapshot('saved'), uncertain: true })
  await model.refresh()
  expect(model.review.value).toBeNull()
  set(snapshot('saved'))
  await model.refresh()
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  model.dispose()
})

it('loads only saved CPU defaults, fails on uncertain reads, and never repeats a lost save', async () => {
  const { model, gateway, set } = fixture()
  await model.refresh()
  model.chooseCpus('6-7')
  expect(await model.loadSavedCpus(new AbortController().signal)).toEqual([2, 3])
  model.prepare()
  gateway.submit.mockRejectedValueOnce(new Error('lost response'))
  await model.submit()
  model.deactivate()
  await model.refresh()
  model.prepare()
  await model.submit()
  await model.reconcile()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.find).toHaveBeenCalledWith(
    { requestId: 'request', expected: { revision: 'initial' }, changes: { qemuImgCpus: [6, 7] } },
    expect.any(AbortSignal),
  )
  set({ ...snapshot(), uncertain: true })
  await expect(model.loadSavedCpus(new AbortController().signal)).rejects.toThrow('uncertain')
  gateway.read.mockRejectedValueOnce(new Error('offline'))
  await expect(model.loadSavedCpus(new AbortController().signal)).rejects.toThrow('offline')
  model.dispose()
})

it('isolates remembered compression from dirty CPU edits and blocks competing writes until the original unknown save is reconciled', async () => {
  const { model, gateway } = fixture()
  await model.refresh()
  model.chooseCpus('6-7')
  const frozen = await model.optimization.read(new AbortController().signal)
  expect(frozen.cpus).toEqual([2, 3])
  gateway.submit.mockRejectedValueOnce(new Error('lost preference receipt'))
  await model.optimization.remember(frozen.expected!)
  expect(model.optimization.state().state).toBe('unknown')
  expect(model.pending.value).toBe(true)
  model.prepare()
  await model.submit()
  await model.optimization.remember(frozen.expected!)
  await model.optimization.reconcile()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  const request = gateway.submit.mock.calls[0]![0]
  expect(request).toEqual({
    requestId: 'request',
    expected: { revision: 'initial' },
    changes: { optimizeCompression: 'none' },
  })
  expect(gateway.find).toHaveBeenCalledWith(request, expect.any(AbortSignal))
  expect(model.draft.qemuImgCpus).toEqual([6, 7])
  model.dispose()
})
