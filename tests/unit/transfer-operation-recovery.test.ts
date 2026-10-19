import { expect, it, vi } from 'vitest'
import { createImageTransfers } from '../../src/modules/images/model/transfers'
import {
  validTrackedImageInstall,
  type ImageInstallRequest,
  type ImageTransferGateway,
  type ImageUpload,
} from '../../src/modules/images/api/transfers'
import { createPackageTransfers } from '../../src/modules/packages/model/transfers'
import type {
  PackageTransfer,
  PackageTransferGateway,
} from '../../src/modules/packages/api/transfer'
import type { Task } from '../../src/modules/tasks'
import { ApiError } from '../../src/shared/api/errors'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
    clear: () => values.clear(),
  }
}
const identity = 'epoch:session'
const limits = {
  maxFiles: 1,
  maxFileBytes: '4096',
  maxSessionBytes: '4096',
  maxTotalBytes: '8192',
  chunkBytes: 2,
  ttlMs: 60000,
}
function uploaded(
  id: string,
  offset = '0',
  state: ImageUpload['state'] = 'receiving',
): ImageUpload {
  return {
    id,
    kind: 'upload',
    state,
    files: [{ index: 0, name: 'linux.img', sizeBytes: '3', offsetBytes: offset }],
    limits,
  }
}
function installed(request: ImageInstallRequest): Task {
  return {
    id: 'install-task',
    requestId: request.requestId,
    kind: 'image_install',
    resource: 'image',
    revision: '2',
    state: 'succeeded',
    cancellable: false,
    phase: 'done',
    unit: '',
    completed: '0',
    total: null,
    createdMs: '1',
    finishedMs: '2',
    resultAvailable: true,
    errorCode: null,
    imageInstall: {
      uploadId: request.uploadId,
      source: `${request.folder}/${request.name}`,
      installed: true,
      durabilityConfirmed: true,
      installationUncertain: false,
      recoveryRequired: false,
    },
  }
}
function fixture() {
  const storage = memoryStorage()
  const gateway = {
    upload: {
      tracking: { namespace: 'image-upload', storage },
      supported: () => true,
      beginUpload: vi.fn(async (id: string) => uploaded(id)),
      uploadStatus: vi.fn(async (id: string) => uploaded(id, '3', 'ready')),
      chunk: vi.fn(async (id: string, _index: number, offset: string, data: string) =>
        uploaded(id, String(Number(offset) + atob(data).length)),
      ),
      finish: vi.fn(async (id: string) => uploaded(id, '3', 'ready')),
      remove: vi.fn(async () => {}),
    },
    install: {
      tracking: {
        namespace: 'image-install',
        storage,
        valid: validTrackedImageInstall,
        key: () => 'install',
      },
      supported: () => true,
      submit: vi.fn(async (request: ImageInstallRequest) => installed(request)),
      find: vi.fn(async (request: ImageInstallRequest): Promise<Task | null> => installed(request)),
    },
  } satisfies ImageTransferGateway
  let serial = 0
  const accept = vi.fn(() => true)
  const create = () => {
    const model = createImageTransfers(gateway, accept, () => `image-${++serial}`)
    model.bind(identity)
    return model
  }
  return { storage, gateway, accept, create }
}
async function prepare(model: ReturnType<typeof createImageTransfers>) {
  model.select([new File(['abc'], 'linux.img')])
  model.draft.folder = '/images'
  await model.uploader.start()
  model.acknowledged.value = true
}

it('restores the original installation for GET only, then requires explicit handoff and can start another bound upload', async () => {
  const { create, gateway, storage, accept } = fixture()
  const first = create()
  await prepare(first)
  gateway.install.submit.mockRejectedValueOnce(new ApiError('timeout', 'Lost receipt'))
  await first.install()
  const request = gateway.install.submit.mock.calls[0]![0]
  const journal = storage.getItem('droidvm.operations.v1:image-install')
  expect(journal).toContain(request.requestId)
  first.dispose()
  expect(storage.getItem('droidvm.operations.v1:image-install')).toBe(journal)

  const restored = create()
  expect(restored.entry.value).toMatchObject({ state: 'unknown', restored: true, request })
  expect(restored.draft).toEqual({ folder: '', name: '' })
  expect(restored.acknowledged.value).toBe(false)
  expect(restored.uploader.restored.value).toBe(true)
  restored.clearInstallTracking()
  restored.clearUploadTracking()
  restored.outcomeAcknowledged.value = true
  restored.startNew()
  await restored.install()
  await restored.remove()
  expect(gateway.upload.remove).not.toHaveBeenCalled()
  await restored.reconcile()
  expect(gateway.install.find).toHaveBeenCalledWith(request, expect.any(AbortSignal))
  expect(restored.succeeded.value).toBe(true)
  expect(accept).not.toHaveBeenCalled()
  expect(gateway.install.submit).toHaveBeenCalledTimes(1)
  expect(restored.handoff()).toBe(true)
  expect(accept).toHaveBeenCalledWith('/images/linux.img')
  restored.outcomeAcknowledged.value = true
  restored.startNew()
  await prepare(restored)
  await restored.install()
  expect(gateway.upload.beginUpload).toHaveBeenCalledTimes(2)
  expect(gateway.install.submit).toHaveBeenCalledTimes(2)
  expect(restored.succeeded.value).toBe(true)
  restored.dispose()
})

