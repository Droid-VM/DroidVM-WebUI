import { expect, it, vi } from 'vitest'
import {
  createPackageImportGateway,
  validTrackedPackageImport,
  validTrackedPackagePreview,
  type PackageImportGateway,
  type PackageImportPlan,
  type PackageImportPlanRequest,
  type PackageImportRequest,
} from '../../src/modules/packages/api/import'
import { createPackageImport } from '../../src/modules/packages/model/import'
import {
  createPackageExportGateway,
  validTrackedPackageExport,
  type PackageExportGateway,
  type PackageExportPlan,
  type PackageExportRequest,
} from '../../src/modules/packages/api/export'
import { createPackageExport } from '../../src/modules/packages/model/export'
import type { Task } from '../../src/modules/tasks'
import type { HttpClient } from '../../src/shared/api/httpClient'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) },
  identity = `${context.daemonEpoch}:${context.sessionId}`
const preview: PackageImportPlanRequest = {
  requestId: 'preview-request',
  source: '/example.vmpkg.001',
}
const importRequest: PackageImportRequest = {
  requestId: 'import-request',
  planRequestId: preview.requestId,
  operation: {
    targetDirectory: '/imported',
    networks: [{ ref: 'net', action: 'skip' }],
    confirmed: true,
  },
}
const exportRequest: PackageExportRequest = {
  requestId: 'export-request',
  vmId: 'vm',
  vmRevision: 'vms',
  diskRevision: 'disks',
  networkRevision: 'nets',
  operation: {
    destination: '/export.vmpkg',
    volumeBytes: '0',
    compression: 'NONE',
    disks: [],
    overwriteConfirmed: true,
  },
}
const plan: PackageImportPlan = {
  source: '/example.vmpkg',
  vmName: 'Example',
  appVersion: '1',
  manifestVersion: 1,
  compression: 'NONE',
  volumeCount: 2,
  vmRevision: 'vms',
  diskRevision: 'disks',
  networkRevision: 'nets',
  disks: [],
  boots: [],
  networks: [
    {
      ref: 'net',
      name: 'Network',
      bridgeType: 'LINUX',
      uplinkMode: 'L2',
      candidates: [],
      createAllowed: false,
      conflictKind: 'uplink',
    },
  ],
}
const exportPlan: PackageExportPlan = {
  context,
  vmId: 'vm',
  vmName: 'Example',
  vmRevision: 'vms',
  diskRevision: 'disks',
  networkRevision: 'nets',
  disks: [],
  compressions: ['NONE'],
  minVolumeBytes: '16777216',
}
function task(requestId: string, kind: Task['kind']): Task {
  return {
    id: `task-${requestId}`,
    requestId,
    kind,
    resource: 'package',
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
    ...(kind === 'package_import_plan'
      ? { packageImportPlan: plan }
      : kind === 'vm_export'
        ? { packageExport: { volumeCount: 0 } }
        : {
            packageImport: {
              registered: true,
              registrationUncertain: false,
              recoveryRequired: false,
              cleanupComplete: true,
              vmId: 'imported',
              total: 0,
              done: 0,
            },
          }),
  }
}
function memory(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    key: (i) => [...values.keys()][i] ?? null,
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    setItem: vi.fn((key, value) => {
      values.set(key, value)
    }),
    removeItem: (key) => {
      values.delete(key)
    },
  }
}
const access = () => ({
  context,
  csrfToken: 'b'.repeat(64),
  administrator: true,
  manageTasks: true,
  capabilities: ['packages.import.v1', 'packages.export.v1'],
})
function importer(storage = memory()) {
  const http = createPackageImportGateway({} as HttpClient, access)
  const gateway: PackageImportGateway = {
    ...http,
    tracking: { ...http.tracking!, storage },
    submit: vi.fn(async (request) => task(request.requestId, 'vm_import')),
    find: vi.fn(async (request) => task(request.requestId, 'vm_import')),
    preview: {
      ...http.preview,
      tracking: { ...http.preview.tracking!, storage },
      submit: vi.fn(async (request) => task(request.requestId, 'package_import_plan')),
      find: vi.fn(async (request) => task(request.requestId, 'package_import_plan')),
    },
  }
  let id = 0
  const refresh = vi.fn(async () => true)
  const model = createPackageImport(gateway, refresh, () =>
    ++id === 1 ? preview.requestId : importRequest.requestId,
  )
  return { storage, gateway, model, refresh }
}
function exporter(storage = memory()) {
  const http = createPackageExportGateway({} as HttpClient, access)
  const gateway: PackageExportGateway = {
    ...http,
    tracking: { ...http.tracking!, storage },
    plan: vi.fn(async () => exportPlan),
    submit: vi.fn(async (request) => task(request.requestId, 'vm_export')),
    find: vi.fn(async (request) => task(request.requestId, 'vm_export')),
  }
  const refresh = vi.fn(async () => true)
  return {
    storage,
    gateway,
    refresh,
    model: createPackageExport(gateway, refresh, () => exportRequest.requestId),
  }
}
function seed(storage: Storage, namespace: string, key: string, request: unknown) {
  storage.setItem(
    `droidvm.operations.v1:${namespace}`,
    JSON.stringify({ version: 1, identity, records: [{ key, request }] }),
  )
}

