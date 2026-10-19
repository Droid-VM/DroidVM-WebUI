import { expect, it, vi } from 'vitest'
import {
  createPackageImportGateway,
  type PackageImportPlan,
  type PackageImportPlanRequest,
  type PackageImportRequest,
} from '../../src/modules/packages/api/import'
import { createPackageImport } from '../../src/modules/packages/model/import'
import {
  importOperation,
  initialNetworks,
  importDraft,
} from '../../src/modules/packages/model/importForm'
import { ApiError } from '../../src/shared/api/errors'
import type { Task } from '../../src/modules/tasks'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const plan: PackageImportPlan = {
  source: '/example.vmpkg',
  vmName: 'Example',
  appVersion: '1',
  manifestVersion: 1,
  compression: 'NONE',
  volumeCount: 2,
  vmRevision: 'vms',
  diskRevision: 'disks',
  networkRevision: 'networks',
  disks: [{ name: 'disk', sizeBytes: '9007199254740993', attached: true, readonly: false }],
  boots: [],
  networks: [
    {
      ref: 'net0',
      name: 'Join',
      bridgeType: 'LINUX',
      uplinkMode: 'L3',
      createAllowed: false,
      conflictKind: 'ipv4',
      candidates: [{ id: 'existing', name: 'Existing' }],
    },
    {
      ref: 'net1',
      name: 'Create',
      bridgeType: 'LINUX',
      uplinkMode: 'L3',
      createAllowed: true,
      conflictKind: '',
      candidates: [],
    },
    {
      ref: 'net2',
      name: 'Skip',
      bridgeType: 'LINUX',
      uplinkMode: 'L2',
      createAllowed: false,
      conflictKind: 'uplink',
      candidates: [],
    },
  ],
  backend: 'QEMU',
  cpuCount: 2,
  memoryMiB: 1024,
  notes: '<b>plain text only</b>',
}
function task(requestId: string, preview: boolean): Task {
  return {
    id: (preview ? 'preview-' : 'import-') + requestId,
    requestId,
    kind: preview ? 'package_import_plan' : 'vm_import',
    resource: 'package',
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
    ...(preview
      ? { packageImportPlan: plan }
      : {
          packageImport: {
            registered: true,
            registrationUncertain: false,
            recoveryRequired: false,
            cleanupComplete: true,
            vmId: 'imported-vm',
            total: 1,
            done: 1,
          },
        }),
  }
}
function fixture() {
  let id = 0
  const gateway = {
    supported: () => true,
    submit: vi.fn(async (request: PackageImportRequest) => task(request.requestId, false)),
    find: vi.fn<(request: PackageImportRequest) => Promise<Task | null>>().mockResolvedValue(null),
    preview: {
      supported: () => true,
      submit: vi.fn(async (request: PackageImportPlanRequest) => task(request.requestId, true)),
      find: vi
        .fn<(request: PackageImportPlanRequest) => Promise<Task | null>>()
        .mockResolvedValue(null),
    },
  }
  const model = createPackageImport(
    gateway,
    async () => true,
    () => `request-${++id}`,
  )
  model.bind('session')
  model.draft.source = '/example.vmpkg.001'
  model.draft.targetDirectory = '/imported'
  return { model, gateway }
}

it('uses native network candidates and conflicts and submits only choices bound to the original preview', async () => {
  const choices = initialNetworks(plan)
  expect(choices).toEqual([
    { ref: 'net0', action: 'join', networkId: 'existing' },
    { ref: 'net1', action: 'create' },
    { ref: 'net2', action: 'skip' },
  ])
  const draft = { ...importDraft(), targetDirectory: '/imported', networks: choices }
  expect(importOperation(draft, plan)?.networks).toEqual(choices)
  expect(
    importOperation(
      { ...draft, networks: [{ ref: 'net0', action: 'create' }, ...choices.slice(1)] },
      plan,
    ),
  ).toBeNull()
  expect(
    importOperation(
      {
        ...draft,
        networks: [{ ref: 'net0', action: 'join', networkId: 'incompatible' }, ...choices.slice(1)],
      },
      plan,
    ),
  ).toBeNull()
  const { model, gateway } = fixture()
  await model.readPreview()
  expect(model.plan.value?.source).toBe('/example.vmpkg')
  model.reviewDraft()
  model.acknowledged.value = true
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledExactlyOnceWith(
    {
      requestId: 'request-2',
      planRequestId: 'request-1',
      operation: { targetDirectory: '/imported', networks: choices, confirmed: true },
    },
    expect.any(AbortSignal),
  )
  expect(model.plan.value).toBeNull()
  expect(model.entry.value?.task?.packageImport?.registered).toBe(true)
  model.dispose()
})

