import { expect, it, vi } from 'vitest'
import { createImageImport } from '../../src/modules/images/model/import'
import {
  createImageImportGateway,
  type ImageImportGateway,
  type ImageImportPlan,
  type ImageImportPlanRequest,
  type ImageImportRequest,
} from '../../src/modules/images/api/import'
import type { Task } from '../../src/modules/tasks'
import { ApiError } from '../../src/shared/api/errors'

const diskId = '11111111-1111-4111-8111-111111111111'
const parentId = '22222222-2222-4222-8222-222222222222'
const source = '/storage/emulated/0/DroidVM/linux.qcow2'
const plan: ImageImportPlan = {
  source,
  vmRevision: 'vm-revision',
  diskRevision: 'disk-revision',
  diskId,
  members: [
    {
      id: diskId,
      path: '/canonical/linux.qcow2',
      name: 'linux.qcow2',
      parentId,
      existing: false,
      format: 'qcow2',
      virtualSizeBytes: '9007199254740993',
    },
    {
      id: parentId,
      path: '/canonical/base.qcow2',
      name: 'base.qcow2',
      parentId: null,
      existing: true,
      format: 'qcow2',
      virtualSizeBytes: '9007199254740993',
    },
  ],
  attachments: [],
}
function done(requestId: string, preview = false): Task {
  return {
    id: preview ? 'plan-task' : 'import-task',
    requestId,
    kind: preview ? 'image_import_plan' : 'image_import',
    resource: 'image',
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
      ? { imageImportPlan: structuredClone(plan) }
      : {
          imageImport: {
            diskId,
            registered: true,
            registrationUncertain: false,
            recoveryRequired: false,
            added: 1,
          },
        }),
  }
}
function fixture(openOptimize?: (diskId: string) => Promise<void>) {
  const gateway = {
    supported: () => true,
    preview: {
      supported: () => true,
      submit: vi.fn(async (request: ImageImportPlanRequest) => done(request.requestId, true)),
      find: vi.fn(
        async (request: ImageImportPlanRequest): Promise<Task | null> =>
          done(request.requestId, true),
      ),
    },
    submit: vi.fn(async (request: ImageImportRequest) => done(request.requestId)),
    find: vi.fn(
      async (request: ImageImportRequest): Promise<Task | null> => done(request.requestId),
    ),
  } satisfies ImageImportGateway
  let serial = 0
  const refresh = vi.fn(async () => true)
  const model = createImageImport(gateway, refresh, () => `image-request-${++serial}`, openOptimize)
  model.source.value = source
  return { model, gateway, refresh }
}

it('accepts installed paths only before an import submission and invalidates an earlier preview', async () => {
  const { model } = fixture()
  await model.readPreview()
  expect(model.acceptSource('/images/installed.qcow2')).toBe(true)
  expect(model.plan.value).toBeNull()
  expect(model.source.value).toBe('/images/installed.qcow2')
  model.source.value = source
  await model.readPreview()
  model.acknowledged.value = true
  await model.submit()
  expect(model.acceptSource('/images/another.qcow2')).toBe(false)
  expect(model.source.value).toBe(source)
  model.dispose()
})

it('requires confirmation of the current source plan, then prevents a second registration', async () => {
  const { model, gateway } = fixture()
  await model.readPreview()
  await model.submit()
  expect(gateway.submit).not.toHaveBeenCalled()
  model.acknowledged.value = true
  model.source.value = '/other.qcow2'
  expect(model.plan.value).toBeNull()
  expect(model.canSubmit.value).toBe(false)
  model.source.value = source
  await model.readPreview()
  model.acknowledged.value = true
  await model.submit()
  expect(gateway.submit.mock.calls[0]?.[0]).toEqual({
    requestId: 'image-request-3',
    planRequestId: 'image-request-2',
  })
  expect(model.succeeded.value).toBe(true)
  model.acknowledged.value = true
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(model.canPreview.value).toBe(false)
  model.dispose()
})

it('queries an uncertain registration without replaying it or permitting a new plan', async () => {
  const { model, gateway } = fixture()
  await model.readPreview()
  model.acknowledged.value = true
  gateway.submit.mockRejectedValue(new ApiError('timeout', 'Lost receipt'))
  await model.submit()
  gateway.find.mockResolvedValue(null)
  await model.reconcile()
  model.outcomeAcknowledged.value = true
  await model.restart()
  await model.readPreview()
  await model.submit()
  expect(model.entry.value?.state).toBe('unknown')
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.preview.submit).toHaveBeenCalledTimes(1)
  expect(model.canRestart.value).toBe(false)
  model.dispose()
})

