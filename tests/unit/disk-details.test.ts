import { expect, it, vi } from 'vitest'
import { createResourceGateway } from '../../src/modules/resources/api/http'
import { createResourceCatalog } from '../../src/modules/resources/model/catalog'
import type { DiskDetail } from '../../src/modules/resources/api/gateway'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const disk = {
  id: 'disk',
  name: 'Disk',
  path: '/disk',
  parentId: null,
  backing: false,
  selectable: true,
}
const detail: DiskDetail = {
  context,
  revision: 'disks',
  vmRevision: 'vms',
  disk,
  chain: [disk],
  chainComplete: true,
  children: [],
  attachments: [],
  readOnlyRequired: false,
  checkedAtMs: 1000,
  inspection: {
    state: 'ready',
    format: 'qcow2',
    virtualBytes: '18446744073709551615',
    allocatedBytes: '0',
    clusterBytes: null,
    encrypted: false,
    dirty: null,
    compression: null,
  },
}
it('checks disk identity, reference consistency, unknown states and exact uint64 sizes', async () => {
  const getJson = vi.fn().mockResolvedValue(detail)
  const gateway = createResourceGateway({ getJson }, () => ({
    context,
    capabilities: ['disks.inspect.v1'],
    administrator: true,
  }))
  const read = () => gateway.diskDetail('disk', new AbortController().signal)
  expect((await read()).inspection.virtualBytes).toBe('18446744073709551615')
  for (const value of [
    { ...detail, disk: { ...disk, id: 'another' } },
    { ...detail, chain: [disk, disk] },
    { ...detail, children: [disk] },
    { ...detail, inspection: { ...detail.inspection, state: 'busy' } },
    { ...detail, inspection: { ...detail.inspection, virtualBytes: '18446744073709551616' } },
  ]) {
    getJson.mockResolvedValue(value)
    await expect(read()).rejects.toMatchObject({ code: 'invalid-response' })
  }
  getJson.mockResolvedValue({ ...detail, context: { ...context, daemonEpoch: 'changed' } })
  await expect(read()).rejects.toMatchObject({ code: 'context-changed' })
})
it('clears stale detail on selection, failure and session reset without accepting late results', async () => {
  let finish!: (value: unknown) => void
  const getJson = vi.fn().mockResolvedValue(detail)
  const source = createResourceCatalog(
    createResourceGateway({ getJson }, () => ({
      context,
      capabilities: ['disks.inspect.v1'],
      administrator: true,
    })),
  )
  expect(await source.diskDetail.open('disk')).toBe(true)
  getJson.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const late = source.diskDetail.refresh()
  source.reset()
  finish(detail)
  expect(await late).toBe(false)
  expect(source.diskDetail.id.value).toBeNull()
  expect(source.diskDetail.data.value).toBeNull()
  getJson.mockRejectedValueOnce(new Error('removed'))
  expect(await source.diskDetail.open('another')).toBe(false)
  expect(source.diskDetail.data.value).toBeNull()
})
