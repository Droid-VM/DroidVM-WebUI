import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import {
  createChunkedUpload,
  type UploadGateway,
  type UploadSnapshot,
} from '../../src/shared/model/chunkedUpload'
import { browserUploadFiles, uploadChunkBytes } from '../../src/shared/lib/uploadFiles'
import {
  createUploadJournal,
  validUploadRecord,
  type UploadRecord,
} from '../../src/shared/model/uploadJournal'
import { ApiError } from '../../src/shared/api/errors'

const identity = 'epoch:session'
const key = 'droidvm.operations.v1:test-upload'
const file = () => new File(['abc'], 'disk.img', { lastModified: 1 })
function snapshot(offset = '0', state = 'receiving'): UploadSnapshot {
  return {
    id: 'original-upload',
    kind: 'upload',
    state,
    files: [{ index: 0, name: 'disk.img', sizeBytes: '3', offsetBytes: offset }],
    limits: { chunkBytes: 2 },
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
function fixture(storage = memory()) {
  let status = snapshot()
  const gateway: UploadGateway<UploadSnapshot> = {
    tracking: { namespace: 'test-upload', storage },
    supported: () => true,
    beginUpload: vi.fn(async () => status),
    uploadStatus: vi.fn(async () => status),
    chunk: vi.fn(async (_id, _index, offset, data) => {
      status = snapshot(String(Number(offset) + atob(data).length))
      return status
    }),
    finish: vi.fn(async () => {
      status = snapshot('3', 'ready')
      return status
    }),
    remove: vi.fn(async () => {}),
  }
  const model = createChunkedUpload(gateway, {
    files: browserUploadFiles,
    newId: () => 'original-upload',
  })
  return {
    model,
    gateway,
    storage,
    set: (value: UploadSnapshot) => {
      status = value
    },
  }
}
function stored(storage: Storage): UploadRecord {
  return JSON.parse(storage.getItem(key)!).records[0].request as UploadRecord
}

it('restores a lost chunk by GET and requires full matching content before an explicit continuation', async () => {
  const first = fixture()
  first.model.bind(identity)
  first.model.select([file()])
  vi.mocked(first.gateway.chunk).mockImplementationOnce(async () => {
    expect(stored(first.storage)).toMatchObject({
      offsets: ['0'],
      step: { kind: 'chunk', oldOffset: '0', end: '2' },
    })
    first.set(snapshot('2'))
    throw new Error('Chunk receipt lost')
  })
  await first.model.start()
  expect(first.model.uploadPhase.value).toBe('unknown')
  expect(stored(first.storage).files).toEqual([
    { name: 'disk.img', sizeBytes: '3', sha256: createHash('sha256').update('abc').digest('hex') },
  ])
  first.model.dispose()
  const restored = fixture(first.storage)
  restored.set(snapshot('2'))
  restored.model.bind(identity)
  expect(restored.model.restored.value).toBe(true)
  expect(restored.model.uploadPhase.value).toBe('unknown')
  expect(restored.model.canDelete.value).toBe(false)
  await restored.model.resumeUpload()
  await restored.model.inspectUpload()
  expect(restored.model.uploadPhase.value).toBe('paused')
  expect(restored.model.needsFiles.value).toBe(true)
  // Same name, size, timestamp and uploaded prefix; only the unuploaded suffix differs.
  await restored.model.reselect([new File(['abd'], 'disk.img', { lastModified: 1 })])
  expect(restored.model.uploadProblem.value?.code).toBe('conflict')
  expect(restored.model.canResume.value).toBe(false)
  await restored.model.resumeUpload()
  expect(restored.gateway.chunk).not.toHaveBeenCalled()
  await restored.model.reselect([file()])
  expect(restored.model.needsFiles.value).toBe(false)
  expect(restored.model.canResume.value).toBe(true)
  expect(restored.gateway.chunk).not.toHaveBeenCalled()
  await restored.model.resumeUpload()
  expect(restored.gateway.chunk).toHaveBeenCalledWith(
    'original-upload',
    0,
    '2',
    btoa('c'),
    expect.any(AbortSignal),
  )
  expect(restored.model.uploadPhase.value).toBe('ready')
  expect(restored.gateway.beginUpload).not.toHaveBeenCalled()
  restored.model.dispose()
})

it('recovers finished uploads without Files while preserving unknown deletion and missing/expired IDs', async () => {
  const first = fixture()
  first.model.bind(identity)
  first.model.select([file()])
  vi.mocked(first.gateway.finish).mockRejectedValueOnce(new Error('Finish receipt lost'))
  await first.model.start()
  expect(stored(first.storage).step).toEqual({ kind: 'finish' })
  first.model.dispose()
  const ready = fixture(first.storage)
  ready.model.bind(identity)
  expect(ready.model.uploadPhase.value).toBe('unknown')
  ready.set(snapshot('3', 'ready'))
  await ready.model.inspectUpload()
  expect(ready.model.uploadPhase.value).toBe('ready')
  expect(ready.model.needsFiles.value).toBe(false)
  expect(ready.gateway.finish).not.toHaveBeenCalled()
  vi.mocked(ready.gateway.remove).mockRejectedValueOnce(new Error('Delete receipt lost'))
  await ready.model.deleteUpload()
  expect(stored(ready.storage).step).toEqual({ kind: 'delete' })
  ready.model.dispose()
  const deletion = fixture(first.storage)
  deletion.set(snapshot('3', 'ready'))
  deletion.model.bind(identity)
  await deletion.model.inspectUpload()
  expect(deletion.model.uploadPhase.value).toBe('unknown')
  expect(stored(deletion.storage).step).toEqual({ kind: 'delete' })
  vi.mocked(deletion.gateway.uploadStatus).mockRejectedValueOnce(
    new ApiError('unavailable', 'Expired'),
  )
  await deletion.model.inspectUpload()
  expect(deletion.model.uploadId.value).toBe('original-upload')
  expect(deletion.model.canStart.value).toBe(false)
  await deletion.model.resumeUpload()
  expect(deletion.gateway.beginUpload).not.toHaveBeenCalled()
  expect(deletion.gateway.finish).not.toHaveBeenCalled()
  expect(deletion.gateway.remove).not.toHaveBeenCalled()
  await deletion.model.deleteUpload()
  expect(deletion.storage.getItem(key)).toBeNull()
  deletion.model.dispose()
})

it('journals before each write and preserves the original record when storage fails or is repaired', async () => {
  const denied = fixture()
  denied.model.bind(identity)
  denied.model.select([file()])
  const write = vi.mocked(denied.storage.setItem).getMockImplementation()!
  vi.mocked(denied.storage.setItem).mockImplementation(() => {
    throw new Error('Quota exceeded')
  })
  await denied.model.start()
  expect(denied.gateway.beginUpload).not.toHaveBeenCalled()
  expect(denied.model.recoveryProblem.value).toBe('unavailable')
  expect(denied.model.uploadId.value).toBe('original-upload')
  vi.mocked(denied.storage.setItem).mockImplementation(write)
  denied.model.clearTracking()
  expect(stored(denied.storage).step).toEqual({ kind: 'begin' })
  expect(denied.model.canStart.value).toBe(false)
  denied.model.forgetUpload()
  expect(denied.storage.getItem(key)).toBeNull()
  denied.model.dispose()

  const chunk = fixture()
  chunk.model.bind(identity)
  chunk.model.select([file()])
  const save = vi.mocked(chunk.storage.setItem).getMockImplementation()!
  vi.mocked(chunk.storage.setItem).mockImplementation((name, value) => {
    const record = JSON.parse(value).records[0]?.request as UploadRecord | undefined
    if (record?.step?.kind === 'chunk' && record.step.oldOffset === '2')
      throw new Error('Storage unavailable')
    save(name, value)
  })
  await chunk.model.start()
  expect(chunk.gateway.chunk).toHaveBeenCalledTimes(1)
  expect(chunk.gateway.finish).not.toHaveBeenCalled()
  expect(chunk.model.recoveryProblem.value).toBe('unavailable')
  expect(chunk.model.canResume.value).toBe(false)
  vi.mocked(chunk.storage.setItem).mockImplementation(save)
  chunk.model.clearTracking()
  expect(stored(chunk.storage)).toMatchObject({
    offsets: ['2'],
    step: { kind: 'chunk', oldOffset: '2', end: '3' },
  })
  chunk.model.dispose()
  const recovered = fixture(chunk.storage)
  recovered.set(snapshot('2'))
  recovered.model.bind(identity)
  await recovered.model.inspectUpload()
  expect(recovered.model.uploadPhase.value).toBe('retry')
  expect(recovered.gateway.chunk).not.toHaveBeenCalled()
  recovered.model.dispose()
})

it('bounds hashing reads, cancels on pause or identity change, and ignores late upload observations', async () => {
  const f = fixture()
  f.model.bind(identity)
  const large = new File([new Uint8Array(uploadChunkBytes * 2 + 1)], 'large.img')
  let complete!: (value: ArrayBuffer) => void
  const slice = vi.spyOn(large, 'slice').mockImplementationOnce((start, end) => {
    expect((end ?? large.size) - (start ?? 0)).toBeLessThanOrEqual(uploadChunkBytes)
    return {
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          complete = resolve
        }),
    } as Blob
  })
  const fullRead = vi.spyOn(large, 'arrayBuffer')
  f.model.select([large])
  const pending = f.model.start()
  expect(f.model.hashBusy.value).toBe(true)
  await f.model.start()
  f.model.pause()
  complete(new ArrayBuffer(uploadChunkBytes))
  await pending
  expect(slice).toHaveBeenCalledTimes(1)
  expect(fullRead).not.toHaveBeenCalled()
  expect(f.gateway.beginUpload).not.toHaveBeenCalled()
  expect(f.storage.getItem(key)).toBeNull()

  f.model.select([file()])
  vi.mocked(f.gateway.chunk).mockRejectedValueOnce(new Error('Lost receipt'))
  await f.model.start()
  const saved = f.storage.getItem(key)
  let observe!: (value: UploadSnapshot) => void
  vi.mocked(f.gateway.uploadStatus).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        observe = resolve
      }),
  )
  const inspection = f.model.inspectUpload()
  f.model.bind('other-epoch:session')
  observe(snapshot('2'))
  await inspection
  expect(f.model.uploadId.value).toBeNull()
  expect(f.model.upload.value).toBeNull()
  expect(f.storage.getItem(key)).toBe(saved)
  f.model.dispose()
  const logout = fixture(f.storage)
  logout.model.reset()
  expect(f.storage.getItem(key)).toBeNull()
  logout.model.dispose()
})