it('invalidates changed source even when changed back and never replays lost preview or import writes', async () => {
  const { model, gateway } = fixture()
  gateway.preview.submit.mockRejectedValueOnce(new Error('lost preview receipt'))
  await model.readPreview()
  model.draft.source = '/different.vmpkg'
  model.draft.source = '/example.vmpkg.001'
  gateway.preview.find.mockImplementationOnce(async (request) => task(request.requestId, true))
  await model.reconcile()
  expect(model.plan.value).toBeNull()
  expect(gateway.preview.submit).toHaveBeenCalledTimes(1)
  await model.readPreview()
  model.reviewDraft()
  model.acknowledged.value = true
  gateway.submit.mockRejectedValueOnce(new Error('lost import receipt'))
  await model.submit()
  const original = model.entry.value?.request
  model.leave()
  await model.readPreview()
  await model.submit()
  await model.reconcile()
  model.recoveryAcknowledged.value = true
  model.restartAfterReview()
  expect(model.entry.value?.state).toBe('unknown')
  expect(model.entry.value?.request).toEqual(original)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.preview.submit).toHaveBeenCalledTimes(2)
  model.dispose()
})

it('preserves conflict drafts and requires explicit inspection after uncertain registration before a fresh flow', async () => {
  const { model, gateway } = fixture()
  await model.readPreview()
  model.reviewDraft()
  model.acknowledged.value = true
  gateway.submit.mockRejectedValueOnce(new ApiError('conflict', 'Source changed'))
  await model.submit()
  expect(model.draft.targetDirectory).toBe('/imported')
  expect(model.plan.value).toBeNull()
  expect(model.draft.networks).toEqual(initialNetworks(plan))
  await model.readPreview()
  model.reviewDraft()
  model.acknowledged.value = true
  gateway.submit.mockImplementationOnce(async (request) => ({
    ...task(request.requestId, false),
    state: 'failed',
    errorCode: 'COMMIT_UNCERTAIN',
    packageImport: {
      registered: false,
      registrationUncertain: true,
      recoveryRequired: true,
      cleanupComplete: false,
      vmId: 'candidate',
      retainedDirectory: '/imported',
      total: 1,
      done: 1,
    },
  }))
  await model.submit()
  expect(model.recoveryRequired.value).toBe(true)
  expect(model.allowed.value).toBe(false)
  model.restartAfterReview()
  expect(model.recoveryRequired.value).toBe(true)
  model.recoveryAcknowledged.value = true
  model.restartAfterReview()
  expect(model.recoveryRequired.value).toBe(false)
  expect(model.plan.value).toBeNull()
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledTimes(2)
  await model.readPreview()
  expect(model.plan.value).not.toBeNull()
  expect(model.acknowledged.value).toBe(false)
  model.bind('other-session')
  expect(model.plan.value).toBeNull()
  expect(model.entry.value).toBeNull()
  model.dispose()
})

it('validates normalized previews and refuses inconsistent registration receipts', async () => {
  const client = {
    getJson: vi.fn(),
    postJson: vi.fn().mockResolvedValue({ context, task: task('preview', true) }),
    delete: vi.fn(),
  }
  const gateway = createPackageImportGateway(client, () => ({
    context,
    csrfToken: 'b'.repeat(64),
    administrator: true,
    manageTasks: true,
    capabilities: ['packages.import.v1'],
  }))
  const signal = new AbortController().signal,
    preview = { requestId: 'preview', source: '/example.vmpkg.001' }
  expect((await gateway.preview.submit(preview, signal)).packageImportPlan?.source).toBe(
    '/example.vmpkg',
  )
  client.getJson.mockResolvedValueOnce({
    context,
    task: {
      ...task('preview', true),
      packageImportPlan: { ...plan, networks: [plan.networks[0], plan.networks[0]] },
    },
  })
  await expect(gateway.preview.find(preview, signal)).rejects.toMatchObject({
    code: 'invalid-response',
  })
  const request: PackageImportRequest = {
    requestId: 'import',
    planRequestId: 'preview',
    operation: { targetDirectory: '/imported', networks: initialNetworks(plan), confirmed: true },
  }
  client.getJson.mockResolvedValueOnce({
    context,
    task: {
      ...task('import', false),
      packageImport: {
        registered: false,
        registrationUncertain: true,
        recoveryRequired: true,
        cleanupComplete: false,
        vmId: 'candidate',
        total: 1,
        done: 1,
      },
    },
  })
  await expect(gateway.find(request, signal)).rejects.toMatchObject({ code: 'invalid-response' })
  client.getJson.mockResolvedValueOnce({
    context: { ...context, daemonEpoch: 'changed' },
    task: task('import', false),
  })
  await expect(gateway.find(request, signal)).rejects.toMatchObject({ code: 'context-changed' })
  expect(client.postJson).toHaveBeenCalledTimes(1)
})
