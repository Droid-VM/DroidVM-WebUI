import { expect, it, vi } from 'vitest'
import { createOperationJournal } from '../../src/shared/model/operationJournal'
import { createImageImport } from '../../src/modules/images/model/import'
import {
  validTrackedImageImport,
  validTrackedImagePreview,
} from '../../src/modules/images/api/import'
import {
  createResizeGrow,
  type ResizeGrowTarget,
} from '../../src/modules/resources/model/resizeGrow'
import { createDiskRecovery } from '../../src/modules/resources/model/diskRecovery'
import { validTrackedDiskRecovery } from '../../src/modules/resources/api/diskOperations'
import type { Task, OperationTracking } from '../../src/modules/tasks'
import { createAgentOperations } from '../../src/modules/agent/model/operations'
import {
  validAgentReference,
  type AgentPreparation,
  type AgentGateway,
  type AgentReference,
} from '../../src/modules/agent/api/gateway'

function storage(): Storage {
  const rows = new Map<string, string>()
  return {
    get length() {
      return rows.size
    },
    clear: () => rows.clear(),
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => {
      rows.set(key, value)
    },
    removeItem: (key) => {
      rows.delete(key)
    },
    key: (index) => [...rows.keys()][index] ?? null,
  }
}
function seed<R>(tracking: OperationTracking<R>, request: R) {
  const journal = createOperationJournal(tracking)
  journal.load('host')
  journal.save('host', [{ key: tracking.key(request), request }])
}
function done(requestId: string): Task {
  return {
    id: requestId,
    requestId,
    kind: 'disk_operation',
    resource: 'disk:disk',
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
  }
}

it('restores image previews and import receipts without replaying requests or confirmations', async () => {
  const saved = storage()
  const previewTracking = {
    namespace: 'image-preview',
    valid: validTrackedImagePreview,
    key: () => 'preview',
    storage: saved,
  }
  const tracking = {
    namespace: 'image-import',
    valid: validTrackedImageImport,
    key: () => 'import',
    storage: saved,
  }
  seed(previewTracking, { requestId: 'preview', source: '/images/disk.qcow2' })
  seed(tracking, { requestId: 'import', planRequestId: 'preview' })
  const gateway = {
    supported: () => true,
    tracking,
    submit: vi.fn(async () => done('import')),
    find: vi.fn(async () => ({
      ...done('import'),
      kind: 'image_import',
      resource: 'image',
      imageImport: {
        diskId: 'disk',
        registered: true,
        registrationUncertain: false,
        recoveryRequired: false,
        added: 1,
      },
    })),
    preview: {
      supported: () => true,
      tracking: previewTracking,
      submit: vi.fn(async () => done('preview')),
      find: vi.fn(async () => null),
    },
  }
  const model = createImageImport(gateway, async () => true)
  model.bind('host')
  expect(model.source.value).toBe('/images/disk.qcow2')
  expect(model.acknowledged.value).toBe(false)
  await model.reconcile()
  expect(model.succeeded.value).toBe(true)
  expect(model.canSubmit.value).toBe(false)
  expect(gateway.submit).not.toHaveBeenCalled()
  expect(gateway.preview.submit).not.toHaveBeenCalled()
  model.dispose()
  const next = createImageImport(gateway, async () => true)
  next.bind('host')
  expect(next.entry.value?.request.requestId).toBe('import')
  next.dispose()
})

it('requires explicit continuation after reload and never resends an already submitted grow', async () => {
  const saved = storage()
  const continuation = {
    available: () => true,
    start: vi.fn(
      async (_target: ResizeGrowTarget, _signal: AbortSignal, submitted: (id: string) => void) => {
        submitted('grow')
      },
    ),
  }
  const first = createResizeGrow(continuation, saved)
  first.bind('host')
  first.begin('resize', { diskId: 'disk', revision: 'disks', vmRevision: 'vms', size: '2048' })
  first.dispose()
  const reloaded = createResizeGrow(continuation, saved)
  reloaded.bind('host')
  const entry = {
    request: { requestId: 'resize' },
    state: 'done',
    task: done('resize'),
    problem: null,
  }
  await reloaded.advance(entry)
  expect(reloaded.sequence.value?.state).toBe('stopped')
  expect(continuation.start).not.toHaveBeenCalled()
  await reloaded.resume(entry)
  expect(continuation.start).toHaveBeenCalledTimes(1)
  reloaded.dispose()
  const submitted = createResizeGrow(continuation, saved)
  submitted.bind('host')
  expect(submitted.sequence.value?.growRequestId).toBe('grow')
  await submitted.resume(entry)
  await submitted.advance(entry)
  expect(continuation.start).toHaveBeenCalledTimes(1)
  submitted.dispose()
})