it('recovers the original preview source before applying its normalized plan and never restores edits or confirmations', async () => {
  const first = importer()
  first.model.bind(identity)
  first.model.draft.source = preview.source
  first.model.draft.targetDirectory = '/unsubmitted-draft'
  vi.mocked(first.gateway.preview.submit).mockRejectedValueOnce(new Error('Preview response lost'))
  await first.model.readPreview()
  first.model.dispose()
  const restored = importer(first.storage)
  restored.model.bind(identity)
  expect(restored.model.draft.source).toBe(preview.source)
  expect(restored.model.draft.targetDirectory).toBe('')
  expect(restored.model.plan.value).toBeNull()
  expect(restored.model.previewEntry.value).toMatchObject({
    restored: true,
    state: 'unknown',
    request: preview,
  })
  await restored.model.readPreview()
  await restored.model.reconcile()
  expect(restored.model.plan.value?.source).toBe('/example.vmpkg')
  expect(restored.model.planRequestId.value).toBe(preview.requestId)
  expect(restored.model.draft.networks).toEqual([{ ref: 'net', action: 'skip' }])
  expect(restored.model.review.value).toBeNull()
  expect(restored.model.acknowledged.value).toBe(false)
  expect(restored.gateway.preview.submit).not.toHaveBeenCalled()
  expect(restored.gateway.submit).not.toHaveBeenCalled()
  restored.model.draft.source = '/other.vmpkg'
  restored.model.draft.source = preview.source
  await restored.model.reconcile()
  expect(restored.model.plan.value).toBeNull()
  restored.model.dispose()
})

it('queries an accepted import without reactivating its spent preview and retains the lock until inventory refresh succeeds', async () => {
  const first = importer()
  first.model.bind(identity)
  first.model.draft.source = preview.source
  first.model.draft.targetDirectory = '/imported'
  await first.model.readPreview()
  first.model.reviewDraft()
  first.model.acknowledged.value = true
  vi.mocked(first.gateway.submit).mockRejectedValueOnce(new Error('Import response lost'))
  await first.model.submit()
  expect(first.model.entry.value?.request).toEqual(importRequest)
  first.model.dispose()
  const restored = importer(first.storage)
  restored.model.bind(identity)
  restored.refresh.mockResolvedValueOnce(false)
  await restored.model.reconcile()
  expect(restored.model.pending.value).toBe(true)
  expect(restored.model.plan.value).toBeNull()
  expect(restored.model.allowed.value).toBe(false)
  await restored.model.reconcile()
  expect(restored.model.entry.value?.state).toBe('done')
  expect(restored.model.plan.value).toBeNull()
  expect(restored.model.review.value).toBeNull()
  expect(restored.model.acknowledged.value).toBe(false)
  expect(restored.model.recoveryAcknowledged.value).toBe(false)
  await restored.model.submit()
  expect(restored.gateway.submit).not.toHaveBeenCalled()
  expect(restored.gateway.preview.submit).not.toHaveBeenCalled()
  restored.model.dispose()
})

it('interlocks both import writers on storage failure and preserves uncertain registration even after explicit recovery review', async () => {
  const f = importer()
  const uncertainRequest = {
    ...importRequest,
    requestId: 'old-import',
    planRequestId: 'old-preview',
  }
  seed(f.storage, 'package-import', 'import', uncertainRequest)
  f.storage.setItem('droidvm.operations.v1:package-import-preview', '{broken')
  f.model.bind(identity)
  f.model.draft.source = preview.source
  expect(f.model.canPreview.value).toBe(false)
  expect(f.model.allowed.value).toBe(false)
  vi.mocked(f.gateway.find).mockResolvedValueOnce({
    ...task(uncertainRequest.requestId, 'vm_import'),
    state: 'failed',
    errorCode: 'REGISTRATION_FAILED',
    packageImport: {
      registered: false,
      registrationUncertain: true,
      recoveryRequired: true,
      cleanupComplete: false,
      total: 0,
      done: 0,
    },
  })
  await f.model.reconcile()
  expect(f.gateway.find).toHaveBeenCalledWith(uncertainRequest, expect.any(AbortSignal))
  expect(f.model.recoveryRequired.value).toBe(true)
  f.model.clearPreviewTracking()
  f.model.recoveryAcknowledged.value = true
  f.model.restartAfterReview()
  expect(f.model.recoveryRequired.value).toBe(false)
  expect(f.model.unresolved.value).toBe(true)
  await f.model.readPreview()
  f.model.draft.targetDirectory = '/another-target'
  f.model.reviewDraft()
  f.model.acknowledged.value = true
  const write = vi.mocked(f.storage.setItem).getMockImplementation()!
  vi.mocked(f.storage.setItem).mockImplementation(() => {
    throw new Error('Quota exceeded')
  })
  await f.model.submit()
  expect(f.model.recoveryProblem.value).toBe('unavailable')
  expect(f.model.canPreview.value).toBe(false)
  expect(f.gateway.submit).not.toHaveBeenCalled()
  vi.mocked(f.storage.setItem).mockImplementation(write)
  f.model.clearTracking()
  expect(f.model.recoveryProblem.value).toBe('unavailable')
  expect(f.model.entry.value?.request).toEqual(uncertainRequest)
  f.model.dispose()
  const restored = importer(f.storage)
  restored.model.bind(identity)
  expect(restored.model.recoveryAcknowledged.value).toBe(false)
  expect(restored.model.review.value).toBeNull()
  restored.model.dispose()
})