it('rejects corrupt journals, secret fields, mismatched offsets and unsafe fingerprints before any mutation', async () => {
  const request: UploadRecord = {
    uploadId: 'upload',
    files: [{ name: 'disk.img', sizeBytes: '3', sha256: 'a'.repeat(64) }],
    offsets: ['0'],
    step: { kind: 'begin' },
  }
  expect(validUploadRecord(request)).toBe(true)
  for (const value of [
    { ...request, token: 'secret' },
    { ...request, offsets: ['4'] },
    { ...request, files: [{ ...request.files[0], blob: 'bytes' }] },
    { ...request, files: [{ ...request.files[0], sha256: 'fingerprint' }] },
    { ...request, step: { kind: 'chunk', index: 0, oldOffset: '1', end: '2', offsets: ['1'] } },
    { ...request, step: { kind: 'finish' } },
  ])
    expect(validUploadRecord(value)).toBe(false)
  const f = fixture()
  f.storage.setItem(key, '{broken')
  f.model.bind(identity)
  f.model.select([file()])
  await f.model.start()
  expect(f.model.recoveryProblem.value).toBe('invalid')
  expect(f.gateway.beginUpload).not.toHaveBeenCalled()
  f.model.clearTracking()
  expect(f.model.recoveryProblem.value).toBeNull()
  expect(f.model.canStart.value).toBe(true)
  f.model.dispose()

  const storage = memory(),
    journal = createUploadJournal({ namespace: 'test-upload', storage })
  const full: UploadRecord = {
    ...request,
    files: Array.from({ length: 1000 }, (_, i) => ({
      name: '"'.repeat(251) + String(i).padStart(4, '0'),
      sizeBytes: '0',
      sha256: 'a'.repeat(64),
    })),
    offsets: Array.from({ length: 1000 }, () => '0'),
  }
  journal.load(identity)
  journal.save(identity, [{ key: 'upload', request: full }])
  expect(journal.load(identity)[0]?.request.files).toHaveLength(1000)
})
