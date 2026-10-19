import { expect, it, vi } from 'vitest'
import { createPackageTransfers } from '../../src/modules/packages/model/transfers'
import { validDownloadRecord } from '../../src/modules/packages/model/downloadJournal'
import type {
  PackageTransfer,
  PackageTransferGateway,
} from '../../src/modules/packages/api/transfer'
import { ApiError } from '../../src/shared/api/errors'

const journalKey = 'droidvm.operations.v1:package-download'
const identity = 'epoch:session'
const limits = {
  maxFiles: 1000,
  maxFileBytes: '4096',
  maxSessionBytes: '4096',
  maxTotalBytes: '8192',
  chunkBytes: 2,
  ttlMs: 60000,
}
function ready(id: string): PackageTransfer {
  return {
    id,
    kind: 'download',
    state: 'ready',
    limits,
    files: [{ index: 0, name: 'vm.vmpkg', sizeBytes: '3', offsetBytes: '3' }],
  }
}
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
function fixture() {
  const storage = memoryStorage()
  const gateway = {
    downloadTracking: { namespace: 'package-download', storage },
    supported: () => true,
    beginUpload: vi.fn<PackageTransferGateway['beginUpload']>(),
    uploadStatus: vi.fn<PackageTransferGateway['uploadStatus']>(),
    chunk: vi.fn<PackageTransferGateway['chunk']>(),
    finish: vi.fn<PackageTransferGateway['finish']>(),
    beginDownload: vi.fn<PackageTransferGateway['beginDownload']>(async (id) => ready(id)),
    downloadStatus: vi.fn<PackageTransferGateway['downloadStatus']>(async (id) => ready(id)),
    remove: vi.fn<PackageTransferGateway['remove']>(async () => {}),
  } satisfies PackageTransferGateway
  let serial = 0
  const create = (scope = identity) => {
    const model = createPackageTransfers(gateway, () => `download-${++serial}`)
    model.bind(scope)
    return model
  }
  return { storage, gateway, create }
}

it('persists before preparing and restores a lost preparation receipt using only the original GET', async () => {
  const { storage, gateway, create } = fixture()
  gateway.beginDownload.mockImplementationOnce(async (id, exportRequestId) => {
    expect(JSON.parse(storage.getItem(journalKey)!)).toEqual({
      version: 1,
      identity,
      records: [{ key: 'download', request: { downloadId: id, exportRequestId, step: 'begin' } }],
    })
    throw new ApiError('timeout', 'Receipt lost')
  })
  const original = create()
  await original.prepareDownload('export-1')
  original.dispose()
  const recovered = create()
  expect(recovered.downloadRestored.value).toBe(true)
  expect(recovered.downloadPhase.value).toBe('unknown')
  expect(recovered.canDeleteDownload.value).toBe(false)
  expect(recovered.canAccessDownload.value).toBe(false)
  expect(gateway.downloadStatus).not.toHaveBeenCalled()
  await recovered.prepareDownload('export-2')
  await recovered.deleteDownload()
  expect(gateway.beginDownload).toHaveBeenCalledTimes(1)
  expect(gateway.remove).not.toHaveBeenCalled()
  await recovered.inspectDownload()
  expect(gateway.downloadStatus).toHaveBeenCalledWith('download-1', expect.any(AbortSignal))
  expect(recovered.downloadPhase.value).toBe('ready')
  expect(recovered.canAccessDownload.value).toBe(true)
  expect(recovered.canDeleteDownload.value).toBe(true)
  expect(gateway.beginDownload).toHaveBeenCalledTimes(1)
  recovered.dispose()
  const readyRestored = create()
  expect(readyRestored.download.value).toBeNull()
  expect(readyRestored.canAccessDownload.value).toBe(false)
  await readyRestored.inspectDownload()
  expect(readyRestored.canAccessDownload.value).toBe(true)
  readyRestored.dispose()
})

