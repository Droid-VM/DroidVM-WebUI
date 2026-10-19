import { expect, it, vi } from 'vitest'
import { createHugepages } from '../../src/modules/hugepages/model/hugepages'
import {
  createHugepageGateway,
  validTrackedHugepageRequest,
  type HugepageObservation,
  type HugepageRequest,
} from '../../src/modules/hugepages/api/http'
import type { Task } from '../../src/modules/tasks'

const name = 'droidvm.operations.v1:hugepages'
const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const identity = `${context.daemonEpoch}:${context.sessionId}`
const request: HugepageRequest = {
  requestId: 'cma-trial',
  expected: { fingerprint: 'initial' },
  operation: { kind: 'cma', enabled: true, pages: '2048', persist: false, lever: null },
}
function memory(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    key: (index) => [...values.keys()][index] ?? null,
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}
function observation(): HugepageObservation {
  return {
    context,
    fingerprint: 'initial',
    revision: '1',
    installed: true,
    loaded: true,
    bootEnabled: true,
    hasPoolWant: true,
    hasCma: true,
    busy: false,
    consumerPages: '0',
    manualPoolPages: '1024',
    consumerCount: 0,
    actualPoolPages: '1024',
    actualCmaPages: '2048',
    savedPoolPages: '1024',
    savedCmaPages: '1024',
    poolTotalPages: '1024',
    poolAvailablePages: '1024',
    servedPages: '0',
    cmaPoolPages: '2048',
    acquireActive: false,
    acquireMode: 1,
    features: {
      acquire: true,
      stopAcquire: true,
      reconcile: true,
      restrict: false,
      gfpHook: false,
    },
  }
}
function done(uncertain = false): Task {
  return {
    id: 'trial-task',
    requestId: request.requestId,
    kind: 'hugepage_operation',
    resource: 'hugepages',
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
    hugepageResult: {
      saved: false,
      applied: true,
      degraded: false,
      uncertain,
      implementation: 'cma',
      snapshot: null,
    },
  }
}
function fixture(storage = memory()) {
  const real = createHugepageGateway(
    { getJson: vi.fn(), postJson: vi.fn(), delete: vi.fn() },
    () => null,
  )
  const gateway = {
    tracking: { ...real.tracking!, storage },
    readable: () => true,
    supported: () => true,
    management: () => true,
    read: vi.fn(async () => observation()),
    submit: vi.fn(async (_value: HugepageRequest): Promise<Task> => {
      void _value
      throw new Error('receipt lost')
    }),
    find: vi.fn(async (_value: HugepageRequest): Promise<Task | null> => {
      void _value
      return null
    }),
  }
  return { storage, gateway, model: createHugepages(gateway, () => request.requestId) }
}

it('restores a lost CMA trial by its original ID, waits for observation and never continues to saving', async () => {
  const first = fixture()
  first.model.bind(identity)
  await first.model.refresh()
  first.model.draft.cmaTrial = '2048'
  first.model.trialCma()
  await first.model.submit()
  expect(first.gateway.submit).toHaveBeenCalledWith(request, expect.any(AbortSignal))
  const raw = first.storage.getItem(name)
  first.model.deactivate()
  first.model.dispose()
  expect(first.storage.getItem(name)).toBe(raw)
  const restored = fixture(first.storage)
  restored.model.pause()
  restored.model.bind(identity)
  expect(restored.model.entry.value).toMatchObject({ request, state: 'unknown', restored: true })
  expect(restored.model.review.value).toBeNull()
  expect(restored.model.confirmRisk.value).toBe(false)
  restored.model.saveCma()
  await restored.model.submit()
  expect(restored.gateway.submit).not.toHaveBeenCalled()
  restored.gateway.find.mockResolvedValue(done())
  restored.gateway.read.mockRejectedValueOnce(new Error('snapshot unavailable'))
  await restored.model.reconcile()
  expect(restored.model.entry.value?.state).toBe('waiting')
  expect(restored.model.editable.value).toBe(false)
  await restored.model.reconcile()
  expect(restored.gateway.find).toHaveBeenCalledWith(request, expect.any(AbortSignal))
  expect(restored.model.entry.value?.state).toBe('done')
  expect(restored.model.editable.value).toBe(true)
  expect(restored.model.status.value?.savedCmaPages).toBe('1024')
  expect(restored.model.review.value).toBeNull()
  expect(restored.gateway.submit).not.toHaveBeenCalled()
  restored.model.reset()
  expect(first.storage.getItem(name)).toBeNull()
  restored.model.dispose()
})

it('keeps an uncertain native receipt locked across reload and separates malformed local tracking cleanup from acknowledgement', async () => {
  const f = fixture()
  f.storage.setItem(
    name,
    JSON.stringify({ version: 1, identity, records: [{ key: 'hugepages', request }] }),
  )
  f.model.bind(identity)
  f.gateway.find.mockResolvedValue(done(true))
  await f.model.reconcile()
  expect(f.model.entry.value?.state).toBe('done')
  expect(f.model.unresolvedReceipt.value).toBe(true)
  f.model.clearTracking()
  expect(f.model.entry.value).not.toBeNull()
  expect(f.model.editable.value).toBe(false)
  f.model.acknowledged.value = true
  expect(f.model.editable.value).toBe(true)
  f.model.dispose()
  const again = fixture(f.storage)
  again.model.bind(identity)
  expect(again.model.acknowledged.value).toBe(false)
  expect(again.model.pending.value).toBe(true)
  again.model.dispose()
  const corrupt = fixture(f.storage)
  corrupt.storage.setItem(name, '{broken')
  corrupt.model.bind(identity)
  await corrupt.model.refresh()
  expect(corrupt.model.recoveryProblem.value).toBe('invalid')
  expect(corrupt.model.entry.value).toBeNull()
  corrupt.model.prepare({ kind: 'unload' })
  await corrupt.model.submit()
  expect(corrupt.gateway.submit).not.toHaveBeenCalled()
  corrupt.model.clearTracking()
  expect(corrupt.model.recoveryProblem.value).toBeNull()
  expect(corrupt.model.editable.value).toBe(true)
  corrupt.model.dispose()
})

it('uses the strict HTTP request contract for tracked operations and never retains context or credentials', () => {
  expect(validTrackedHugepageRequest(request)).toBe(true)
  expect(
    validTrackedHugepageRequest({
      ...request,
      operation: { kind: 'cma-save', pages: '2048', lever: null },
    }),
  ).toBe(true)
  for (const invalid of [
    { ...request, context },
    { ...request, csrfToken: 'secret' },
    { ...request, expected: { ...request.expected, token: 'secret' } },
    { ...request, operation: { ...request.operation, password: 'secret' } },
    { ...request, operation: { ...request.operation, pages: '1073741825' } },
  ])
    expect(validTrackedHugepageRequest(invalid)).toBe(false)
})
