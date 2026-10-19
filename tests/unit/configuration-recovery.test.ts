import { expect, it, vi } from 'vitest'
import { createCommitTracking } from '../../src/shared/model/commitTracking'
import { createConfigurationEditor } from '../../src/modules/configuration/model/editor'
import type {
  ConfigurationGateway,
  ConfigurationCommitTracking,
} from '../../src/modules/configuration/api/gateway'
import { createNetworkEditor } from '../../src/modules/networks/model/editor'
import type {
  NetworkCommit,
  NetworkConfigurationGateway,
} from '../../src/modules/networks/api/gateway'
import { createConfigurationBackup } from '../../src/modules/backups/model/backup'
import type {
  ConfigurationBackupGateway,
  ConfigurationBackupRequest,
} from '../../src/modules/backups/api/http'
import type { Task } from '../../src/modules/tasks'
import { createOperationJournal } from '../../src/shared/model/operationJournal'
import { createImageTransfers } from '../../src/modules/images/model/transfers'
import {
  validTrackedImageInstall,
  type ImageInstallRequest,
  type ImageTransferGateway,
} from '../../src/modules/images/api/transfers'

function memory(): Storage {
  const rows = new Map<string, string>()
  return {
    get length() {
      return rows.size
    },
    key: (index) => [...rows.keys()][index] ?? null,
    clear: () => rows.clear(),
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => {
      rows.set(key, value)
    },
    removeItem: (key) => {
      rows.delete(key)
    },
  }
}
const version = {
  revision: 'revision',
  persisted: true,
  durabilityUncertain: false,
  recovered: false,
}
const done = { id: 'task', requestId: 'request', revision: '1', state: 'succeeded' } as Task

it('restores the original VM commit without retaining its secret draft or committing again', async () => {
  const storage = memory()
  const gateway: ConfigurationGateway = {
    tracking: {
      ...createCommitTracking<ConfigurationCommitTracking>('vm-configuration', 'vm-configuration', [
        'vmId',
        'action',
      ]),
      storage,
    },
    supported: () => true,
    defaultsSupported: () => false,
    defaults: vi.fn(),
    read: vi.fn(async () => ({
      json: '{"vms":[{"id":"vm","name":"current","password":"private-secret"}]}',
      version,
    })),
    stage: vi.fn(async () => 'upload-secret'),
    abort: vi.fn(),
    commit: vi.fn(async () => {
      throw new Error('lost')
    }),
    status: vi.fn(async () => ({
      task: null as Task | null,
      version: null as typeof version | null,
    })),
  }
  const first = createConfigurationEditor(gateway)
  first.bind('host')
  await first.open('vm')
  first.replace({ ...first.draft.value!, name: 'changed' })
  await first.save()
  const encoded = storage.getItem(storage.key(0)!)!
  expect(encoded).not.toContain('private-secret')
  expect(encoded).not.toContain('upload-secret')
  const originalId = vi.mocked(gateway.commit).mock.calls[0]![1]
  first.reset(true)
  const restored = createConfigurationEditor(gateway)
  restored.bind('host')
  expect(restored.draft.value).toBeNull()
  await restored.open('vm')
  expect(restored.state.value).toBe('unknown')
  await restored.save()
  expect(gateway.commit).toHaveBeenCalledTimes(1)
  expect(gateway.status).toHaveBeenLastCalledWith(originalId, expect.any(AbortSignal))
  vi.mocked(gateway.status).mockResolvedValue({ task: { ...done, requestId: originalId }, version })
  await restored.reconcile()
  expect(restored.state.value).toBe('saved')
  expect(restored.draft.value?.name).toBe('current')
})

it('restores network target and observes a failed commit without recovering a draft or replaying it', async () => {
  const storage = memory()
  const gateway: NetworkConfigurationGateway = {
    tracking: {
      ...createCommitTracking<NetworkCommit>(
        'network-configuration',
        'network-configuration',
        ['networkId'],
        ['uploadId'],
      ),
      storage,
    },
    supported: () => true,
    read: vi.fn(
      async () =>
        '{"networks":[{"schema":2,"id":"network","name":"before","bridge_name":"br0","bridge_type":"linux","uplink_mode":"l3","l3":{"vlans":[]}}]}',
    ),
    stage: vi.fn(async () => 'upload-secret'),
    abort: vi.fn(),
    submit: vi.fn(async () => {
      throw new Error('lost')
    }),
    find: vi.fn(async () => null as Task | null),
  }
  const first = createNetworkEditor(gateway, () => 'request')
  first.bind('host')
  await first.open('network')
  first.update({ key: 'name', label: 'name' }, 'new-name')
  await first.save()
  expect(gateway.submit).toHaveBeenCalledWith(
    expect.objectContaining({ uploadId: 'upload-secret' }),
    expect.any(AbortSignal),
  )
  const encoded = storage.getItem(storage.key(0)!)!
  expect(encoded).not.toContain('upload-secret')
  expect(encoded).not.toContain('new-name')
  first.dispose()
  const restored = createNetworkEditor(gateway)
  restored.bind('host')
  expect(restored.target.value).toBe('network')
  await restored.open('network')
  expect(restored.pending.value).toBe(true)
  vi.mocked(gateway.find).mockResolvedValue({ ...done, state: 'failed', errorCode: 'CONFLICT' })
  await restored.reconcile()
  expect(restored.entry.value?.state).toBe('done')
  expect(restored.blocked.value).toBe(true)
  expect(restored.draft.value).toBeNull()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
})

