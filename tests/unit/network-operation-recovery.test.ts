import { expect, it, vi } from 'vitest'
import {
  createNetworkRuntimeGateway,
  validTrackedNetworkOperation,
  type NetworkDetail,
  type NetworkOperation,
  type NetworkRuntimeGateway,
} from '../../src/modules/networks/api/runtime'
import { createNetworkRuntime } from '../../src/modules/networks/model/runtime'
import type { Task } from '../../src/modules/tasks'
import type { HttpClient } from '../../src/shared/api/httpClient'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const identity = `${context.daemonEpoch}:${context.sessionId}`
const journalKey = 'droidvm.operations.v1:network-runtime'
const request: NetworkOperation = {
  requestId: 'network-request',
  networkId: 'network',
  action: 'start',
  expected: { state: 'STOPPED', generation: '9007199254740993', configurationRevision: 'config' },
}
const task: Task = {
  id: 'network-task',
  requestId: request.requestId,
  kind: 'network_lifecycle',
  resource: 'networks',
  state: 'succeeded',
  revision: '1',
  cancellable: false,
  phase: '',
  unit: '',
  completed: '0',
  total: null,
  createdMs: '1',
  finishedMs: '2',
  resultAvailable: false,
  errorCode: null,
}
function detail(id = 'network'): NetworkDetail {
  return {
    context,
    network: {
      id,
      name: id,
      bridgeName: 'br0',
      bridgeType: 'linux',
      uplinkMode: 'l3',
      autoUp: false,
      stp: false,
    },
    runtime: { state: 'STOPPED', generation: request.expected.generation, desiredRunning: false },
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
  }
}
function memory(): Storage {
  const rows = new Map<string, string>()
  return {
    get length() {
      return rows.size
    },
    key: (i) => [...rows.keys()][i] ?? null,
    clear: () => rows.clear(),
    getItem: (key) => rows.get(key) ?? null,
    setItem: vi.fn((key, value) => {
      rows.set(key, value)
    }),
    removeItem: (key) => {
      rows.delete(key)
    },
  }
}
function fixture(storage = memory()) {
  const client = { getJson: vi.fn(), postJson: vi.fn(), delete: vi.fn() } as unknown as HttpClient
  const http = createNetworkRuntimeGateway(client, () => ({
    context,
    csrfToken: 'b'.repeat(64),
    administrator: true,
    manageTasks: true,
    capabilities: ['networks.inspect.v1', 'networks.lifecycle.v1'],
  }))
  const gateway: NetworkRuntimeGateway = {
    ...http,
    tracking: { ...http.tracking!, storage },
    read: vi.fn(async (id) => detail(id)),
    submit: vi.fn(async () => {
      throw new Error('Response lost')
    }),
    find: vi.fn(async () => task),
  }
  const model = createNetworkRuntime(gateway, () => request.requestId)
  return { storage, client, http, gateway, model }
}
function seed(storage: Storage, requests = [request]) {
  storage.setItem(
    journalKey,
    JSON.stringify({
      version: 1,
      identity,
      records: requests.map((request) => ({ key: request.networkId, request })),
    }),
  )
}

it('persists a lost network receipt and only queries after reload without an open detail dialog', async () => {
  const first = fixture()
  first.model.bind(identity)
  await first.model.open('network')
  first.model.prepare('start')
  await first.model.submit()
  expect(first.gateway.submit).toHaveBeenCalledTimes(1)
  first.model.dispose()
  const restored = fixture(first.storage)
  restored.model.bind(identity)
  expect(restored.model.id.value).toBeNull()
  expect(restored.model.pending.value[0]).toMatchObject({
    request,
    state: 'unknown',
    restored: true,
  })
  vi.mocked(restored.gateway.read).mockRejectedValueOnce(new Error('Business read unavailable'))
  await restored.model.reconcile()
  expect(restored.gateway.find).toHaveBeenCalledWith(request, expect.any(AbortSignal))
  expect(restored.gateway.read).toHaveBeenCalledWith('network', expect.any(AbortSignal))
  expect(restored.model.pending.value).toHaveLength(1)
  expect(restored.model.pending.value[0]?.state).toBe('waiting')
  await restored.model.reconcile()
  expect(restored.model.pending.value).toHaveLength(0)
  expect(restored.gateway.submit).not.toHaveBeenCalled()
  await restored.model.open('network')
  expect(restored.model.allowed('start')).toBe(true)
  restored.model.dispose()
})

