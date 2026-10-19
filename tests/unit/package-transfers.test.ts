import { expect, it, vi } from 'vitest'
import { createPackageTransfers } from '../../src/modules/packages/model/transfers'
import { packageDownloadHref, uploadFiles } from '../../src/modules/packages/model/transferFiles'
import type {
  PackageTransfer,
  PackageTransferGateway,
} from '../../src/modules/packages/api/transfer'

const limits = {
  maxFiles: 1000,
  maxFileBytes: '68719476736',
  maxSessionBytes: '68719476736',
  maxTotalBytes: '137438953472',
  chunkBytes: 2,
  ttlMs: 60000,
}
function record(offset = '0', state: PackageTransfer['state'] = 'receiving'): PackageTransfer {
  return {
    id: 'transfer',
    kind: 'upload',
    state,
    files: [{ index: 0, name: 'vm.vmpkg', sizeBytes: '3', offsetBytes: offset }],
    limits,
    ...(state === 'ready' ? { source: '/private/upload/vm.vmpkg' } : {}),
  }
}
function fixture() {
  const gateway = {
    supported: () => true,
    beginUpload: vi.fn(async () => record()),
    uploadStatus: vi.fn(async () => record()),
    chunk: vi.fn(async (_id: string, _index: number, offset: string, data: string) =>
      record(String(Number(offset) + atob(data).length)),
    ),
    finish: vi.fn(async () => record('3', 'ready')),
    beginDownload: vi.fn(async () => ({ ...record('3', 'ready'), kind: 'download' as const })),
    downloadStatus: vi.fn(async () => ({ ...record('3', 'ready'), kind: 'download' as const })),
    remove: vi.fn(async () => {}),
  } satisfies PackageTransferGateway
  const model = createPackageTransfers(gateway, () => 'transfer')
  model.select([new File(['abc'], 'vm.vmpkg')])
  return { gateway, model }
}

it('sends sequential chunks using actual server limit and keeps exact acknowledged offsets', async () => {
  const { model, gateway } = fixture()
  await model.start()
  expect(gateway.chunk.mock.calls.map((call) => [call[2], atob(call[3])])).toEqual([
    ['0', 'ab'],
    ['2', 'c'],
  ])
  expect(model.uploadPhase.value).toBe('ready')
  expect(model.upload.value?.source).toBe('/private/upload/vm.vmpkg')
  expect(model.percent.value).toBe(100)
  expect(gateway.finish).toHaveBeenCalledTimes(1)
})

it.each(['0', '2', '1'])(
  'queries a lost chunk receipt at offset %s without replay',
  async (offset) => {
    const { model, gateway } = fixture()
    gateway.chunk.mockRejectedValueOnce(new Error('lost receipt'))
    await model.start()
    expect(model.uploadPhase.value).toBe('unknown')
    gateway.uploadStatus.mockResolvedValue(record(offset))
    await model.inspectUpload()
    expect(gateway.chunk).toHaveBeenCalledTimes(1)
    expect(gateway.beginUpload).toHaveBeenCalledTimes(1)
    expect(gateway.finish).not.toHaveBeenCalled()
    if (offset === '0' || offset === '2') {
      expect(model.uploadPhase.value).toBe(offset === '0' ? 'retry' : 'paused')
      await model.resumeUpload()
      expect(model.uploadPhase.value).toBe('ready')
      expect(gateway.chunk.mock.calls[1]?.[2]).toBe(offset)
    } else {
      await model.resumeUpload()
      expect(gateway.chunk).toHaveBeenCalledTimes(1)
      expect(model.uploadProblem.value?.code).toBe('conflict')
    }
  },
)

it('reconciles unknown begin and finish with GET and requires an explicit finish retry', async () => {
  const { model, gateway } = fixture()
  gateway.beginUpload.mockRejectedValueOnce(new Error('begin receipt lost'))
  await model.start()
  await model.inspectUpload()
  expect(gateway.beginUpload).toHaveBeenCalledTimes(1)
  expect(gateway.chunk).not.toHaveBeenCalled()
  gateway.finish.mockRejectedValueOnce(new Error('finish receipt lost'))
  await model.resumeUpload()
  expect(model.uploadPhase.value).toBe('unknown')
  gateway.uploadStatus.mockResolvedValue(record('3'))
  await model.inspectUpload()
  expect(model.uploadPhase.value).toBe('retry')
  expect(gateway.finish).toHaveBeenCalledTimes(1)
  await model.resumeUpload()
  expect(gateway.finish).toHaveBeenCalledTimes(2)
  expect(model.uploadPhase.value).toBe('ready')
})

it('keeps selected Files while paused but clears them on identity change; abandoning tracking does not delete', async () => {
  const { model, gateway } = fixture()
  gateway.chunk.mockRejectedValueOnce(new Error('offline'))
  await model.start()
  model.pause()
  expect(model.metadata.value?.[0]?.name).toBe('vm.vmpkg')
  model.forgetUpload()
  expect(model.metadata.value).toBeNull()
  expect(gateway.remove).not.toHaveBeenCalled()
  model.select([new File(['abc'], 'vm.vmpkg')])
  model.bind('new-epoch:new-session')
  expect(model.metadata.value).toBeNull()
  expect(model.uploadId.value).toBeNull()
})

it('does not repeat download preparation after a lost receipt and uses fixed direct download links', async () => {
  const { model, gateway } = fixture()
  gateway.beginDownload.mockRejectedValueOnce(new Error('lost receipt'))
  await model.prepareDownload('original-export-request')
  await model.prepareDownload('different-export-request')
  await model.inspectDownload()
  expect(gateway.beginDownload).toHaveBeenCalledTimes(1)
  expect(gateway.beginDownload).toHaveBeenCalledWith(
    'transfer',
    'original-export-request',
    expect.any(AbortSignal),
  )
  expect(model.downloadPhase.value).toBe('ready')
  expect(packageDownloadHref('transfer', 1)).toBe('/api/v1/package-downloads/transfer/files/1')
  expect(packageDownloadHref('../other', 0)).toBeUndefined()
  expect(packageDownloadHref('transfer', -1)).toBeUndefined()
})

it('accepts a complete unordered volume group and rejects paths, duplicates and missing volumes', () => {
  const file = (name: string) => new File([], name)
  expect(uploadFiles([file('vm.vmpkg.002'), file('vm.vmpkg'), file('vm.vmpkg.001')])).toHaveLength(
    3,
  )
  expect(uploadFiles([file('vm.vmpkg'), file('vm.vmpkg.002')])).toBeNull()
  expect(uploadFiles([file('vm.vmpkg'), file('vm.vmpkg')])).toBeNull()
  expect(uploadFiles([file('../vm.vmpkg')])).toBeNull()
  expect(uploadFiles([file('foreign.zip')])).toBeNull()
})