it('requires outcome review and a fresh catalog before restarting after a partial failure', async () => {
  const openOptimize = vi.fn(async (id: string) => {
    void id
  })
  const { model, gateway, refresh } = fixture(openOptimize)
  await model.readPreview()
  model.acknowledged.value = true
  gateway.submit.mockImplementation(async (request) => ({
    ...done(request.requestId),
    state: 'failed',
    errorCode: 'COMMIT_UNCERTAIN',
    imageImport: {
      diskId,
      registered: false,
      registrationUncertain: true,
      recoveryRequired: true,
      added: 1,
    },
  }))
  await model.submit()
  expect(model.recoveryRequired.value).toBe(true)
  expect(model.succeeded.value).toBe(false)
  expect(model.optimizeAvailable.value).toBe(false)
  await model.optimize()
  expect(openOptimize).not.toHaveBeenCalled()
  await model.restart()
  expect(model.canPreview.value).toBe(false)
  model.outcomeAcknowledged.value = true
  refresh.mockResolvedValue(false)
  await model.restart()
  expect(model.restartProblem.value).not.toBeNull()
  expect(model.entry.value).not.toBeNull()
  refresh.mockResolvedValue(true)
  await model.restart()
  expect(model.entry.value).toBeNull()
  expect(model.plan.value).toBeNull()
  expect(model.canPreview.value).toBe(true)
  expect(model.acknowledged.value).toBe(false)
  model.dispose()
})

it('opens optimization only after explicit review of a confirmed import and blocks duplicate navigation', async () => {
  let finishOpening!: () => void
  const openOptimize = vi.fn(async (id: string) => {
    void id
    return new Promise<void>((resolve) => {
      finishOpening = resolve
    })
  })
  const { model, refresh } = fixture(openOptimize)
  await model.readPreview()
  await model.optimize()
  expect(openOptimize).not.toHaveBeenCalled()
  model.acknowledged.value = true
  refresh.mockResolvedValue(false)
  await model.submit()
  expect(model.canOptimize.value).toBe(false)
  await model.optimize()
  expect(openOptimize).not.toHaveBeenCalled()
  refresh.mockResolvedValue(true)
  await model.reconcile()
  model.leave()
  expect(model.canOptimize.value).toBe(true)
  expect(openOptimize).not.toHaveBeenCalled()
  const opening = model.optimize()
  expect(openOptimize).toHaveBeenCalledExactlyOnceWith(diskId)
  expect(model.openingOptimize.value).toBe(true)
  await model.optimize()
  expect(openOptimize).toHaveBeenCalledTimes(1)
  finishOpening()
  await opening
  expect(model.openingOptimize.value).toBe(false)
  model.dispose()
})

it('a recovered import receipt only offers optimization and navigation failure never replays either operation', async () => {
  const openOptimize = vi.fn(async (id: string) => {
    void id
    throw new ApiError('unavailable', 'Navigation unavailable')
  })
  const { model, gateway } = fixture(openOptimize)
  await model.readPreview()
  model.acknowledged.value = true
  gateway.submit.mockRejectedValue(new ApiError('timeout', 'Lost receipt'))
  await model.submit()
  const original = model.entry.value!.request
  await model.optimize()
  expect(openOptimize).not.toHaveBeenCalled()
  model.pause()
  await model.reconcile()
  expect(gateway.find).toHaveBeenCalledWith(original, expect.any(AbortSignal))
  expect(model.canOptimize.value).toBe(true)
  expect(openOptimize).not.toHaveBeenCalled()
  await model.optimize()
  expect(openOptimize).toHaveBeenCalledExactlyOnceWith(diskId)
  expect(model.optimizeProblem.value).not.toBeNull()
  await model.reconcile()
  model.leave()
  expect(openOptimize).toHaveBeenCalledTimes(1)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  model.reset()
  expect(model.canOptimize.value).toBe(false)
  expect(model.optimizeProblem.value).toBeNull()
  model.dispose()
})

it('accepts host aliases and exact capacities, but rejects an incomplete backing chain', async () => {
  const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
  let task = done('image-request', true)
  const client = {
    getJson: vi.fn(async () => ({ context, task })),
    postJson: vi.fn(async () => ({ context, task })),
    delete: vi.fn(async () => {}),
  }
  const gateway = createImageImportGateway(client, () => ({
    context,
    capabilities: ['images.import.v1'],
    csrfToken: 'token',
    administrator: true,
    manageTasks: true,
  }))
  const request = { requestId: 'image-request', source }
  const result = await gateway.preview.submit(request, new AbortController().signal)
  expect(result.imageImportPlan?.members[0]?.virtualSizeBytes).toBe('9007199254740993')
  expect(result.imageImportPlan?.source).not.toBe(result.imageImportPlan?.members[0]?.path)
  task = { ...task, imageImportPlan: { ...plan, members: [plan.members[0]!] } }
  await expect(gateway.preview.find(request, new AbortController().signal)).rejects.toMatchObject({
    code: 'invalid-response',
  })
})
