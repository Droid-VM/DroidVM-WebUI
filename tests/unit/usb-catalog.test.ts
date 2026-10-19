import { expect, it, vi } from 'vitest'
import { createResourceGateway } from '../../src/modules/resources/api/http'
import { createResourceCatalog } from '../../src/modules/resources/model/catalog'

it('keeps distinct USB insertion identities, validates owner/context, and clears stale reads', async () => {
  const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
  const device = {
    id: '1-1#3',
    sysfs: '1-1',
    busNumber: 1,
    deviceNumber: 3,
    vendorId: '1234',
    productId: 'abcd',
    manufacturer: '',
    product: '',
    serial: 'same',
    speed: '12',
    state: 'claimed',
    locked: false,
    owner: null,
  }
  const getJson = vi.fn().mockResolvedValue({
    context,
    available: true,
    items: [device, { ...device, id: '1-2#4', sysfs: '1-2', deviceNumber: 4 }],
  })
  let administrator = true
  const catalog = createResourceCatalog(
    createResourceGateway({ getJson }, () => ({
      context,
      capabilities: ['usb.list.v1'],
      administrator,
    })),
  )
  expect(await catalog.usb.refresh()).toBe(true)
  expect(catalog.usb.items.value).toHaveLength(2)
  expect(catalog.usb.targets.value).toEqual([])
  const target = {
    vmId: 'vm',
    vmName: 'VM',
    instanceId: 'a'.repeat(32),
    revision: '9007199254740993',
    controllerId: 'xhci-0',
  }
  getJson.mockResolvedValue({ context, available: true, items: [device], targets: [target] })
  expect(await catalog.usb.refresh()).toBe(true)
  expect(catalog.usb.targets.value[0]?.revision).toBe('9007199254740993')
  getJson.mockResolvedValue({
    context,
    available: true,
    items: [device],
    targets: [target, target],
  })
  expect(await catalog.usb.refresh()).toBe(false)
  expect(catalog.usb.targets.value).toEqual([])
  getJson.mockResolvedValue({ context, available: true, items: [device, device] })
  expect(await catalog.usb.refresh()).toBe(false)
  expect(catalog.usb.problem.value?.code).toBe('invalid-response')
  getJson.mockResolvedValue({
    context,
    available: true,
    items: [{ ...device, owner: { vmId: 'vm' } }],
  })
  expect(await catalog.usb.refresh()).toBe(false)
  getJson.mockResolvedValue({
    context: { ...context, daemonEpoch: 'other' },
    available: true,
    items: [device],
  })
  expect(await catalog.usb.refresh()).toBe(false)
  expect(catalog.usb.problem.value?.code).toBe('context-changed')
  getJson.mockResolvedValue({ context, available: false, items: [] })
  expect(await catalog.usb.refresh()).toBe(false)
  expect(catalog.usb.items.value).toEqual([])
  expect(catalog.usb.problem.value?.code).toBe('unavailable')
  let resolve!: (value: unknown) => void
  getJson.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const late = catalog.usb.refresh()
  catalog.reset()
  resolve({ context, available: true, items: [device], targets: [target] })
  expect(await late).toBe(false)
  expect(catalog.usb.items.value).toEqual([])
  expect(catalog.usb.targets.value).toEqual([])
  administrator = false
  getJson.mockClear()
  expect(await catalog.usb.refresh()).toBe(false)
  expect(getJson).not.toHaveBeenCalled()
})
