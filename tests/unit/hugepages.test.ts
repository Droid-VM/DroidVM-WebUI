import { expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  advancedFields,
  createHugepages,
  hugepageGroups,
} from '../../src/modules/hugepages/model/hugepages'
import type {
  HugepageGateway,
  HugepageObservation,
  HugepageRequest,
} from '../../src/modules/hugepages/api/http'
import type { Task } from '../../src/modules/tasks'

function snapshot(): HugepageObservation {
  return {
    context: { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) },
    fingerprint: 'current',
    revision: '1',
    installed: true,
    loaded: true,
    bootEnabled: true,
    hasPoolWant: true,
    hasCma: true,
    busy: false,
    consumerPages: '512',
    manualPoolPages: '768',
    consumerCount: 1,
    actualPoolPages: '1024',
    actualCmaPages: '2048',
    savedPoolPages: '1024',
    savedCmaPages: '2048',
    poolTotalPages: '768',
    poolAvailablePages: '256',
    servedPages: '512',
    cmaPoolPages: '256',
    acquireActive: false,
    acquireMode: 1,
    features: { acquire: true, stopAcquire: true, reconcile: true, restrict: true, gfpHook: true },
    hasLegacySettings: true,
    hasCrash: true,
    cma: {
      vendorAllowed: false,
      restrictEnabled: false,
      gfpHookEnabled: false,
      savedLever: null,
      savedLastPages: '2048',
    },
    advanced: advancedFields.map((field) => ({
      key: field.key,
      saved: null,
      live: '1',
      liveWritable: field.key === 'cma_reservoir_floor_mb',
      application: field.key === 'cma_reservoir_floor_mb' ? 'live' : 'next-load',
      reloadRequired: null,
      minimum: String(field.minimum),
      maximum: String(field.maximum),
    })),
  }
}
function done(request: HugepageRequest): Task {
  return {
    id: 'task',
    requestId: request.requestId,
    kind: 'hugepage_operation',
    resource: 'hugepages',
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
    hugepageResult: {
      saved: false,
      applied: true,
      degraded: false,
      uncertain: false,
      implementation: 'acquire1',
      snapshot: null,
    },
  }
}
function fixture() {
  const managementAvailable = ref(true)
  const gateway = {
    readable: () => true,
    supported: () => true,
    management: vi.fn(() => managementAvailable.value),
    read: vi.fn(async () => snapshot()),
    submit: vi.fn(async (request: HugepageRequest) => done(request)),
    find: vi.fn(async (_request: HugepageRequest): Promise<Task | null> => {
      void _request
      return null
    }),
  } satisfies HugepageGateway
  return { gateway, managementAvailable, model: createHugepages(gateway, () => 'request') }
}
it('keeps unknown admission blocked across navigation and only queries the original request', async () => {
  const { gateway, model } = fixture()
  await model.refresh()
  gateway.submit.mockRejectedValueOnce(new Error('connection lost'))
  model.prepare({ kind: 'acquire', mode: 1 })
  await model.submit()
  model.deactivate()
  await model.refresh()
  await model.reconcile()
  expect(model.entry.value?.state).toBe('unknown')
  expect(model.editable.value).toBe(false)
  model.prepare({ kind: 'boot', enabled: false })
  expect(model.review.value).toBeNull()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.find).toHaveBeenCalledWith(
    expect.objectContaining({ requestId: 'request' }),
    expect.any(AbortSignal),
  )
  model.dispose()
})

it('keeps App categories and degrades to basic controls without the new capability', async () => {
  const { gateway, model, managementAvailable } = fixture()
  expect(hugepageGroups).toEqual([
    'overview',
    'reserve',
    'module',
    'cma',
    'advanced',
    'maintenance',
  ])
  managementAvailable.value = false
  await model.refresh()
  expect(model.canPrepare({ kind: 'acquire', mode: 1 })).toBe(true)
  expect(model.canPrepare({ kind: 'boot', enabled: false })).toBe(false)
  expect(model.canPrepare({ kind: 'migrate-settings' })).toBe(false)
  expect(
    model.canPrepare({ kind: 'targets', poolPages: '1024', cmaPages: '512', persist: true }),
  ).toBe(false)
  managementAvailable.value = true
  gateway.read.mockResolvedValueOnce({ ...snapshot(), loaded: false, consumerCount: 0 })
  await model.refresh()
  expect(model.canPrepare({ kind: 'runtime', enabled: true })).toBe(true)
  expect(model.canPrepare({ kind: 'acquire', mode: 1 })).toBe(false)
  expect(model.canPrepare({ kind: 'boot', enabled: false })).toBe(true)
  model.dispose()
})

