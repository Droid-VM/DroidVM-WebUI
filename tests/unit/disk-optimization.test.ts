import { expect, it, vi } from 'vitest'
import { createDiskActions } from '../../src/modules/resources/model/diskOperations'
import { isOptimizationOperation } from '../../src/modules/resources/model/diskOptimize'
import type {
  DiskOptimizationDefaults,
  DiskOptimizationPreferences,
} from '../../src/modules/resources/model/diskOptimize'
import type {
  DiskOperation,
  DiskPreparation,
  DiskRequest,
} from '../../src/modules/resources/api/diskOperations'
import type { Task } from '../../src/modules/tasks'

function fixture() {
  const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
  const disk = {
    id: 'disk',
    name: 'disk',
    path: '/disk',
    parentId: null,
    backing: false,
    selectable: true,
  }
  const prepared: DiskPreparation = {
    catalog: { context, revision: 'disks', vmRevision: 'vms', items: [disk] },
    parent: null,
    detail: {
      context,
      revision: 'disks',
      vmRevision: 'vms',
      disk,
      chain: [disk],
      chainComplete: true,
      children: [],
      attachments: [],
      readOnlyRequired: false,
      checkedAtMs: 1000,
      inspection: {
        state: 'ready',
        format: 'qcow2',
        virtualBytes: '1024',
        allocatedBytes: '1024',
        clusterBytes: null,
        encrypted: false,
        dirty: false,
        compression: 'zstd',
        effectiveCompression: 'zstd',
      },
    },
  }
  const defaults: DiskOptimizationDefaults = {
    expected: { revision: 'defaults' },
    compression: 'ask',
    cpus: [2, 3],
    canRemember: true,
  }
  const preferences = {
    read: vi.fn(async () => defaults),
    remember: vi.fn(async () => {}),
    reconcile: vi.fn(async () => {}),
    state: () => ({ state: 'idle' as const, expected: null, requestId: null, problem: null }),
  } satisfies DiskOptimizationPreferences
  const gateway = {
    supported: () => true,
    prepare: vi.fn(async () => prepared),
    compressionSupported: () => true,
    compression: vi.fn(async () => structuredClone(prepared.detail!)),
    submit: vi.fn(
      async (request: DiskRequest): Promise<Task> => ({
        id: 'task',
        requestId: request.requestId,
        kind: 'disk_operation',
        resource: 'disk:disk',
        revision: '1',
        state: 'failed',
        cancellable: false,
        phase: '',
        unit: '',
        completed: '0',
        total: null,
        createdMs: '1',
        finishedMs: '2',
        resultAvailable: false,
        errorCode: 'FAILED',
      }),
    ),
    find: vi.fn(async (): Promise<Task | null> => null),
  }
  let sequence = 0
  const model = createDiskActions(
    gateway,
    async () => true,
    () => `request-${++sequence}`,
    undefined,
    undefined,
    preferences,
  )
  return { model, gateway, preferences, prepared, defaults }
}

it('requires the ask confirmation, locks optimization invariants and retries failed operations with frozen defaults and explicit unbound CPUs', async () => {
  const { model, gateway, preferences, prepared, defaults } = fixture()
  await model.prepareOptimize('disk')
  const operation = { ...model.initial.value! } as DiskOperation
  await model.submit(operation)
  expect(gateway.submit).not.toHaveBeenCalled()
  for (const changes of [
    { format: 'raw' },
    { folder: '/other', name: 'other' },
    { compress: 'zstd' },
    { preallocate: true },
    { action: 'flatten' },
  ])
    expect(isOptimizationOperation({ ...operation, ...changes } as DiskOperation, prepared)).toBe(
      false,
    )
  // Clearing affinity is an explicit choice, not a request to reload shared defaults.
  delete operation.cpus
  model.optimizeConfirmed.value = true
  await model.submit(operation)
  defaults.compression = 'none'
  defaults.cpus = [7]
  preferences.read.mockRejectedValue(new Error('defaults now unavailable'))
  await model.retry()
  expect(model.optimizing.value).toBe(true)
  expect(model.initial.value).toEqual(operation)
  expect(model.initial.value).not.toHaveProperty('cpus')
  expect(model.optimizeDefaults.value).toMatchObject({ compression: 'ask', cpus: [2, 3] })
  expect(preferences.read).toHaveBeenCalledTimes(1)
  expect(model.optimizeConfirmed.value).toBe(false)
  model.optimizeConfirmed.value = true
  await model.submit(operation)
  expect(gateway.submit.mock.calls.map(([request]) => request.operation)).toEqual([
    operation,
    operation,
  ])
  expect(gateway.submit.mock.calls.map(([request]) => request.requestId)).toEqual([
    'request-1',
    'request-2',
  ])
  model.dispose()
})

it('does not infer uncompressed data from a failed inspection and rejects catalog changes during effective inspection', async () => {
  const { model, gateway, prepared, preferences } = fixture()
  const checked = structuredClone(prepared.detail!)
  checked.inspection.effectiveCompression = 'none'
  checked.inspection.state = 'busy'
  gateway.compression.mockResolvedValueOnce(checked)
  await model.prepareOptimize('disk', 'import')
  expect(model.optimizeCheck.value).toBe('unknown')
  expect(preferences.read).not.toHaveBeenCalled()
  checked.inspection.state = 'ready'
  gateway.compression.mockResolvedValueOnce(checked)
  gateway.prepare.mockResolvedValueOnce(prepared).mockResolvedValueOnce({
    ...prepared,
    catalog: { ...prepared.catalog, revision: 'changed' },
  })
  await model.prepareOptimize('disk', 'import')
  expect(model.problem.value?.code).toBe('conflict')
  expect(model.preparation.value).toBeNull()
  expect(model.canOptimize.value).toBe(false)
  expect(gateway.submit).not.toHaveBeenCalled()
  model.dispose()
})
