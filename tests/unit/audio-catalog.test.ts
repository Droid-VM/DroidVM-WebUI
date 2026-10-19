import { expect, it, vi } from 'vitest'
import { createResourceGateway } from '../../src/modules/resources/api/http'
import { createResourceCatalog } from '../../src/modules/resources/model/catalog'

it('validates audio context and identities, clears failed/stale reads and honors capability absence', async () => {
  const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
  const device = { id: 'out:speaker|1', key: 'speaker|1', name: 'Speaker', input: false, kind: 1 }
  const getJson = vi.fn().mockResolvedValue({ context, available: true, items: [device] })
  let capabilities = ['host.audio.v1']
  const gateway = createResourceGateway({ getJson }, () => ({
    context,
    capabilities,
    administrator: true,
  }))
  const audio = createResourceCatalog(gateway).audio
  expect(await audio.refresh()).toBe(true)
  expect(audio.items.value).toEqual([device])
  getJson.mockResolvedValue({
    context: { ...context, sessionId: 'b'.repeat(64) },
    available: true,
    items: [device],
  })
  expect(await audio.refresh()).toBe(false)
  expect(audio.problem.value?.code).toBe('context-changed')
  expect(audio.items.value).toEqual([])
  getJson.mockResolvedValue({ context, available: true, items: [device, device] })
  expect(await audio.refresh()).toBe(false)
  expect(audio.problem.value?.code).toBe('invalid-response')
  getJson.mockResolvedValue({ context, available: false, items: [] })
  expect(await audio.refresh()).toBe(false)
  expect(audio.problem.value?.code).toBe('unavailable')
  let resolve!: (value: unknown) => void
  getJson.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const late = audio.refresh()
  audio.reset()
  resolve({ context, available: true, items: [device] })
  expect(await late).toBe(false)
  expect(audio.items.value).toEqual([])
  capabilities = []
  expect(await audio.refresh()).toBe(false)
  expect(audio.status.value).toBe('idle')
})
