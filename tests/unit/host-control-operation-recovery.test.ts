import { expect, it, vi } from 'vitest'
import { createUsbAcm } from '../../src/modules/usbAcm/model/settings'
import {
  createUsbAcmGateway,
  validTrackedUsbAcmRequest,
  type UsbAcmObservation,
  type UsbAcmRequest,
} from '../../src/modules/usbAcm/api/http'
import { createHugepageProcesses } from '../../src/modules/hugepage-processes/model/processes'
import {
  createHugepageProcessGateway,
  validTrackedProcessRequest,
  type ProcessEntry,
  type ProcessObservation,
  type ProcessRequest,
} from '../../src/modules/hugepage-processes/api/http'
import type { Task } from '../../src/modules/tasks'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const identity = `${context.daemonEpoch}:${context.sessionId}`
function memory(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    key: (index) => [...values.keys()][index] ?? null,
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}
const access = () => ({
  context,
  administrator: true,
  manageTasks: true,
  csrfToken: 'b'.repeat(64),
  capabilities: ['host.usb-acm.v1', 'host.hugepages.processes.v1'],
})
const client = () => ({ getJson: vi.fn(), postJson: vi.fn(), delete: vi.fn() })
function task(kind: Task['kind'], resource: string): Task {
  return {
    id: 'task',
    requestId: 'original',
    kind,
    resource,
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
}
function usbSnapshot(): UsbAcmObservation {
  return {
    context,
    capability: 'usb-acm-v1',
    expected: { revision: 'initial' },
    desired: { enabled: false, ports: 1 },
    initialized: true,
    persistenceUncertain: false,
    live: { available: true, applied: true, udcBound: true, ports: 0, owners: [], reason: null },
  }
}
function processRow(): ProcessEntry {
  return {
    pid: 302,
    name: 'guest-process',
    source: 'ko',
    pages: null,
    bytes: null,
    state: 'D',
    alive: true,
    identityStatus: 'verified',
    attributionVerified: false,
    startTicks: '9007199254740993',
    vm: null,
    expected: { pid: 302, startTicks: '9007199254740993', source: 'scan', membership: 'member-1' },
    canSignal: true,
    canStack: true,
    reason: 'legacy-owner',
  }
}
function processSnapshot(): ProcessObservation {
  return {
    context,
    requestedSource: 'auto',
    source: 'ko',
    available: true,
    partial: true,
    coverage: 'module-owners',
    fallbackReason: null,
    observedAtMs: '100',
    pageBytes: '2097152',
    totals: { pages: null, bytes: null, knownPages: '0', knownBytes: '0' },
    entries: [processRow()],
    issues: ['legacy-owner'],
  }
}

it('restores only the original USB ACM save and requires another explicit review to apply a saved but unapplied result', async () => {
  const storage = memory(),
    http = client(),
    source = createUsbAcmGateway(http, access)
  const gateway = { ...source, tracking: { ...source.tracking!, storage } }
  http.getJson.mockResolvedValue(usbSnapshot())
  http.postJson.mockRejectedValue(new Error('receipt lost'))
  const first = createUsbAcm(gateway, () => 'original')
  first.bind(identity)
  await first.refresh()
  first.draft.enabled = true
  first.prepare('configure')
  first.confirmDisconnect.value = true
  await first.submit()
  const stored = storage.getItem('droidvm.operations.v1:usb-acm')
  first.dispose()
  expect(storage.getItem('droidvm.operations.v1:usb-acm')).toBe(stored)
  const restored = createUsbAcm(gateway)
  restored.bind(identity)
  expect(restored.entry.value).toMatchObject({ state: 'unknown', restored: true })
  const saved = {
    ...usbSnapshot(),
    expected: { revision: 'saved' },
    desired: { enabled: true, ports: 1 },
    live: { ...usbSnapshot().live, applied: false },
  }
  const result: Task = {
    ...task('usb_acm', 'usb-acm'),
    state: 'failed',
    errorCode: 'UNAVAILABLE',
    usbAcmResult: {
      expected: { revision: 'initial' },
      desired: saved.desired,
      saved: true,
      applied: false,
      uncertain: false,
      revision: 'saved',
      live: saved.live,
    },
  }
  http.getJson.mockImplementation(async (path: string) =>
    path.includes('/usb-acm-operations/') ? { context, task: result } : saved,
  )
  await restored.reconcile()
  expect(restored.receipt.value).toMatchObject({ saved: true, applied: false })
  expect(restored.canApply.value).toBe(true)
  expect(restored.review.value).toBeNull()
  expect(restored.confirmDisconnect.value).toBe(false)
  await restored.submit()
  expect(http.postJson).toHaveBeenCalledTimes(1)
  expect(http.getJson).toHaveBeenCalledWith(
    '/api/v1/usb-acm-operations/original',
    expect.any(AbortSignal),
  )
  restored.dispose()
  const uncertain = createUsbAcm(gateway)
  uncertain.bind(identity)
  result.usbAcmResult!.uncertain = true
  await uncertain.reconcile()
  uncertain.clearTracking()
  expect(uncertain.entry.value).not.toBeNull()
  expect(uncertain.editable.value).toBe(false)
  uncertain.reset()
  expect(storage.getItem('droidvm.operations.v1:usb-acm')).toBeNull()
  uncertain.dispose()
})

it('recovers a signal using its original process birth and membership, rejects a reused PID receipt and never replays TERM or escalates to KILL', async () => {
  const storage = memory(),
    http = client(),
    source = createHugepageProcessGateway(http, access)
  const gateway = { ...source, tracking: { ...source.tracking!, storage } }
  http.getJson.mockResolvedValue(processSnapshot())
  http.postJson.mockRejectedValue(new Error('receipt lost'))
  const first = createHugepageProcesses(gateway, () => 'original')
  first.bind(identity)
  await first.refresh()
  first.prepare(processRow(), 'term')
  first.confirmSignal.value = true
  await first.submit()
  const request: ProcessRequest = {
    requestId: 'original',
    expected: processRow().expected!,
    signal: 'term',
  }
  first.dispose()
  const stored = storage.getItem('droidvm.operations.v1:hugepage-processes')!
  expect(stored).not.toContain('guest-process')
  expect(stored).not.toContain('entries')
  const restored = createHugepageProcesses(gateway)
  restored.bind(identity)
  expect(restored.entry.value?.request).toEqual(request)
  expect(restored.stack.value).toBeNull()
  expect(restored.review.value).toBeNull()
  const result: Task = {
    ...task('hugepage_process_signal', 'hugepage-processes'),
    hugepageProcessResult: {
      expected: { ...request.expected, startTicks: '9007199254740994' },
      signal: 'term',
      sent: true,
      uncertain: false,
      exited: false,
    },
  }
  const current = processSnapshot()
  current.entries[0] = {
    ...processRow(),
    startTicks: '9007199254740994',
    expected: { ...request.expected, startTicks: '9007199254740994' },
  }
  http.getJson.mockImplementation(async (path: string) =>
    path.includes('/hugepage-process-operations/') ? { context, task: result } : current,
  )
  await restored.reconcile()
  expect(restored.entry.value?.state).toBe('unknown')
  expect(restored.entry.value?.problem?.code).toBe('invalid-response')
  expect(restored.editable.value).toBe(false)
  result.hugepageProcessResult!.expected = request.expected
  await restored.reconcile()
  expect(restored.receipt.value).toMatchObject({ sent: true, exited: false })
  expect(restored.canSignal(processRow())).toBe(false)
  restored.prepare(processRow(), 'kill')
  restored.confirmSignal.value = true
  await restored.submit()
  expect(http.postJson).toHaveBeenCalledTimes(1)
  expect(http.getJson).toHaveBeenCalledWith(
    '/api/v1/hugepage-process-operations/original',
    expect.any(AbortSignal),
  )
  restored.dispose()
  const uncertain = createHugepageProcesses(gateway)
  uncertain.bind(identity)
  result.hugepageProcessResult!.uncertain = true
  await uncertain.reconcile()
  uncertain.clearTracking()
  expect(uncertain.pending.value).toBe(true)
  expect(uncertain.entry.value).not.toBeNull()
  uncertain.dispose()
})

it('rejects extra saved fields and blocks process maintenance while its local record is corrupt', async () => {
  const usb: UsbAcmRequest = {
    requestId: 'original',
    expected: { revision: 'initial' },
    operation: { kind: 'apply' },
  }
  const process: ProcessRequest = {
    requestId: 'original',
    expected: processRow().expected!,
    signal: 'term',
  }
  expect(validTrackedUsbAcmRequest(usb)).toBe(true)
  expect(validTrackedProcessRequest(process)).toBe(true)
  expect(validTrackedUsbAcmRequest({ ...usb, context })).toBe(false)
  expect(
    validTrackedUsbAcmRequest({ ...usb, operation: { kind: 'apply', password: 'secret' } }),
  ).toBe(false)
  expect(validTrackedProcessRequest({ ...process, csrfToken: 'secret' })).toBe(false)
  expect(
    validTrackedProcessRequest({ ...process, expected: { ...process.expected, stack: 'private' } }),
  ).toBe(false)
  const storage = memory(),
    source = createHugepageProcessGateway(client(), access)
  storage.setItem('droidvm.operations.v1:hugepage-processes', '{broken')
  const model = createHugepageProcesses({ ...source, tracking: { ...source.tracking!, storage } })
  model.bind(identity)
  expect(model.recoveryProblem.value).toBe('invalid')
  expect(model.pending.value).toBe(true)
  model.clearTracking()
  expect(model.recoveryProblem.value).toBeNull()
  expect(model.pending.value).toBe(false)
  model.dispose()
})