it('allows a fresh read-only preview when the previous preview lease expired', async () => {
  const tracking = {
    namespace: 'image-preview',
    valid: validTrackedImagePreview,
    key: () => 'preview',
    storage: storage(),
  }
  seed(tracking, { requestId: 'expired-preview', source: '/images/disk.qcow2' })
  const gateway = {
    supported: () => true,
    submit: vi.fn(async () => done('import')),
    find: vi.fn(async () => null),
    preview: {
      supported: () => true,
      tracking,
      submit: vi.fn(async () => done('fresh-preview')),
      find: vi.fn(async () => null),
    },
  }
  const model = createImageImport(
    gateway,
    async () => true,
    () => 'fresh-preview',
  )
  model.bind('host')
  await model.reconcile()
  expect(model.canRefreshPreview.value).toBe(true)
  await model.refreshPreview()
  expect(gateway.preview.submit).toHaveBeenCalledTimes(1)
  expect(model.previewEntry.value?.request).toEqual({
    requestId: 'fresh-preview',
    source: '/images/disk.qcow2',
  })
  expect(model.acknowledged.value).toBe(false)
  expect(gateway.submit).not.toHaveBeenCalled()
  model.dispose()
})

it('finds a recovery receipt after reload and preserves its link to the uncertain disk request', async () => {
  const saved = storage()
  const tracking = {
    namespace: 'disk-recovery',
    valid: validTrackedDiskRecovery,
    key: () => 'recovery',
    storage: saved,
  }
  seed(tracking, { requestId: 'recover', diskRequestId: 'uncertain-disk' })
  const gateway = {
    supported: () => true,
    tracking,
    status: vi.fn(async () => 0),
    submit: vi.fn(async () => done('recover')),
    find: vi.fn(async () => ({
      ...done('recover'),
      kind: 'disk_recovery',
      resource: 'disks',
      pendingRecords: 0,
    })),
  }
  const model = createDiskRecovery(
    gateway,
    async () => true,
    () => true,
    () => null,
  )
  model.bind('host')
  await model.reconcile()
  expect(model.recoveredRequest.value).toBe('uncertain-disk')
  expect(gateway.submit).not.toHaveBeenCalled()
  model.dispose()
})

it('retains only the Agent lookup reference, clears passwords, and recovers without a second POST', async () => {
  const saved = storage()
  const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
  const disk = {
    id: 'disk',
    name: 'Disk',
    path: '/disk.qcow2',
    parentId: null,
    backing: false,
    selectable: true,
  }
  const baseline: AgentPreparation = {
    catalog: { context, revision: 'disks', vmRevision: 'vms', items: [disk] },
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
      checkedAtMs: 1,
      inspection: {
        state: 'ready',
        format: 'qcow2',
        virtualBytes: '2048',
        allocatedBytes: '0',
        clusterBytes: null,
        encrypted: false,
        dirty: false,
        compression: null,
      },
    },
  }
  const gateway = {
    supported: () => true,
    tracking: {
      namespace: 'agent',
      valid: validAgentReference,
      key: () => 'agent',
      storage: saved,
    },
    prepare: vi.fn(async () => baseline),
    submit: vi.fn(async () => {
      throw new Error('lost receipt')
    }),
    find: vi.fn(async (reference: AgentReference) => ({
      ...done(reference.requestId),
      kind: 'agent_operation',
      state: 'failed' as const,
    })),
    recovery: {
      supported: () => false,
      status: vi.fn(async () => 0),
      submit: vi.fn(async () => done('recovery')),
      find: vi.fn(async () => null),
    },
  } satisfies AgentGateway
  const first = createAgentOperations(
    gateway,
    async () => true,
    () => 'agent-request',
  )
  first.bind('host')
  await first.prepare('disk', 'chpasswd')
  const operation = {
    action: 'chpasswd' as const,
    diskId: 'disk',
    password: 'Secret123',
    normalUsers: false,
  }
  await first.submit(operation)
  expect(operation.password).toBe('')
  const encoded = saved.getItem('droidvm.operations.v1:agent')!
  expect(encoded).not.toContain('Secret123')
  expect(encoded).not.toContain('password')
  expect(
    validAgentReference({
      requestId: 'x',
      diskId: 'disk',
      action: 'chpasswd',
      password: 'Secret123',
    }),
  ).toBe(false)
  first.dispose()
  const restored = createAgentOperations(gateway, async () => true)
  restored.bind('host')
  expect(restored.allowed.value).toBe(false)
  await restored.reconcile()
  expect(restored.entry.value?.state).toBe('done')
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.find.mock.calls[0]?.[0]).toEqual({
    requestId: 'agent-request',
    diskId: 'disk',
    action: 'chpasswd',
  })
  restored.dispose()
})