it('keeps a lost DELETE unresolved even when GET still returns ready or later cannot find it', async () => {
  const { storage, gateway, create } = fixture()
  const first = create()
  await first.prepareDownload('export-1')
  gateway.remove.mockImplementationOnce(async () => {
    expect(JSON.parse(storage.getItem(journalKey)!).records[0].request.step).toBe('delete')
    throw new ApiError('timeout', 'Delete receipt lost')
  })
  await first.deleteDownload()
  first.dispose()
  const restored = create()
  await restored.inspectDownload()
  expect(restored.downloadPhase.value).toBe('unknown')
  expect(restored.downloadDeleteUnknown.value).toBe(true)
  expect(restored.canAccessDownload.value).toBe(false)
  expect(restored.canPrepareDownload.value).toBe(false)
  expect(restored.canDeleteDownload.value).toBe(true)
  const journal = storage.getItem(journalKey)
  gateway.downloadStatus.mockRejectedValue(new ApiError('unavailable', 'HTTP 404'))
  await restored.inspectDownload()
  expect(restored.downloadProblem.value?.descriptionKey).toBe('transferDownloadUnavailableHint')
  expect(storage.getItem(journalKey)).toBe(journal)
  expect(restored.downloadId.value).toBe('download-1')
  expect(restored.canAccessDownload.value).toBe(false)
  expect(gateway.remove).toHaveBeenCalledTimes(1)
  restored.forgetDownload()
  expect(storage.getItem(journalKey)).toBeNull()
  expect(restored.downloadId.value).toBeNull()
  expect(restored.canPrepareDownload.value).toBe(true)
  expect(gateway.beginDownload).toHaveBeenCalledTimes(1)
  expect(gateway.remove).toHaveBeenCalledTimes(1)
  restored.dispose()
})

it('allows an explicit DELETE retry after querying the original closing record and clears only on a receipt', async () => {
  const { storage, gateway, create } = fixture()
  const first = create()
  await first.prepareDownload('export-1')
  gateway.remove.mockRejectedValueOnce(new ApiError('conflict', 'Active reader closing'))
  await first.deleteDownload()
  first.dispose()
  gateway.downloadStatus.mockImplementation(async (id) => ({ ...ready(id), state: 'closing' }))
  const restored = create()
  await restored.inspectDownload()
  expect(restored.canAccessDownload.value).toBe(false)
  expect(restored.downloadPhase.value).toBe('unknown')
  await restored.deleteDownload()
  expect(gateway.remove).toHaveBeenCalledTimes(2)
  expect(gateway.remove).toHaveBeenLastCalledWith('download', 'download-1', expect.any(AbortSignal))
  expect(storage.getItem(journalKey)).toBeNull()
  expect(restored.downloadPhase.value).toBe('idle')
  restored.dispose()
})

it('blocks preparation, deletion and file links on storage failures, and repair retains an unresolved request', async () => {
  const { storage, gateway, create } = fixture()
  const model = create()
  const write = vi.spyOn(storage, 'setItem').mockImplementation(() => {
    throw new Error('Storage full')
  })
  await model.prepareDownload('export-1')
  expect(gateway.beginDownload).not.toHaveBeenCalled()
  expect(model.downloadRecoveryProblem.value).toBe('unavailable')
  expect(model.canPrepareDownload.value).toBe(false)
  expect(model.canDeleteDownload.value).toBe(false)
  expect(model.canAccessDownload.value).toBe(false)
  write.mockRestore()
  model.clearDownloadTracking()
  expect(model.downloadId.value).toBe('download-1')
  expect(model.canPrepareDownload.value).toBe(false)
  expect(JSON.parse(storage.getItem(journalKey)!).records[0].request.step).toBe('begin')
  await model.inspectDownload()
  expect(model.canAccessDownload.value).toBe(true)
  const failedDeleteWrite = vi.spyOn(storage, 'setItem').mockImplementation(() => {
    throw new Error('Storage full')
  })
  await model.deleteDownload()
  expect(gateway.remove).not.toHaveBeenCalled()
  expect(model.canAccessDownload.value).toBe(false)
  failedDeleteWrite.mockRestore()
  model.clearDownloadTracking()
  await model.inspectDownload()
  expect(model.downloadDeleteUnknown.value).toBe(true)
  expect(model.canAccessDownload.value).toBe(false)
  await model.deleteDownload()
  expect(gateway.remove).toHaveBeenCalledTimes(1)
  expect(storage.getItem(journalKey)).toBeNull()
  model.dispose()
})

