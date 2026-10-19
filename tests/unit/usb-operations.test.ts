import { expect, it, vi } from 'vitest'
import {
  createUsbActionGateway,
  type UsbOperation,
} from '../../src/modules/resources/api/usbOperations'
import { createUsbActions, usbObservation } from '../../src/modules/resources/model/usbOperations'
import type { UsbDevice } from '../../src/modules/resources/api/gateway'
import type { Task } from '../../src/modules/tasks'
import { ApiError } from '../../src/shared/api/errors'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const access = () => ({
  context,
  csrfToken: 'b'.repeat(64),
  administrator: true,
  manageTasks: true,
  capabilities: ['usb.list.v1', 'usb.target.v1'],
})
const device: UsbDevice = {
  id: '1-1#3',
  sysfs: '1-1',
  busNumber: 1,
  deviceNumber: 3,
  vendorId: '1234',
  productId: 'abcd',
  manufacturer: '',
  product: '',
  serial: '',
  speed: '12',
  state: 'claimed',
  locked: false,
  owner: { vmId: 'vm', vmName: '名称不参与条件', controllerId: 'xhci-0', port: 1 },
}
const request: UsbOperation = {
  requestId: 'request-1',
  deviceId: device.id,
  expected: usbObservation(device),
  target: {
    kind: 'vm',
    vmId: 'vm',
    instanceId: 'a'.repeat(32),
    revision: '9007199254740993',
    controllerId: 'xhci-0',
  },
}
const task: Task = {
  id: 'task-1',
  requestId: request.requestId,
  kind: 'usb_target',
  resource: `usb:${device.id}`,
  revision: '1',
  state: 'queued',
  cancellable: true,
  phase: '',
  unit: '',
  completed: '0',
  total: null,
  createdMs: '1',
  finishedMs: null,
  resultAvailable: false,
  errorCode: null,
}
const done: Task = {
  ...task,
  state: 'succeeded',
  revision: '2',
  cancellable: false,
  finishedMs: '2',
}

it('binds USB writes to permissions, CSRF, observations and returned task identity', async () => {
  const client = {
    getJson: vi.fn().mockResolvedValue({ context, task: null }),
    postJson: vi.fn().mockResolvedValue({ context, task }),
    delete: vi.fn(),
  }
  const gateway = createUsbActionGateway(client, access),
    signal = new AbortController().signal
  await gateway.submit(request, signal)
  expect(client.postJson).toHaveBeenCalledExactlyOnceWith(
    '/api/v1/usb-operations',
    { ...request, context },
    signal,
    { csrf: access().csrfToken, status: 202 },
  )
  expect(request.expected.owner).not.toHaveProperty('vmName')
  expect(await gateway.find(request, signal)).toBeNull()
  expect(client.getJson).toHaveBeenCalledExactlyOnceWith('/api/v1/usb-operations/request-1', signal)
  for (const value of [
    null,
    { ...access(), administrator: false },
    { ...access(), manageTasks: false },
    { ...access(), capabilities: ['usb.list.v1'] },
  ]) {
    const denied = createUsbActionGateway(client, () => value)
    expect(denied.supported()).toBe(false)
    await expect(denied.submit(request, signal)).rejects.toBeInstanceOf(ApiError)
  }
  expect(client.postJson).toHaveBeenCalledTimes(1)
  for (const value of [
    { context: { ...context, sessionId: 'c'.repeat(64) }, task },
    { context, task: { ...task, kind: 'vm_start' } },
    { context, task: { ...task, resource: 'usb:other' } },
    { context, task: { ...task, requestId: 'other' } },
  ]) {
    client.getJson.mockResolvedValue(value)
    await expect(gateway.find(request, signal)).rejects.toBeInstanceOf(ApiError)
  }
})

it('rejects invalid enum numbers, uint64 versions and native signature bounds before posting', async () => {
  const client = { getJson: vi.fn(), postJson: vi.fn(), delete: vi.fn() }
  const gateway = createUsbActionGateway(client, access)
  for (const value of [
    { ...request, deviceId: '1-1#4' },
    { ...request, target: { ...request.target, kind: 'vm', revision: '18446744073709551616' } },
    { ...request, target: { ...request.target, kind: 'vm', controllerId: '界'.repeat(128) } },
    {
      ...request,
      expected: {
        ...request.expected,
        owner: { vmId: 'v'.repeat(128), controllerId: '\n'.repeat(128), port: 1 },
      },
      target: {
        kind: 'vm',
        vmId: 'v'.repeat(128),
        instanceId: 'a'.repeat(32),
        revision: '1',
        controllerId: '\n'.repeat(128),
      },
    },
  ])
    await expect(
      gateway.submit(value as UsbOperation, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'conflict' })
  expect(client.postJson).not.toHaveBeenCalled()
})

it('keeps a lost USB receipt locked across navigation and same-session restoration until fresh readback', async () => {
  const submit = vi.fn().mockRejectedValue(new ApiError('offline', 'lost'))
  const find = vi.fn<() => Promise<Task | null>>().mockResolvedValue(null)
  const refresh = vi.fn().mockResolvedValue(true)
  const actions = createUsbActions(
    { supported: () => true, submit, find },
    refresh,
    () => request.requestId,
  )
  actions.bind('epoch:session')
  await actions.submit(device, request.target)
  actions.pause()
  actions.bind('epoch:session')
  await actions.reconcile()
  await actions.submit(device, { kind: 'host' })
  expect(submit).toHaveBeenCalledTimes(1)
  expect(actions.allowed(device)).toBe(false)
  expect(actions.entries.value[device.id]?.state).toBe('unknown')
  find.mockResolvedValue(done)
  refresh.mockResolvedValue(false)
  await actions.reconcile()
  expect(actions.allowed(device)).toBe(false)
  refresh.mockResolvedValue(true)
  await actions.reconcile()
  expect(actions.allowed(device)).toBe(true)
  actions.bind('new:session')
  expect(actions.entries.value).toEqual({})
})
