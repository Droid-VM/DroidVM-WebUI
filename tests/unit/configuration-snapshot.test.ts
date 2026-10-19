import { expect, it, vi } from 'vitest'
import { readConfigurationSnapshot } from '../../src/shared/api/configurationSnapshot'

it('reads a fixed UTF-8 snapshot and releases it, rejecting changed cursors or oversized metadata', async () => {
  const content = new TextEncoder().encode('{"name":"网络"}'),
    release = vi.fn()
  const header = { snapshotId: 'snap', total: 2, cursor: { epoch: 'epoch', sequence: '1' } }
  const pages = [
    { ...header, next: 1, items: [{ type: 'metadata' as const, bytes: content.length }] },
    {
      ...header,
      next: null,
      items: [{ type: 'chunk' as const, offset: 0, data: btoa(String.fromCharCode(...content)) }],
    },
  ]
  const read = vi.fn().mockResolvedValueOnce(pages[0]).mockResolvedValueOnce(pages[1])
  expect((await readConfigurationSnapshot('epoch', 1024, read, release)).json).toBe(
    '{"name":"网络"}',
  )
  expect(release).toHaveBeenCalledWith('snap')
  read
    .mockResolvedValueOnce(pages[0])
    .mockResolvedValueOnce({ ...pages[1], cursor: { epoch: 'epoch', sequence: '2' } })
  await expect(readConfigurationSnapshot('epoch', 1024, read, release)).rejects.toMatchObject({
    code: 'invalid-response',
  })
  read.mockResolvedValueOnce(pages[0])
  await expect(readConfigurationSnapshot('epoch', 1, read, release)).rejects.toMatchObject({
    code: 'invalid-response',
  })
  expect(release).toHaveBeenCalledTimes(3)
})