it('verifies the tracked network instead of another open detail and isolates late session responses', async () => {
  const f = fixture()
  seed(f.storage)
  f.model.bind(identity)
  await f.model.open('other-network')
  vi.mocked(f.gateway.read).mockImplementation(async (id) => {
    if (id === 'network') throw new Error('Original network unavailable')
    return detail(id)
  })
  await f.model.reconcile()
  expect(f.model.pending.value).toHaveLength(1)
  expect(f.model.entry.value).toBeNull()
  let resolve!: (value: NetworkDetail) => void
  vi.mocked(f.gateway.read).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const pending = f.model.reconcile()
  await Promise.resolve()
  f.model.bind('different-session')
  resolve(detail())
  await pending
  expect(f.model.pending.value).toHaveLength(0)
  expect(f.model.detail.value).toBeNull()
  expect(f.gateway.submit).not.toHaveBeenCalled()
  expect(f.storage.getItem(journalKey)).toContain(identity)
  f.model.reset()
  expect(f.storage.getItem(journalKey)).toBeNull()
})

it('blocks new writes for corrupt or unwritable storage while retaining a queryable pending network', async () => {
  const corrupt = fixture()
  corrupt.storage.setItem(journalKey, '{invalid')
  corrupt.model.bind(identity)
  await corrupt.model.open('network')
  expect(corrupt.model.recoveryProblem.value).toBe('invalid')
  expect(corrupt.model.allowed('start')).toBe(false)
  corrupt.model.prepare('start')
  await corrupt.model.submit()
  expect(corrupt.gateway.submit).not.toHaveBeenCalled()
  corrupt.model.clearTracking()
  expect(corrupt.model.allowed('start')).toBe(true)
  vi.mocked(corrupt.storage.setItem).mockImplementation(() => {
    throw new Error('Storage denied')
  })
  corrupt.model.prepare('start')
  await corrupt.model.submit()
  expect(corrupt.model.recoveryProblem.value).toBe('unavailable')
  expect(corrupt.gateway.submit).not.toHaveBeenCalled()
  corrupt.model.dispose()
  const known = fixture()
  seed(known.storage)
  known.model.bind(identity)
  known.model.close()
  await known.model.reconcile()
  expect(known.gateway.find).toHaveBeenCalledTimes(1)
  expect(known.model.pending.value).toHaveLength(0)
  known.model.dispose()
})

it('strictly validates persisted network commands and refuses malformed HTTP calls before transport', async () => {
  expect(validTrackedNetworkOperation(request)).toBe(true)
  for (const value of [
    { ...request, context },
    { ...request, csrfToken: 'secret' },
    { ...request, action: 'delete' },
    { ...request, expected: { ...request.expected, password: 'secret' } },
    { ...request, expected: { ...request.expected, generation: '18446744073709551616' } },
    { ...request, requestId: '../other' },
    [],
    null,
  ])
    expect(validTrackedNetworkOperation(value)).toBe(false)
  const f = fixture()
  await expect(
    f.http.submit(
      { ...request, action: 'delete' } as unknown as NetworkOperation,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'conflict' })
  await expect(
    f.http.find({ ...request, requestId: '../other' }, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'conflict' })
  expect(f.client.postJson).not.toHaveBeenCalled()
  expect(f.client.getJson).not.toHaveBeenCalled()
  expect(f.http.tracking?.namespace).toBe('network-runtime')
  expect(f.http.tracking?.key(request)).toBe('network')
})