it('restores a backup receipt without the file, preview token, confirmation, or a second import', async () => {
  const storage = memory()
  const gateway: ConfigurationBackupGateway = {
    tracking: {
      ...createCommitTracking<ConfigurationBackupRequest>(
        'configuration-backup',
        'import',
        [],
        ['uploadId', 'previewToken'],
      ),
      storage,
    },
    supported: () => true,
    stage: vi.fn(async () => 'upload-secret'),
    abort: vi.fn(),
    preview: vi.fn(async () => ({
      context: { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) },
      previewToken: 'preview-secret',
      revisions: { vms: 'v', networks: 'n', disks: 'd' },
      categories: Object.fromEntries(
        ['vms', 'networks', 'disks'].map((key) => [
          key,
          { present: true, count: 0, added: 0, replaced: 0 },
        ]),
      ) as never,
    })),
    submit: vi.fn(async () => {
      throw new Error('lost')
    }),
    find: vi.fn(async () => null as Task | null),
  }
  const first = createConfigurationBackup(
    gateway,
    async () => true,
    () => 'request',
  )
  first.bind('host')
  await first.select(new File(['{"vms":[],"password":"backup-secret"}'], 'backup.json'))
  await first.prepare()
  first.acknowledged.value = true
  await first.commit()
  expect(gateway.submit).toHaveBeenCalledWith(
    expect.objectContaining({ uploadId: 'upload-secret', previewToken: 'preview-secret' }),
    expect.any(AbortSignal),
  )
  const encoded = storage.getItem(storage.key(0)!)!
  for (const secret of ['upload-secret', 'preview-secret', 'backup-secret'])
    expect(encoded).not.toContain(secret)
  first.dispose()
  const restored = createConfigurationBackup(gateway, async () => true)
  restored.bind('host')
  expect(restored.preview.value).toBeNull()
  expect(restored.hasFile.value).toBe(false)
  expect(restored.acknowledged.value).toBe(false)
  await restored.reconcile()
  await restored.commit()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(restored.pending.value).toBe(true)
})

it('keeps image installation receipts across session changes without restoring upload authority', async () => {
  const storage = memory()
  const tracking = {
    namespace: 'image-install',
    durable: true,
    valid: validTrackedImageInstall,
    key: () => 'install',
    storage,
  }
  const request: ImageInstallRequest = {
    requestId: 'image-request',
    uploadId: 'old-upload',
    folder: '/images',
    name: 'disk.img',
  }
  const journal = createOperationJournal(tracking)
  journal.load('host')
  journal.save('host', [{ key: 'install', request }])
  const gateway: ImageTransferGateway = {
    upload: {
      supported: () => true,
      beginUpload: vi.fn(),
      uploadStatus: vi.fn(),
      chunk: vi.fn(),
      finish: vi.fn(),
      remove: vi.fn(),
    },
    install: {
      tracking,
      supported: () => true,
      submit: vi.fn(),
      find: vi.fn(async () => ({
        ...done,
        requestId: request.requestId,
        imageInstall: {
          uploadId: request.uploadId,
          source: '/images/disk.img',
          installed: true,
          durabilityConfirmed: true,
          installationUncertain: false,
          recoveryRequired: false,
        },
      })),
    },
  }
  const model = createImageTransfers(gateway, () => true)
  model.bind('first-session', 'host')
  model.reset(true)
  model.bind('new-session', 'host')
  expect(model.entry.value?.restored).toBe(true)
  expect(model.uploader.uploadId.value).toBeNull()
  expect(model.acknowledged.value).toBe(false)
  await model.reconcile()
  expect(model.succeeded.value).toBe(true)
  expect(model.handoff()).toBe(true)
  expect(gateway.install.submit).not.toHaveBeenCalled()
  expect(gateway.upload.uploadStatus).not.toHaveBeenCalled()
})