it.each(['installationUncertain', 'recoveryRequired'] as const)(
  'keeps a restored %s result locked against clearing, cache removal and restart',
  async (flag) => {
    const { create, gateway, storage, accept } = fixture()
    const first = create()
    await prepare(first)
    gateway.install.submit.mockRejectedValueOnce(new ApiError('timeout', 'Lost receipt'))
    await first.install()
    first.dispose()
    gateway.install.find.mockImplementation(async (request) => {
      const task = installed(request)
      return {
        ...task,
        state: 'failed',
        errorCode: 'INSTALL_UNCERTAIN',
        imageInstall: { ...task.imageInstall!, durabilityConfirmed: false, [flag]: true },
      }
    })
    const restored = create()
    await restored.uploader.inspectUpload()
    await restored.reconcile()
    expect(restored.entry.value?.state).toBe('done')
    expect(restored.recoveryRequired.value).toBe(true)
    const installJournal = storage.getItem('droidvm.operations.v1:image-install')
    const uploadJournal = storage.getItem('droidvm.operations.v1:image-upload')
    restored.clearInstallTracking()
    restored.clearUploadTracking()
    restored.outcomeAcknowledged.value = true
    restored.startNew()
    await restored.remove()
    await restored.install()
    expect(restored.handoff()).toBe(false)
    expect(restored.canReset.value).toBe(false)
    expect(restored.canRemove.value).toBe(false)
    expect(gateway.upload.remove).not.toHaveBeenCalled()
    expect(gateway.install.submit).toHaveBeenCalledTimes(1)
    expect(accept).not.toHaveBeenCalled()
    expect(storage.getItem('droidvm.operations.v1:image-install')).toBe(installJournal)
    expect(storage.getItem('droidvm.operations.v1:image-upload')).toBe(uploadJournal)
    restored.dispose()
  },
)

it('blocks installation when a ready upload cannot persist its recovered state', async () => {
  const { create, gateway, storage } = fixture()
  const first = create()
  await prepare(first)
  first.dispose()
  const restored = create()
  vi.spyOn(storage, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  await restored.uploader.inspectUpload()
  expect(restored.uploader.recoveryProblem.value).toBe('unavailable')
  restored.draft.folder = '/images'
  restored.draft.name = 'linux.img'
  restored.acknowledged.value = true
  await restored.install()
  expect(restored.canInstall.value).toBe(false)
  expect(gateway.install.submit).not.toHaveBeenCalled()
  restored.dispose()
})

it('retains package uploads on dispose while isolating downloads and their late replies across identity changes', async () => {
  const storage = memoryStorage()
  const packageRecord = (
    id: string,
    offset = '0',
    state: PackageTransfer['state'] = 'receiving',
  ): PackageTransfer => ({
    ...uploaded(id, offset, state),
    files: [{ index: 0, name: 'vm.vmpkg', sizeBytes: '3', offsetBytes: offset }],
    ...(state === 'ready' ? { source: '/private/upload/vm.vmpkg' } : {}),
  })
  let completeDownload!: (value: PackageTransfer) => void
  const gateway = {
    tracking: { namespace: 'package-upload', storage },
    supported: () => true,
    beginUpload: vi.fn(async (id: string) => packageRecord(id)),
    uploadStatus: vi.fn(async (id: string) => packageRecord(id, '3', 'ready')),
    chunk: vi.fn(async (id: string, _index: number, offset: string, data: string) =>
      packageRecord(id, String(Number(offset) + atob(data).length)),
    ),
    finish: vi.fn(async (id: string) => packageRecord(id, '3', 'ready')),
    beginDownload: vi.fn<PackageTransferGateway['beginDownload']>(
      () =>
        new Promise<PackageTransfer>((resolve) => {
          completeDownload = resolve
        }),
    ),
    downloadStatus: vi.fn(async (id: string) => ({
      ...packageRecord(id, '3', 'ready'),
      kind: 'download' as const,
    })),
    remove: vi.fn(async () => {}),
  } satisfies PackageTransferGateway
  const first = createPackageTransfers(gateway, () => 'package-upload')
  first.bind(identity)
  first.select([new File(['abc'], 'vm.vmpkg')])
  await first.start()
  const journal = storage.getItem('droidvm.operations.v1:package-upload')
  first.dispose()
  expect(storage.getItem('droidvm.operations.v1:package-upload')).toBe(journal)
  const restored = createPackageTransfers(gateway, () => 'package-download')
  restored.bind(identity)
  expect(restored.restored.value).toBe(true)
  await restored.inspectUpload()
  expect(restored.uploadPhase.value).toBe('ready')
  const pending = restored.prepareDownload('export-request')
  restored.bind('epoch:another-session')
  expect(gateway.beginDownload.mock.calls[0]![2].aborted).toBe(true)
  completeDownload({ ...packageRecord('package-download', '3', 'ready'), kind: 'download' })
  await pending
  expect(restored.downloadId.value).toBeNull()
  expect(restored.download.value).toBeNull()
  expect(restored.downloadPhase.value).toBe('idle')
  expect(restored.uploadId.value).toBeNull()
  expect(gateway.beginUpload).toHaveBeenCalledTimes(1)
  expect(storage.getItem('droidvm.operations.v1:package-upload')).toBe(journal)
  restored.dispose()
})

it('accepts only the installation request fields and a normalized destination in the journal', () => {
  const request: ImageInstallRequest = {
    requestId: 'install-1',
    uploadId: 'upload-1',
    folder: '/images',
    name: 'linux.img',
  }
  expect(validTrackedImageInstall(request)).toBe(true)
  for (const candidate of [
    { ...request, context: { daemonEpoch: 'epoch', sessionId: '0'.repeat(64) } },
    { ...request, csrfToken: 'secret' },
    { ...request, cookie: 'secret' },
    { ...request, folder: '/images/../other' },
    { ...request, folder: '/images//nested' },
    { ...request, name: '.dvm-private' },
    { ...request, name: '../linux.img' },
  ])
    expect(validTrackedImageInstall(candidate)).toBe(false)
})
