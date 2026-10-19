import { expect, it, vi } from 'vitest'
import { createHostPreferences } from '../../src/modules/hostPreferences/model/preferences'
import type {
  HostPreferenceGateway,
  HostPreferenceObservation,
  HostPreferenceRequest,
} from '../../src/modules/hostPreferences/api/http'
import type { Task } from '../../src/modules/tasks'
import { ApiError } from '../../src/shared/api/errors'

function snapshot(revision = 'initial'): HostPreferenceObservation {
  return {
    context: { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) },
    capability: 'host-preferences-v1',
    expected: { revision },
    values: {
      vm_hugepage_auto_reserve: true,
      optimize_sdcard: true,
      vm_clear_logs_before_start: false,
    },
    initialized: true,
    uncertain: false,
  }
}
function fixture() {
  let value = snapshot()
  const gateway = {
    readable: () => true,
    supported: () => true,
    read: vi.fn(async () => value),
    submit: vi.fn(async (request: HostPreferenceRequest): Promise<Task> => {
      value = { ...snapshot('saved'), values: { ...value.values, ...request.changes } }
      return {
        id: 'task',
        requestId: request.requestId,
        kind: 'host_preferences',
        resource: 'host-preferences',
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
        hostPreferenceResult: {
          expected: request.expected,
          values: value.values,
          saved: true,
          uncertain: false,
          revision: value.expected.revision,
        },
      }
    }),
    find: vi.fn(async (_request: HostPreferenceRequest): Promise<Task | null> => {
      void _request
      return null
    }),
  } satisfies HostPreferenceGateway
  return {
    gateway,
    model: createHostPreferences(gateway, () => 'request'),
    set: (next: HostPreferenceObservation) => {
      value = next
    },
  }
}

it('preserves edits on CAS conflict, merges untouched fields and requires a new confirmation', async () => {
  const { model, gateway, set } = fixture()
  await model.refresh()
  model.draft.vm_clear_logs_before_start = true
  model.prepare()
  const changed = snapshot('other-client')
  changed.values.optimize_sdcard = false
  set(changed)
  gateway.submit.mockRejectedValueOnce(new ApiError('conflict', 'revision changed'))
  await model.submit()
  expect(model.draft.vm_clear_logs_before_start).toBe(true)
  expect(model.conflict.value).toBe(true)
  expect(model.review.value).toBeNull()
  model.rebase()
  expect(model.draft.optimize_sdcard).toBe(false)
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  model.prepare()
  expect(model.review.value).toEqual({
    expected: { revision: 'other-client' },
    changes: { vm_clear_logs_before_start: true },
  })
  model.dispose()
})

it('keeps an unknown save across navigation and only queries the original request', async () => {
  const { model, gateway } = fixture()
  await model.refresh()
  model.draft.optimize_sdcard = false
  model.prepare()
  gateway.submit.mockRejectedValueOnce(new Error('connection lost'))
  await model.submit()
  model.deactivate()
  await model.refresh()
  model.prepare()
  await model.submit()
  await model.reconcile()
  expect(model.pending.value).toBe(true)
  expect(model.review.value).toBeNull()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.find).toHaveBeenCalledWith(
    {
      requestId: 'request',
      expected: { revision: 'initial' },
      changes: { optimize_sdcard: false },
    },
    expect.any(AbortSignal),
  )
  model.dispose()
})

it('does not erase a new draft when reconciling an already saved operation', async () => {
  const { model } = fixture()
  await model.refresh()
  model.draft.vm_clear_logs_before_start = true
  model.prepare()
  await model.submit()
  expect(model.dirty.value).toBe(false)
  model.draft.optimize_sdcard = false
  await model.reconcile()
  await model.refresh()
  expect(model.draft.optimize_sdcard).toBe(false)
  expect(model.dirty.value).toBe(true)
  model.dispose()
})