it('does not expose recovered links when the GET result could not be saved, or erase an unknown DELETE when cleanup fails', async () => {
  const { storage, gateway, create } = fixture()
  const first = create()
  await first.prepareDownload('export-1')
  first.dispose()
  const model = create()
  const write = vi.spyOn(storage, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  await model.inspectDownload()
  expect(model.downloadRecoveryProblem.value).toBe('unavailable')
  expect(model.canAccessDownload.value).toBe(false)
  write.mockRestore()
  model.clearDownloadTracking()
  expect(model.canAccessDownload.value).toBe(false)
  await model.inspectDownload()
  expect(model.canAccessDownload.value).toBe(true)
  const clear = vi.spyOn(storage, 'removeItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  await model.deleteDownload()
  expect(gateway.remove).toHaveBeenCalledTimes(1)
  expect(model.downloadId.value).toBe('download-1')
  expect(model.downloadDeleteUnknown.value).toBe(true)
  expect(model.canAccessDownload.value).toBe(false)
  model.forgetDownload()
  expect(model.downloadId.value).toBe('download-1')
  clear.mockRestore()
  model.forgetDownload()
  expect(model.downloadId.value).toBeNull()
  model.dispose()
})

it('isolates the old identity and late replies, while dispose retains and reset explicitly clears the journal', async () => {
  const { storage, gateway, create } = fixture()
  let complete!: (value: PackageTransfer) => void
  gateway.beginDownload.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  const model = create()
  const preparation = model.prepareDownload('export-1')
  const journal = storage.getItem(journalKey)
  model.bind('epoch:another-session')
  expect(gateway.beginDownload.mock.calls[0]![2].aborted).toBe(true)
  complete(ready('download-1'))
  await preparation
  expect(model.downloadId.value).toBeNull()
  expect(model.download.value).toBeNull()
  expect(model.downloadBusy.value).toBe(false)
  expect(model.canAccessDownload.value).toBe(false)
  expect(storage.getItem(journalKey)).toBe(journal)
  model.dispose()
  const originalIdentity = create()
  expect(originalIdentity.downloadRestored.value).toBe(true)
  originalIdentity.reset()
  expect(storage.getItem(journalKey)).toBeNull()
  expect(originalIdentity.canPrepareDownload.value).toBe(false)
  originalIdentity.bind(identity)
  expect(originalIdentity.canPrepareDownload.value).toBe(true)
  originalIdentity.dispose()
})

it('ignores a paused query even if it resolves after a fresh explicit query', async () => {
  const { gateway, create } = fixture()
  const model = create()
  await model.prepareDownload('export-1')
  let complete!: (value: PackageTransfer) => void
  gateway.downloadStatus.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  const oldQuery = model.inspectDownload()
  model.pause()
  expect(gateway.downloadStatus.mock.calls[0]![1].aborted).toBe(true)
  expect(model.downloadPhase.value).toBe('unknown')
  expect(model.canAccessDownload.value).toBe(false)
  await model.inspectDownload()
  complete({ ...ready('foreign-download'), state: 'closing' })
  await oldQuery
  expect(model.download.value?.id).toBe('download-1')
  expect(model.downloadPhase.value).toBe('ready')
  expect(model.downloadProblem.value).toBeNull()
  expect(model.downloadBusy.value).toBe(false)
  expect(model.canAccessDownload.value).toBe(true)
  model.dispose()
})

it('blocks corrupt storage and rejects credentials, paths and malformed tracking records', () => {
  const { storage, gateway, create } = fixture()
  const record = { downloadId: 'download-1', exportRequestId: 'export-1', step: 'begin' }
  expect(validDownloadRecord(record)).toBe(true)
  for (const invalid of [
    { ...record, cookie: 'secret' },
    { ...record, context: {} },
    { ...record, downloadId: '../other' },
    { ...record, exportRequestId: '' },
    { ...record, step: 'finish' },
  ]) {
    expect(validDownloadRecord(invalid)).toBe(false)
  }
  storage.setItem(
    journalKey,
    JSON.stringify({
      version: 1,
      identity,
      records: [{ key: 'download', request: { ...record, token: 'secret' } }],
    }),
  )
  const model = create()
  expect(model.downloadRecoveryProblem.value).toBe('invalid')
  expect(model.canPrepareDownload.value).toBe(false)
  expect(model.canAccessDownload.value).toBe(false)
  expect(gateway.beginDownload).not.toHaveBeenCalled()
  model.clearDownloadTracking()
  expect(storage.getItem(journalKey)).toBeNull()
  expect(model.canPrepareDownload.value).toBe(true)
  model.dispose()
})
