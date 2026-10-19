import { expect, it, vi } from 'vitest'
import {
  createHostPreferenceGateway,
  validTrackedHostPreferenceRequest,
  type HostPreferenceGateway,
  type HostPreferenceObservation,
  type HostPreferenceRequest,
} from '../../src/modules/hostPreferences/api/http'
import { createHostPreferences } from '../../src/modules/hostPreferences/model/preferences'
import {
  createDiskDefaultGateway,
  validTrackedDiskDefaultRequest,
  validTrackedDiskRememberRequest,
  type DiskDefaultGateway,
  type DiskDefaultObservation,
  type DiskDefaultRequest,
} from '../../src/modules/diskDefaults/api/http'
import { createDiskDefaults } from '../../src/modules/diskDefaults/model/defaults'
import type { Task } from '../../src/modules/tasks'
import type { HttpClient } from '../../src/shared/api/httpClient'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const identity = `${context.daemonEpoch}:${context.sessionId}`
const hostRequest: HostPreferenceRequest = {
  requestId: 'host-request',
  expected: { revision: 'initial' },
  changes: { optimize_sdcard: false },
}
const diskRequest: DiskDefaultRequest = {
  requestId: 'disk-request',
  expected: { revision: 'initial' },
  changes: { qemuImgCpus: [2, 3] },
}
const rememberRequest: DiskDefaultRequest = {
  requestId: 'remember-request',
  expected: { revision: 'initial' },
  changes: { optimizeCompression: 'none' },
}
const baseTask: Task = {
  id: 'task',
  requestId: '',
  kind: 'disk_defaults',
  resource: 'disk-defaults',
  revision: '1',
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
function seed(storage: Storage, namespace: string, key: string, request: unknown) {
  storage.setItem(
    `droidvm.operations.v1:${namespace}`,
    JSON.stringify({
      version: 1,
      identity,
      records: [{ key, request }],
    }),
  )
}
const access = () => ({
  context,
  csrfToken: 'b'.repeat(64),
  administrator: true,
  manageTasks: true,
  capabilities: ['host.preferences.v1', 'host.disk-defaults.v1'],
})
function host(storage = memory()) {
  const value: HostPreferenceObservation = {
    context,
    capability: 'host-preferences-v1',
    expected: { revision: 'initial' },
    values: {
      optimize_sdcard: true,
      vm_clear_logs_before_start: false,
      vm_hugepage_auto_reserve: true,
    },
    initialized: true,
    uncertain: false,
  }
  const http = createHostPreferenceGateway({} as HttpClient, access)
  const gateway: HostPreferenceGateway = {
    ...http,
    tracking: { ...http.tracking!, storage },
    read: vi.fn(async () => value),
    submit: vi.fn(async () => {
      throw new Error('Response lost')
    }),
    find: vi.fn(async (request) => ({
      ...baseTask,
      kind: 'host_preferences',
      resource: 'host-preferences',
      requestId: request.requestId,
      hostPreferenceResult: {
        expected: request.expected,
        saved: true,
        uncertain: false,
        revision: 'saved',
        values: { ...value.values, ...request.changes },
      },
    })),
  }
  return { storage, gateway, model: createHostPreferences(gateway, () => hostRequest.requestId) }
}
function disk(storage = memory()) {
  const value: DiskDefaultObservation = {
    context,
    capability: 'disk-defaults-v1',
    expected: { revision: 'initial' },
    values: { optimizeCompression: 'ask', qemuImgCpus: [] },
    initialized: true,
    uncertain: false,
  }
  const http = createDiskDefaultGateway({} as HttpClient, access)
  const gateway: DiskDefaultGateway = {
    ...http,
    tracking: { ...http.tracking!, storage },
    rememberTracking: { ...http.rememberTracking!, storage },
    read: vi.fn(async () => value),
    submit: vi.fn(async () => {
      throw new Error('Response lost')
    }),
    find: vi.fn(async (request) => ({
      ...baseTask,
      requestId: request.requestId,
      diskDefaultResult: {
        expected: request.expected,
        saved: true,
        uncertain: false,
        revision: 'saved',
        values: { ...value.values, ...request.changes },
      },
    })),
  }
  return {
    storage,
    gateway,
    value,
    model: createDiskDefaults(gateway, () => diskRequest.requestId),
  }
}

it('preserves host saves through first bind/disposal and only queries after reload until the observation succeeds', async () => {
  const first = host()
  first.model.bind(identity)
  await first.model.refresh()
  first.model.draft.optimize_sdcard = false
  first.model.prepare()
  await first.model.submit()
  expect(first.gateway.submit).toHaveBeenCalledTimes(1)
  first.model.dispose()
  const restored = host(first.storage)
  restored.model.pause()
  restored.model.bind(identity)
  expect(restored.model.entry.value).toMatchObject({
    request: hostRequest,
    state: 'unknown',
    restored: true,
  })
  vi.mocked(restored.gateway.read).mockRejectedValueOnce(new Error('Business read unavailable'))
  await restored.model.reconcile()
  expect(restored.model.pending.value).toBe(true)
  expect(restored.model.editable.value).toBe(false)
  await restored.model.reconcile()
  expect(restored.model.pending.value).toBe(false)
  expect(restored.gateway.find).toHaveBeenCalledWith(hostRequest, expect.any(AbortSignal))
  expect(restored.gateway.submit).not.toHaveBeenCalled()
  restored.model.bind('another-session')
  expect(restored.model.entry.value).toBeNull()
  expect(first.storage.getItem('droidvm.operations.v1:host-preferences')).toContain(identity)
  restored.model.reset()
  expect(first.storage.getItem('droidvm.operations.v1:host-preferences')).toBeNull()
  restored.model.dispose()
})

it('keeps disk editor and remember journals independent and lets both restored owners query without deadlock or a conversion', async () => {
  const f = disk()
  seed(f.storage, 'disk-defaults', 'disk-defaults', diskRequest)
  seed(f.storage, 'disk-defaults-remember', 'optimize-compression', rememberRequest)
  f.model.bind(identity)
  await f.model.refresh()
  expect(f.model.editable.value).toBe(false)
  expect((await f.model.optimization.read(new AbortController().signal)).canRemember).toBe(false)
  await f.model.optimization.remember(rememberRequest.expected)
  await f.model.reconcileRemember()
  expect(f.model.rememberPending.value).toBe(false)
  expect(f.model.pending.value).toBe(true)
  await f.model.reconcile()
  expect(f.model.pending.value).toBe(false)
  expect(f.gateway.find).toHaveBeenNthCalledWith(1, rememberRequest, expect.any(AbortSignal))
  expect(f.gateway.find).toHaveBeenNthCalledWith(2, diskRequest, expect.any(AbortSignal))
  expect(f.gateway.submit).not.toHaveBeenCalled()
  f.model.dispose()
  const again = disk(f.storage)
  again.model.bind(identity)
  expect(again.model.entry.value?.restored).toBe(true)
  expect(again.model.rememberEntry.value?.restored).toBe(true)
  expect(again.model.optimization.state().state).toBe('unknown')
  again.model.dispose()
})

it('interlocks both disk writers on damaged storage and never clears uncertain observations or receipts', async () => {
  const f = disk()
  f.storage.setItem('droidvm.operations.v1:disk-defaults', '{broken')
  seed(f.storage, 'disk-defaults-remember', 'optimize-compression', rememberRequest)
  f.model.bind(identity)
  await f.model.refresh()
  expect(f.model.recoveryProblem.value).toBe('invalid')
  expect((await f.model.optimization.read(new AbortController().signal)).canRemember).toBe(false)
  await f.model.reconcileRemember()
  expect(f.gateway.find).toHaveBeenCalledTimes(1)
  f.value.uncertain = true
  await f.model.refresh()
  f.model.clearTracking()
  expect(f.model.recoveryProblem.value).toBe('invalid')
  f.value.uncertain = false
  await f.model.refresh()
  f.model.clearTracking()
  expect(f.model.recoveryProblem.value).toBeNull()
  f.model.dispose()

  const uncertain = disk()
  seed(uncertain.storage, 'disk-defaults-remember', 'optimize-compression', rememberRequest)
  uncertain.model.bind(identity)
  vi.mocked(uncertain.gateway.find).mockResolvedValueOnce({
    ...baseTask,
    state: 'failed',
    requestId: rememberRequest.requestId,
    diskDefaultResult: {
      expected: rememberRequest.expected,
      values: null,
      revision: null,
      saved: false,
      uncertain: true,
    },
  })
  await uncertain.model.reconcileRemember()
  uncertain.model.clearRememberTracking()
  expect(uncertain.model.rememberPending.value).toBe(true)
  expect(uncertain.model.editable.value).toBe(false)
  await uncertain.model.optimization.remember(rememberRequest.expected)
  expect(uncertain.gateway.submit).not.toHaveBeenCalled()
  uncertain.model.dispose()

  const unavailable = disk()
  unavailable.model.bind(identity)
  await unavailable.model.refresh()
  vi.mocked(unavailable.storage.setItem).mockImplementation(() => {
    throw new Error('Quota exceeded')
  })
  await unavailable.model.optimization.remember(rememberRequest.expected)
  expect(unavailable.model.rememberRecoveryProblem.value).toBe('unavailable')
  expect(unavailable.model.editable.value).toBe(false)
  expect(unavailable.gateway.submit).not.toHaveBeenCalled()
  unavailable.model.dispose()
})

it('strictly validates preference journals and limits remember recovery to compression-only writes', () => {
  expect(validTrackedHostPreferenceRequest(hostRequest)).toBe(true)
  expect(validTrackedDiskDefaultRequest(diskRequest)).toBe(true)
  expect(validTrackedDiskRememberRequest(rememberRequest)).toBe(true)
  for (const request of [
    { ...hostRequest, context },
    { ...hostRequest, csrfToken: 'secret' },
    { ...hostRequest, changes: { optimize_sdcard: 'false' } },
    { ...hostRequest, expected: { revision: 'initial', token: 'secret' } },
  ])
    expect(validTrackedHostPreferenceRequest(request)).toBe(false)
  for (const changes of [
    { qemuImgCpus: [1024] },
    { qemuImgCpus: [2, 2] },
    { qemuImgCpus: [-1] },
    { optimizeCompression: 'zstd' },
    {},
  ])
    expect(validTrackedDiskDefaultRequest({ ...diskRequest, changes })).toBe(false)
  for (const changes of [
    { optimizeCompression: 'ask' },
    { optimizeCompression: 'none', qemuImgCpus: [] },
    { qemuImgCpus: [] },
  ])
    expect(validTrackedDiskRememberRequest({ ...rememberRequest, changes })).toBe(false)
})
