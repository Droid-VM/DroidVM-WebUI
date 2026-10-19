import { expect, it, vi } from 'vitest'
import {
  backupMaximumBytes,
  createConfigurationBackup,
  configurationBackupDownloadHref,
} from '../../src/modules/backups/model/backup'
import type {
  ConfigurationBackupGateway,
  ConfigurationBackupPreview,
} from '../../src/modules/backups/api/http'
import type { Task } from '../../src/modules/tasks'

const preview: ConfigurationBackupPreview = {
  context: { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) },
  previewToken: 'preview-token',
  revisions: { vms: 'vm-revision', disks: 'disk-revision', networks: 'network-revision' },
  categories: {
    vms: { present: true, count: 2, added: 1, replaced: 1 },
    disks: { present: false, count: 0, added: 0, replaced: 0 },
    networks: { present: true, count: 0, added: 0, replaced: 0 },
  },
}
const done: Task = {
  id: 'backup-task',
  requestId: 'backup-request',
  kind: 'configuration_backup',
  resource: 'configuration',
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
  configurationBackup: { completed: ['networks', 'vms'], recoveryRequired: false },
}
function fixture() {
  const gateway = {
    supported: () => true,
    stage: vi.fn(async () => 'upload-id'),
    preview: vi.fn(async () => structuredClone(preview)),
    abort: vi.fn(async () => {}),
    submit: vi.fn(async (): Promise<Task> => structuredClone(done)),
    find: vi.fn(async (): Promise<Task | null> => structuredClone(done)),
  } satisfies ConfigurationBackupGateway
  const refresh = vi.fn(async () => true)
  const model = createConfigurationBackup(gateway, refresh, () => 'backup-request')
  return { model, gateway, refresh }
}
async function prepare(model: ReturnType<typeof createConfigurationBackup>) {
  await model.select(new File(['{"version":1,"vms":[]}'], 'backup.json'))
  await model.prepare()
  model.acknowledged.value = true
}

it('preserves exact UTF-8 JSON numbers and BOM through staging without a JSON round trip', async () => {
  const { model, gateway } = fixture()
  const raw = '\ufeff{"version":1,"vms":[{"id":"vm","value":18446744073709551615}]}'
  await model.select(new File([raw], 'backup.json'))
  await model.prepare()
  expect(gateway.stage).toHaveBeenCalledWith(raw, expect.any(AbortSignal))
  expect(model.preview.value?.categories.disks.present).toBe(false)
  expect(model.preview.value?.categories.networks.count).toBe(0)
  expect(configurationBackupDownloadHref).toBe('/api/v1/configuration-backup/file')
})

it('rejects oversized files before reading and does not replace invalid UTF-8 silently', async () => {
  const { model, gateway } = fixture()
  const large = new File([], 'large.json')
  Object.defineProperty(large, 'size', { value: backupMaximumBytes + 1 })
  const read = vi.spyOn(large, 'arrayBuffer')
  await model.select(large)
  expect(read).not.toHaveBeenCalled()
  expect(model.canPreview.value).toBe(false)
  await model.select(new File([new Uint8Array([255])], 'invalid.json'))
  expect(model.hasFile.value).toBe(false)
  expect(gateway.stage).not.toHaveBeenCalled()
})

it('invalidates confirmation when a file or preview changes and never commits before renewed confirmation', async () => {
  const { model, gateway } = fixture()
  await prepare(model)
  await model.prepare()
  expect(model.acknowledged.value).toBe(false)
  expect(gateway.abort).toHaveBeenCalledWith('upload-id', expect.any(AbortSignal))
  await model.commit()
  expect(gateway.submit).not.toHaveBeenCalled()
  model.acknowledged.value = true
  await model.select(new File(['{}'], 'different.json'))
  expect(model.preview.value).toBeNull()
  expect(model.canCommit.value).toBe(false)
  await model.commit()
  expect(gateway.submit).not.toHaveBeenCalled()
})

it('queries unknown commits using the same request and never automatically resubmits or aborts its upload', async () => {
  const { model, gateway } = fixture()
  await prepare(model)
  gateway.submit.mockRejectedValueOnce(new Error('receipt lost'))
  gateway.find.mockResolvedValueOnce(null)
  await model.commit()
  await model.reconcile()
  expect(model.entry.value?.state).toBe('unknown')
  await model.commit()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.abort).not.toHaveBeenCalled()
  expect(gateway.find).toHaveBeenCalledWith(
    { requestId: 'backup-request', uploadId: 'upload-id', previewToken: 'preview-token' },
    expect.any(AbortSignal),
  )
  await model.reconcile()
  expect(model.entry.value?.state).toBe('done')
})

it('blocks a new workflow after partial or uncertain completion until the user explicitly reviews recovery', async () => {
  const { model, gateway } = fixture()
  await prepare(model)
  gateway.submit.mockResolvedValue({
    ...done,
    state: 'failed',
    configurationBackup: {
      completed: ['networks'],
      failedStage: 'vm_disks',
      uncertainStage: 'vm_disks',
      recoveryRequired: true,
    },
  })
  await model.commit()
  expect(model.result.value?.completed).toEqual(['networks'])
  expect(model.recoveryRequired.value).toBe(true)
  model.restartAfterReview()
  expect(model.recoveryRequired.value).toBe(true)
  model.recoveryAcknowledged.value = true
  model.restartAfterReview()
  expect(model.recoveryRequired.value).toBe(false)
  expect(model.hasFile.value).toBe(false)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
})

it('clears the raw file and confirmation when the browser identity changes', async () => {
  const { model } = fixture()
  await prepare(model)
  model.bind('new-epoch:new-session')
  expect(model.hasFile.value).toBe(false)
  expect(model.preview.value).toBeNull()
  expect(model.acknowledged.value).toBe(false)
  expect(model.name.value).toBe('')
})

it.each(['INTERNAL', 'COMMIT_UNCERTAIN', 'UNKNOWN'])(
  'requires review for terminal %s without a usable result receipt',
  async (errorCode) => {
    const { model, gateway } = fixture()
    await prepare(model)
    const failed = { ...done, state: 'failed' as const, errorCode }
    delete failed.configurationBackup
    gateway.submit.mockResolvedValue(failed)
    await model.commit()
    expect(model.recoveryRequired.value).toBe(true)
    expect(model.canPreview.value).toBe(false)
  },
)
