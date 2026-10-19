import { expect, it, vi } from 'vitest'
import { createNetworkDeletion } from '../../src/modules/networks/model/deletion'
import type {
  NetworkDeletionGateway,
  ConfigurationRecoveryGateway,
} from '../../src/modules/networks/api/deletion'
import type { NetworkConfigurationGateway } from '../../src/modules/networks/api/gateway'
import type { NetworkDetail, NetworkRuntimeGateway } from '../../src/modules/networks/api/runtime'
import type { Task } from '../../src/modules/tasks'

const config =
  '{"networks":[{"schema":2,"id":"old","name":"Original","extension":{"counter":18446744073709551615}}]}'
const detail = (): NetworkDetail => ({
  context: { daemonEpoch: 'epoch', sessionId: 'session' },
  network: {
    id: 'old',
    name: 'Original',
    bridgeName: 'br0',
    bridgeType: 'linux',
    uplinkMode: 'l3',
    autoUp: false,
    stp: false,
  },
  runtime: { state: 'RUNNING', generation: '1', desiredRunning: true },
  configurationRevision: 'networks-before',
  vmRevision: 'vms-before',
  liveState: 'inactive',
  observationComplete: false,
  checkedAtMs: 123,
  attachments: [{ vmId: 'vm', vmName: 'VM', slot: 0, mac: '52:54:00:12:34:56', vlan: 0 }],
  addresses: null,
  interfaces: null,
  pd: null,
  neighbors: null,
  leases: null,
})
function setup() {
  const gateway: NetworkDeletionGateway = {
    supported: () => true,
    stage: vi.fn().mockResolvedValue('upload'),
    abort: vi.fn(),
    submit: vi.fn().mockRejectedValue(new Error('lost receipt')),
    find: vi.fn().mockResolvedValue(null),
  }
  const configuration: NetworkConfigurationGateway = {
    supported: () => true,
    read: vi.fn().mockResolvedValue(config),
    stage: vi.fn(),
    abort: vi.fn(),
    submit: vi.fn(),
    find: vi.fn(),
  }
  const runtime: NetworkRuntimeGateway = {
    supported: () => true,
    inspectSupported: () => true,
    read: vi.fn().mockResolvedValue(detail()),
    submit: vi.fn(),
    find: vi.fn(),
  }
  const recovery: ConfigurationRecoveryGateway = {
    supported: () => true,
    submit: vi
      .fn()
      .mockResolvedValue({ id: 'recovery-task', revision: '1', state: 'succeeded' } as Task),
    find: vi.fn().mockResolvedValue(null),
  }
  const refresh = vi.fn().mockResolvedValue(true)
  const model = createNetworkDeletion(
    gateway,
    configuration,
    runtime,
    recovery,
    refresh,
    () => 'request',
  )
  model.bind('session')
  return { model, gateway, configuration, runtime, recovery, refresh }
}
it('freezes lossless expectations and VM references, preserving an unknown write across closing and recovery', async () => {
  const { model, gateway, configuration, runtime, recovery } = setup()
  await model.open('old')
  vi.mocked(configuration.read).mockResolvedValue('{"networks":[]}')
  const newer = detail()
  newer.vmRevision = 'vms-after'
  newer.attachments = []
  vi.mocked(runtime.read).mockResolvedValue(newer)
  await model.submit()
  expect(vi.mocked(gateway.stage).mock.calls[0]![0]).toContain('18446744073709551615')
  expect(vi.mocked(gateway.stage).mock.calls[0]![1]).toBe('vms-before')
  expect(model.preview.value?.detail.attachments).toHaveLength(1)
  model.close()
  expect(model.pending.value).toBe(true)
  await model.open('another')
  expect(model.target.value).toBe('old')
  await model.reconcile()
  model.openRecovery()
  expect(model.canRecover.value).toBe(true)
  await model.recover()
  expect(recovery.submit).toHaveBeenCalledTimes(1)
  expect(model.observed.value).toBe('absent')
  expect(model.removed.value).toBe(false)
  expect(model.entry.value?.state).toBe('unknown')
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(model.pending.value).toBe(true)
  model.dispose()
})
it('separates successful journal recovery from the failed deletion receipt and only unlocks after fresh reads', async () => {
  const { model, gateway, configuration, recovery, refresh } = setup()
  await model.open('old')
  vi.mocked(gateway.submit).mockResolvedValue({
    id: 'delete-task',
    revision: '1',
    state: 'failed',
    errorCode: 'COMMIT_UNCERTAIN',
  } as Task)
  vi.mocked(configuration.read).mockResolvedValue('{"networks":[]}')
  await model.submit()
  expect(model.uncertain.value).toBe(true)
  expect(model.entry.value?.state).toBe('done')
  vi.mocked(refresh).mockResolvedValue(false)
  model.openRecovery()
  await model.recover()
  expect(model.uncertain.value).toBe(true)
  expect(model.recoveryEntry.value?.state).toBe('waiting')
  vi.mocked(refresh).mockResolvedValue(true)
  vi.mocked(recovery.find).mockResolvedValue({
    id: 'recovery-task',
    revision: '2',
    state: 'succeeded',
  } as Task)
  await model.reconcile()
  expect(model.uncertain.value).toBe(false)
  expect(model.observed.value).toBe('absent')
  expect(model.removed.value).toBe(false)
  expect(model.entry.value?.task?.state).toBe('failed')
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  model.dispose()
})
it('can explicitly recover unreadable global configuration without any network detail', async () => {
  const { model, configuration, runtime, recovery } = setup()
  vi.mocked(configuration.read).mockRejectedValueOnce(new Error('configuration unavailable'))
  expect(await model.open('old')).toBe(false)
  expect(runtime.read).not.toHaveBeenCalled()
  model.openRecovery()
  await model.recover()
  expect(recovery.submit).toHaveBeenCalledTimes(1)
  expect(model.recoveryEntry.value?.state).toBe('done')
  expect(model.removed.value).toBe(false)
  model.reset()
  model.bind('next')
  vi.mocked(runtime.read).mockClear()
  model.openRecovery()
  await model.recover()
  expect(runtime.read).not.toHaveBeenCalled()
  expect(model.recoveryEntry.value?.state).toBe('done')
  model.dispose()
})
it('protects a staged deletion from unload and discards a late upload after a session change', async () => {
  const { model, gateway } = setup()
  let finish!: (value: string) => void
  vi.mocked(gateway.stage).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await model.open('old')
  const saving = model.submit()
  expect(model.pending.value).toBe(true)
  model.bind('new-session')
  finish('late-upload')
  await saving
  expect(gateway.submit).not.toHaveBeenCalled()
  expect(gateway.abort).toHaveBeenCalledWith('late-upload', expect.any(AbortSignal))
  expect(model.preview.value).toBe(null)
  expect(model.entry.value).toBe(null)
  expect(model.visible.value).toBe(false)
  model.dispose()
})
