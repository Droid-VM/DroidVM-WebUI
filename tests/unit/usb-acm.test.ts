import { expect, it, vi } from 'vitest'
import { createUsbAcm } from '../../src/modules/usbAcm/model/settings'
import type {
  UsbAcmGateway,
  UsbAcmObservation,
  UsbAcmRequest,
} from '../../src/modules/usbAcm/api/http'
import type { Task } from '../../src/modules/tasks'

function snapshot(revision = 'initial'): UsbAcmObservation {
  return {
    context: { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) },
    capability: 'usb-acm-v1',
    expected: { revision },
    desired: { enabled: false, ports: 1 },
    initialized: true,
    persistenceUncertain: false,
    live: { available: true, applied: true, udcBound: true, ports: 0, owners: [], reason: null },
  }
}
function fixture() {
  let value = snapshot(),
    applyFails = false,
    uncertain = false
  const gateway = {
    readable: () => true,
    supported: () => true,
    read: vi.fn(async () => value),
    submit: vi.fn(async (request: UsbAcmRequest): Promise<Task> => {
      const operation = request.operation
      value = {
        ...value,
        expected: { revision: operation.kind === 'configure' ? 'saved' : value.expected.revision },
        desired:
          operation.kind === 'configure'
            ? { enabled: operation.enabled, ports: operation.ports }
            : value.desired,
        live: { ...value.live, applied: !applyFails && !uncertain },
        persistenceUncertain: uncertain,
      }
      return {
        id: 'task',
        requestId: request.requestId,
        kind: 'usb_acm',
        resource: 'usb-acm',
        revision: '1',
        state: applyFails || uncertain ? 'failed' : 'succeeded',
        cancellable: false,
        phase: '',
        unit: '',
        completed: '0',
        total: null,
        createdMs: '1',
        finishedMs: '2',
        resultAvailable: true,
        errorCode: applyFails ? 'UNAVAILABLE' : null,
        usbAcmResult: {
          expected: request.expected,
          desired: value.desired,
          saved: !uncertain,
          applied: !applyFails && !uncertain,
          uncertain,
          revision: value.expected.revision,
          live: value.live,
        },
      }
    }),
    find: vi.fn(async (_request: UsbAcmRequest): Promise<Task | null> => {
      void _request
      return null
    }),
  } satisfies UsbAcmGateway
  let sequence = 0
  return {
    gateway,
    model: createUsbAcm(gateway, () => `request-${++sequence}`),
    set: (next: UsbAcmObservation) => {
      value = next
    },
    failApply: () => {
      applyFails = true
    },
    makeUncertain: () => {
      uncertain = true
    },
  }
}

it('requires disconnect confirmation and cancels a reviewed rebind when a VM acquires a port', async () => {
  const { gateway, model, set } = fixture()
  await model.refresh()
  model.draft.enabled = true
  model.draft.ports = 2
  model.prepare('configure')
  await model.submit()
  expect(gateway.submit).not.toHaveBeenCalled()
  model.confirmDisconnect.value = true
  const occupied = snapshot()
  occupied.live.owners = [{ slot: 0, vmId: 'vm-one' }]
  set(occupied)
  await model.refresh()
  expect(model.review.value).toBeNull()
  expect(model.canConfigure.value).toBe(false)
  await model.submit()
  expect(gateway.submit).not.toHaveBeenCalled()
  model.dispose()
})

it('preserves edits on an external revision change and requires a fresh review after explicit rebase', async () => {
  const { model, gateway, set } = fixture()
  await model.refresh()
  model.draft.enabled = true
  model.prepare('configure')
  const changed = snapshot('external')
  changed.desired.ports = 3
  set(changed)
  await model.refresh()
  expect(model.draft.enabled).toBe(true)
  expect(model.review.value).toBeNull()
  expect(model.conflict.value).toBe(true)
  model.rebase()
  expect(model.draft.ports).toBe(3)
  model.confirmDisconnect.value = true
  await model.submit()
  expect(gateway.submit).not.toHaveBeenCalled()
  model.prepare('configure')
  expect(model.confirmDisconnect.value).toBe(false)
  expect(model.review.value).toEqual({
    expected: { revision: 'external' },
    operation: { kind: 'configure', enabled: true, ports: 3 },
  })
  model.dispose()
})

it('keeps an unknown configure across navigation and never follows it with an apply write', async () => {
  const { model, gateway } = fixture()
  await model.refresh()
  model.draft.enabled = true
  model.prepare('configure')
  model.confirmDisconnect.value = true
  gateway.submit.mockRejectedValueOnce(new Error('reply lost'))
  await model.submit()
  model.deactivate()
  await model.refresh()
  model.prepare('apply')
  await model.submit()
  await model.reconcile()
  expect(model.pending.value).toBe(true)
  expect(model.review.value).toBeNull()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.find).toHaveBeenCalledWith(
    {
      requestId: 'request-1',
      expected: { revision: 'initial' },
      operation: { kind: 'configure', enabled: true, ports: 1 },
    },
    expect.any(AbortSignal),
  )
  model.dispose()
})

it('offers explicit apply only after a definite apply failure and blocks operations after uncertain persistence', async () => {
  const { model, gateway, failApply, makeUncertain } = fixture()
  await model.refresh()
  failApply()
  model.draft.enabled = true
  model.prepare('configure')
  model.confirmDisconnect.value = true
  await model.submit()
  expect(model.receipt.value?.saved).toBe(true)
  expect(model.receipt.value?.applied).toBe(false)
  expect(model.dirty.value).toBe(false)
  expect(model.canApply.value).toBe(true)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  model.prepare('apply')
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  makeUncertain()
  model.confirmDisconnect.value = true
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledTimes(2)
  expect(model.pending.value).toBe(true)
  expect(model.canApply.value).toBe(false)
  expect(model.canConfigure.value).toBe(false)
  model.dispose()
})

it('blocks unknown snapshot outcomes without a retained task and cancels a review when uncertainty appears', async () => {
  for (const reason of ['application-outcome-unknown', 'persistence-outcome-unknown']) {
    const { model, gateway, set } = fixture()
    const unknown = snapshot()
    unknown.live.applied = false
    unknown.live.reason = reason
    set(unknown)
    await model.refresh()
    expect(model.entry.value).toBeNull()
    expect(model.unresolved.value).toBe(true)
    expect(model.editable.value).toBe(false)
    expect(model.canApply.value).toBe(false)
    model.draft.enabled = true
    model.prepare('configure')
    model.confirmDisconnect.value = true
    await model.submit()
    expect(gateway.submit).not.toHaveBeenCalled()

    const knownFailure = snapshot()
    knownFailure.live.applied = false
    knownFailure.live.reason = 'application-failed'
    set(knownFailure)
    await model.refresh()
    model.discard()
    expect(model.unresolved.value).toBe(false)
    expect(model.canApply.value).toBe(true)
    model.prepare('apply')
    model.confirmDisconnect.value = true
    set(unknown)
    await model.refresh()
    expect(model.review.value).toBeNull()
    expect(model.confirmDisconnect.value).toBe(false)
    expect(model.unresolved.value).toBe(true)
    await model.submit()
    expect(gateway.submit).not.toHaveBeenCalled()
    model.dispose()
  }
})
