import { expect, it, vi } from 'vitest'
import { createNetworkRuntime } from '../../src/modules/networks/model/runtime'
import { createHostNetwork } from '../../src/modules/networks/model/host'
import type { NetworkDetail, NetworkRuntimeGateway } from '../../src/modules/networks/api/runtime'
import type {
  HostNetworkGateway,
  HostNetworkObservation,
} from '../../src/modules/networks/api/host'
import type { Task } from '../../src/modules/tasks'

const snapshot = (generation = '9007199254740993'): NetworkDetail => ({
  context: { daemonEpoch: 'epoch', sessionId: 'session' },
  network: {
    id: 'network',
    name: 'Network',
    bridgeName: 'br0',
    bridgeType: 'linux',
    uplinkMode: 'l3',
    autoUp: false,
    stp: false,
  },
  runtime: { state: 'STOPPED', generation, desiredRunning: false },
  configurationRevision: 'config',
  vmRevision: 'vms',
  liveState: 'inactive',
  observationComplete: false,
  checkedAtMs: 123,
  attachments: [],
  addresses: null,
  interfaces: null,
  pd: null,
  neighbors: null,
  leases: null,
})
function gateway(): NetworkRuntimeGateway {
  return {
    supported: () => true,
    inspectSupported: () => true,
    read: vi.fn().mockResolvedValue(snapshot()),
    submit: vi.fn().mockRejectedValue(new Error('lost')),
    find: vi.fn().mockResolvedValue(null),
  }
}
it('freezes confirmation, preserves uint64 generation and queries a lost receipt without resubmitting', async () => {
  const source = gateway(),
    model = createNetworkRuntime(source, () => 'request')
  model.bind('session')
  await model.open('network')
  model.prepare('start')
  vi.mocked(source.read).mockResolvedValue(snapshot('9007199254740994'))
  await model.refresh()
  await model.submit()
  expect(vi.mocked(source.submit).mock.calls[0]![0].expected.generation).toBe('9007199254740993')
  await model.reconcile()
  await model.submit()
  expect(source.submit).toHaveBeenCalledTimes(1)
  expect(model.allowed('start')).toBe(false)
  model.close()
  expect(model.pending.value).toHaveLength(1)
  await model.open('network')
  vi.mocked(source.find).mockResolvedValue({
    id: 'task',
    revision: '1',
    state: 'failed',
    errorCode: 'CONFLICT',
  } as Task)
  await model.reconcile()
  expect(model.pending.value).toHaveLength(0)
  expect(model.entry.value?.task?.errorCode).toBe('CONFLICT')
  expect(model.allowed('start')).toBe(true)
  model.dispose()
})
it('does not install a late network observation or retain a confirmation across sessions', async () => {
  const source = gateway(),
    model = createNetworkRuntime(source)
  let finish!: (value: NetworkDetail) => void
  vi.mocked(source.read).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  model.bind('old')
  const pending = model.open('network')
  model.bind('new')
  finish(snapshot())
  await pending
  expect(model.detail.value).toBe(null)
  await model.open('network')
  model.prepare('start')
  model.pause()
  expect(model.confirmation.value).toBe(null)
  model.dispose()
})
it('shares in-flight host discovery and discards late data after reset', async () => {
  let finish!: (value: HostNetworkObservation) => void
  const source: HostNetworkGateway = {
    supported: () => true,
    read: vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
  }
  const model = createHostNetwork(source),
    first = model.ensure(),
    second = model.ensure()
  expect(source.read).toHaveBeenCalledTimes(1)
  model.reset()
  finish({ interfaces: [], addresses: [], uplinks: { identifiers: [], devices: [] } })
  await Promise.all([first, second])
  expect(model.data.value).toBe(null)
  expect(model.loading.value).toBe(false)
})