it('requires explicit system-reserve confirmation and cancels review on a newer fingerprint', async () => {
  const { gateway, model } = fixture()
  await model.refresh()
  expect(model.validAdvanced('system_reserve_mb', '63')).toBe(false)
  expect(model.validAdvanced('boot_acquire_runs', '100')).toBe(false)
  expect(model.validAdvanced('boot_acquire_wait', '')).toBe(true)
  model.prepare({ kind: 'advanced', key: 'system_reserve_mb', value: '512' })
  await model.submit()
  expect(gateway.submit).not.toHaveBeenCalled()
  model.confirmRisk.value = true
  gateway.read.mockResolvedValueOnce({ ...snapshot(), fingerprint: 'new-baseline' })
  await model.refresh()
  expect(model.review.value).toBeNull()
  model.prepare({ kind: 'advanced', key: 'system_reserve_mb', value: '512' })
  model.confirmRisk.value = true
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledWith(
    expect.objectContaining({
      expected: { fingerprint: 'new-baseline' },
      operation: { kind: 'advanced', key: 'system_reserve_mb', value: '512' },
    }),
    expect.any(AbortSignal),
  )
  model.dispose()
})

it('keeps CMA trial and saving separate and checks observed targets without forcing unnecessary levers', async () => {
  const { gateway, model } = fixture()
  const vendor = {
    ...snapshot(),
    cma: { ...snapshot().cma!, vendorAllowed: true },
    features: { ...snapshot().features!, restrict: false, gfpHook: false },
  }
  gateway.read.mockResolvedValue(vendor)
  await model.refresh()
  const trial = {
    kind: 'cma' as const,
    enabled: true,
    pages: '2048',
    persist: false,
    lever: 'flag' as const,
  }
  expect(model.canPrepare({ ...trial, pages: '512' })).toBe(false)
  expect(model.canPrepare(trial)).toBe(true)
  expect(model.canPrepare({ kind: 'cma-save', pages: '2048', lever: 'flag' })).toBe(true)
  model.prepare(trial)
  model.confirmRisk.value = true
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(model.status.value?.savedCmaPages).toBe('2048')
  gateway.read.mockResolvedValueOnce({ ...vendor, savedPoolPages: '4096', fingerprint: 'changed' })
  await model.refresh()
  expect(model.canPrepare({ kind: 'cma-save', pages: '2048', lever: 'flag' })).toBe(false)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  model.dispose()
})
it('retains a failed observation as stale and invalidates reviewed control when its fingerprint changes', async () => {
  const { gateway, model } = fixture()
  await model.refresh()
  model.prepare({ kind: 'acquire', mode: 2 })
  gateway.read.mockResolvedValueOnce({ ...snapshot(), fingerprint: 'changed', revision: '2' })
  await model.refresh()
  expect(model.review.value).toBeNull()
  gateway.read.mockRejectedValueOnce(new Error('unavailable'))
  await model.refresh()
  expect(model.status.value?.actualPoolPages).toBe('1024')
  expect(model.fresh.value).toBe(false)
  expect(model.editable.value).toBe(false)
  model.dispose()
})
it('does not infer pool completion from a successful task and requires review for uncertain receipts', async () => {
  const { gateway, model } = fixture()
  await model.refresh()
  gateway.submit.mockImplementationOnce(async (request) => ({
    ...done(request),
    hugepageResult: { ...done(request).hugepageResult!, uncertain: true },
  }))
  gateway.read.mockResolvedValue({
    ...snapshot(),
    acquireActive: true,
    fingerprint: 'triggered',
    revision: '2',
  })
  model.prepare({ kind: 'acquire', mode: 1 })
  await model.submit()
  expect(model.status.value?.acquireActive).toBe(true)
  expect(model.status.value?.poolTotalPages).toBe('768')
  expect(model.status.value?.manualPoolPages).toBe('768')
  expect(model.status.value?.savedPoolPages).toBe('1024')
  expect(model.editable.value).toBe(false)
  expect(model.unresolvedReceipt.value).toBe(true)
  model.acknowledged.value = true
  expect(model.editable.value).toBe(true)
  model.draft.pool = '511'
  expect(model.valid.value).toBe(false)
  model.draft.pool = '1073741825'
  expect(model.valid.value).toBe(false)
  model.dispose()
})
