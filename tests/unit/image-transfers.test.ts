import { expect, it, vi } from 'vitest'
import {
  createImageTransfers,
  validImageDestination,
} from '../../src/modules/images/model/transfers'
import type {
  ImageTransferGateway,
  ImageInstallRequest,
  ImageUpload,
} from '../../src/modules/images/api/transfers'
import type { Task } from '../../src/modules/tasks'
import { ApiError } from '../../src/shared/api/errors'
const limits = {
  maxFiles: 1,
  maxFileBytes: '68719476736',
  maxSessionBytes: '68719476736',
  maxTotalBytes: '137438953472',
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
  const gateway = {
    upload: {
      supported: () => true,
      beginUpload: vi.fn(async (id: string) => uploaded(id)),
      uploadStatus: vi.fn(async (id: string) => uploaded(id, '3', 'ready')),
      chunk: vi.fn(async (id: string, _index: number, offset: string, data: string) =>
        uploaded(id, String(BigInt(offset) + BigInt(atob(data).length))),
      ),
      finish: vi.fn(async (id: string) => uploaded(id, '3', 'ready')),
      remove: vi.fn(async () => {}),
    },
    install: {
      supported: () => true,
      submit: vi.fn(async (request: ImageInstallRequest) => installed(request)),
      find: vi.fn(async (request: ImageInstallRequest): Promise<Task | null> => {
        void request
        return null
      }),
    },
  } satisfies ImageTransferGateway
  let serial = 0
  const accept = vi.fn(() => true),
    model = createImageTransfers(gateway, accept, () => `image-${++serial}`)
  model.select([new File(['abc'], 'linux.img')])
  model.draft.folder = '/images'
  return { model, gateway, accept }
}
it('hands off only a confirmed persistent installation, never the ready upload cache', async () => {
  const { model, gateway, accept } = fixture()
  await model.uploader.start()
  expect(model.uploader.uploadPhase.value).toBe('ready')
  expect(model.handoff()).toBe(false)
  expect(accept).not.toHaveBeenCalled()
  await model.install()
  expect(gateway.install.submit).not.toHaveBeenCalled()
  model.acknowledged.value = true
  await model.install()
  expect(model.succeeded.value).toBe(true)
  expect(model.handoff()).toBe(true)
  expect(accept).toHaveBeenCalledWith('/images/linux.img')
  await model.remove()
  expect(gateway.upload.remove).toHaveBeenCalledTimes(1)
  expect(model.result.value?.source).toBe('/images/linux.img')
  model.dispose()
})
it('locks cache deletion and reset after a lost installation receipt and only queries its original request', async () => {
  const { model, gateway } = fixture()
  await model.uploader.start()
  model.acknowledged.value = true
  gateway.install.submit.mockRejectedValue(new ApiError('timeout', 'Receipt lost'))
  await model.install()
  model.outcomeAcknowledged.value = true
  await model.remove()
  model.startNew()
  await model.install()
  await model.reconcile()
  expect(model.entry.value?.state).toBe('unknown')
  expect(gateway.upload.remove).not.toHaveBeenCalled()
  expect(gateway.install.submit).toHaveBeenCalledTimes(1)
  const request = gateway.install.submit.mock.calls[0]![0]
  expect(gateway.install.find).toHaveBeenCalledWith(request, expect.any(AbortSignal))
  gateway.install.find.mockResolvedValue(installed(request))
  await model.reconcile()
  expect(model.succeeded.value).toBe(true)
  expect(gateway.install.submit).toHaveBeenCalledTimes(1)
  model.dispose()
})
it('preserves an occupied importer and refuses uncertain installation results', async () => {
  const { model, gateway, accept } = fixture()
  await model.uploader.start()
  model.acknowledged.value = true
  await model.install()
  accept.mockReturnValue(false)
  expect(model.handoff()).toBe(false)
  expect(model.handoffBlocked.value).toBe(true)
  model.outcomeAcknowledged.value = true
  model.startNew()
  model.select([new File(['abc'], 'linux.img')])
  await model.uploader.start()
  model.acknowledged.value = true
  gateway.install.submit.mockImplementation(async (request) => ({
    ...installed(request),
    state: 'failed',
    errorCode: 'INSTALL_UNCERTAIN',
    imageInstall: {
      uploadId: request.uploadId,
      source: '/images/linux.img',
      installed: true,
      durabilityConfirmed: false,
      installationUncertain: true,
      recoveryRequired: true,
    },
  }))
  await model.install()
  expect(model.handoff()).toBe(false)
  expect(model.canRemove.value).toBe(false)
  model.outcomeAcknowledged.value = true
  expect(model.canReset.value).toBe(false)
  expect(validImageDestination('/images//nested', 'linux.img')).toBe(false)
  expect(validImageDestination('/' + '字'.repeat(1364), 'linux.img')).toBe(false)
  model.dispose()
})