it('restores only the export target and original lookup, preserving journals on disposal and isolating late session responses', async () => {
  const first = exporter()
  first.model.bind(identity)
  await first.model.prepare('vm')
  first.model.draft.destination = '/export.vmpkg'
  first.model.reviewDraft()
  first.model.acknowledged.value = true
  vi.mocked(first.gateway.submit).mockRejectedValueOnce(new Error('Export response lost'))
  await first.model.submit()
  first.model.dispose()
  const restored = exporter(first.storage)
  restored.model.bind(identity)
  expect(restored.model.target.value).toBe('vm')
  expect(restored.model.plan.value).toBeNull()
  expect(restored.model.draft.destination).toBe('')
  expect(restored.model.acknowledged.value).toBe(false)
  await restored.model.prepare('other-vm')
  expect(restored.gateway.plan).not.toHaveBeenCalled()
  vi.mocked(restored.gateway.find).mockResolvedValueOnce(null)
  await restored.model.reconcile()
  expect(restored.model.pending.value).toBe(true)
  let finish!: (value: Task) => void
  vi.mocked(restored.gateway.find).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const querying = restored.model.reconcile()
  restored.model.bind('other-epoch:session')
  finish(task(exportRequest.requestId, 'vm_export'))
  await querying
  expect(restored.model.target.value).toBeNull()
  expect(restored.model.entry.value).toBeNull()
  expect(restored.gateway.submit).not.toHaveBeenCalled()
  expect(restored.storage.getItem('droidvm.operations.v1:package-export')).toContain(identity)
  restored.model.reset()
  expect(restored.storage.getItem('droidvm.operations.v1:package-export')).toBeNull()
  restored.model.dispose()
})

it('strictly validates all three request codecs and rejects malformed lookup arguments before transport', async () => {
  expect(validTrackedPackagePreview(preview)).toBe(true)
  expect(validTrackedPackageImport(importRequest)).toBe(true)
  expect(validTrackedPackageExport(exportRequest)).toBe(true)
  for (const value of [
    { ...preview, context },
    { ...preview, token: 'secret' },
    { ...preview, source: '/bad\npath' },
  ])
    expect(validTrackedPackagePreview(value)).toBe(false)
  for (const value of [
    { ...importRequest, source: '/unexpected' },
    {
      ...importRequest,
      operation: {
        ...importRequest.operation,
        networks: [
          { ref: 'net', action: 'skip' },
          { ref: 'net', action: 'skip' },
        ],
      },
    },
    { ...importRequest, operation: { ...importRequest.operation, confirmed: false } },
  ])
    expect(validTrackedPackageImport(value)).toBe(false)
  for (const volumeBytes of ['1', '16777215', '9223372036854775808'])
    expect(
      validTrackedPackageExport({
        ...exportRequest,
        operation: { ...exportRequest.operation, volumeBytes },
      }),
    ).toBe(false)
  expect(validTrackedPackageExport({ ...exportRequest, csrfToken: 'secret' })).toBe(false)
  const client = { getJson: vi.fn(), postJson: vi.fn(), delete: vi.fn() }
  const imports = createPackageImportGateway(client, access),
    exports = createPackageExportGateway(client, access),
    signal = new AbortController().signal
  await expect(
    imports.preview.find({ ...preview, requestId: '../other' }, signal),
  ).rejects.toMatchObject({ code: 'conflict' })
  await expect(
    imports.find({ ...importRequest, requestId: '../other' }, signal),
  ).rejects.toMatchObject({ code: 'conflict' })
  await expect(
    exports.find({ ...exportRequest, requestId: '../other' }, signal),
  ).rejects.toMatchObject({ code: 'conflict' })
  expect(client.getJson).not.toHaveBeenCalled()
  expect(client.postJson).not.toHaveBeenCalled()
})
