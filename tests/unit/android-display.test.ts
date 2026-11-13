import { expect, it, vi } from 'vitest'
import { createAndroidDisplay } from '../../src/modules/androidDisplay/model/display'
import type {
  AndroidDisplayGateway,
  AndroidDisplayObservation,
  AndroidDisplayRequest,
} from '../../src/modules/androidDisplay/api/http'
import type { Task } from '../../src/modules/tasks'

function snapshot(
  state: AndroidDisplayObservation['state'] = 'android',
  revision = 'r1',
): AndroidDisplayObservation {
  return {
    context: { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) },
    capability: 'android-display-v1',
    supported: true,
    expected: { revision },
    state,
    owner: state === 'android' ? null : { kind: 'manual', vmId: null, vmName: null },
    sinceMs: state === 'android' ? null : '1000',
    autoRestoreAtMs: state === 'android' ? null : '1801000',
    restoreOnNetworkLoss: true,
    progress: '',
    network: { interface: 'wlan0', operstate: 'up' },
    panelLit: true,
    watchdog: { verified: true, reason: null, kick: 'unproven' },
    services: { surfaceflinger: 'running', composer: 'running' },
    lastRestore: null,
  }
}
function fixture() {
  let value = snapshot()
  const gateway = {
    readable: () => true,
    supported: () => true,
    read: vi.fn(async () => value),
    submit: vi.fn(async (request: AndroidDisplayRequest): Promise<Task> => {
      const stop = request.operation.kind === 'stop'
      value = snapshot(stop ? 'stopped' : 'android', stop ? 'r2' : 'r3')
      return {
        id: 'task',
        requestId: request.requestId,
        kind: 'android_display',
        resource: 'android-display',
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
        androidDisplayResult: {
          expected: request.expected,
          kind: request.operation.kind,
          state: value.state,
          stopped: stop,
          restored: !stop,
          uncertain: false,
          revision: value.expected.revision,
          network: value.network,
          message: null,
        },
      }
    }),
    find: vi.fn(async (): Promise<Task | null> => null),
  } satisfies AndroidDisplayGateway
  let sequence = 0
  return {
    gateway,
    model: createAndroidDisplay(gateway, () => `request-${++sequence}`),
    set: (next: AndroidDisplayObservation) => {
      value = next
    },
  }
}

it('stops only after the blank-screen confirmation and sends the chosen restore policy', async () => {
  const { gateway, model } = fixture()
  await model.refresh()
  expect(model.canStop.value).toBe(true)
  expect(model.canRestore.value).toBe(false)
  model.autoRestoreSeconds.value = 600
  model.restoreOnNetworkLoss.value = false
  model.prepare('stop')
  await model.submit()
  expect(gateway.submit).not.toHaveBeenCalled()
  model.confirmBlank.value = true
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledWith(
    {
      requestId: 'request-1',
      expected: { revision: 'r1' },
      operation: {
        kind: 'stop',
        tier: 'display',
        autoRestoreSeconds: 600,
        restoreOnNetworkLoss: false,
      },
    },
    expect.any(AbortSignal),
  )
  expect(model.receipt.value?.stopped).toBe(true)
  expect(model.stopped.value).toBe(true)
  expect(model.canRestore.value).toBe(true)
  model.prepare('restore')
  await model.submit()
  expect(gateway.submit).toHaveBeenLastCalledWith(
    { requestId: 'request-2', expected: { revision: 'r2' }, operation: { kind: 'restore' } },
    expect.any(AbortSignal),
  )
  expect(model.receipt.value?.restored).toBe(true)
  expect(model.status.value?.state).toBe('android')
  model.dispose()
})

it('allows takeover without watchdog feeding while retaining automatic restoration', async () => {
  const { model, gateway, set } = fixture()
  const value = snapshot()
  value.watchdog = { verified: true, reason: null, kick: 'not-required' }
  set(value)
  await model.refresh()
  expect(model.canStop.value).toBe(true)
  model.autoRestoreSeconds.value = 600
  model.prepare('stop')
  model.confirmBlank.value = true
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: expect.objectContaining({ kind: 'stop', autoRestoreSeconds: 600 }),
    }),
    expect.any(AbortSignal),
  )
  expect(model.canRestore.value).toBe(true)
  model.dispose()
})

it('refuses to stop on a dark panel or an unverified watchdog and never restores a VM-owned panel', async () => {
  const { model, set } = fixture()
  const dark = snapshot()
  dark.panelLit = false
  set(dark)
  await model.refresh()
  expect(model.canStop.value).toBe(false)
  const unverified = snapshot()
  unverified.watchdog = { verified: false, reason: 'stale hangdetect status', kick: 'unproven' }
  set(unverified)
  await model.refresh()
  expect(model.canStop.value).toBe(false)
  const owned = snapshot('stopped', 'r9')
  owned.owner = { kind: 'vm', vmId: 'vm-a', vmName: 'Windows' }
  owned.autoRestoreAtMs = null
  set(owned)
  await model.refresh()
  expect(model.vmOwned.value).toBe(true)
  expect(model.canRestore.value).toBe(false)
  model.prepare('restore')
  expect(model.review.value).toBeNull()
  model.dispose()
})

it('drops a review when the revision changes underneath it and keeps an unknown submission for queries only', async () => {
  const { model, gateway, set } = fixture()
  await model.refresh()
  model.prepare('stop')
  model.confirmBlank.value = true
  set(snapshot('android', 'external'))
  await model.refresh()
  expect(model.review.value).toBeNull()
  model.prepare('stop')
  model.confirmBlank.value = true
  gateway.submit.mockRejectedValueOnce(new Error('reply lost'))
  await model.submit()
  await model.reconcile()
  expect(model.pending.value).toBe(true)
  expect(model.canStop.value).toBe(false)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.find).toHaveBeenCalledWith(
    {
      requestId: 'request-1',
      expected: { revision: 'external' },
      operation: {
        kind: 'stop',
        tier: 'display',
        autoRestoreSeconds: 1800,
        restoreOnNetworkLoss: true,
      },
    },
    expect.any(AbortSignal),
  )
  model.dispose()
})
