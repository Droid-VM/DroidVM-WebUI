import { afterEach, expect, it, vi } from 'vitest'
import { createHostOverview } from '../../src/modules/host/model/overview'
import {
  createHostOverviewGateway,
  type HostOverview,
  type HostOverviewGateway,
} from '../../src/modules/host/api/overview'
import { ApiError } from '../../src/shared/api/errors'
import type { ReadClient } from '../../src/shared/api/readClient'

const context = { daemonEpoch: 'host-epoch', sessionId: 'a'.repeat(64) }
const snapshot = (): HostOverview => ({
  context,
  observedAtMs: String(Date.now()),
  host: { kernelRelease: '6.1', machine: 'aarch64', deviceModel: null, socModel: null },
  daemon: { pid: 42, version: '1.0' },
  cpu: { logicalCount: 8, usagePercent: null, sampleWindowMs: null },
  memory: { totalBytes: '18446744073709551615', availableBytes: null },
  storage: { totalBytes: '1000000', freeBytes: '400000', availableBytes: '300000' },
  inventory: {
    vmCount: 2,
    runningVmCount: 1,
    networkCount: 1,
    runningNetworkCount: 1,
    diskCount: 3,
    diskVirtualBytes: null,
  },
})
function setup() {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  const gateway: HostOverviewGateway = {
    supported: () => true,
    read: vi.fn(async () => snapshot()),
  }
  return { model: createHostOverview(gateway), gateway }
}
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('shares one poll across visible consumers and stops after the last consumer leaves', async () => {
  const { model, gateway } = setup()
  const first = model.acquire(),
    second = model.acquire()
  await model.refresh()
  expect(gateway.read).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(3000)
  expect(gateway.read).toHaveBeenCalledTimes(2)
  first()
  await vi.advanceTimersByTimeAsync(3000)
  expect(gateway.read).toHaveBeenCalledTimes(3)
  second()
  await vi.advanceTimersByTimeAsync(9000)
  expect(gateway.read).toHaveBeenCalledTimes(3)
  model.dispose()
})
it('retains a failed observation as stale, backs off automatic reads, and permits explicit recovery', async () => {
  const { model, gateway } = setup()
  const release = model.acquire()
  await model.refresh()
  const previous = model.data.value
  vi.mocked(gateway.read).mockRejectedValueOnce(new ApiError('offline', 'offline'))
  await vi.advanceTimersByTimeAsync(3000)
  expect(model.data.value).toEqual(previous)
  expect(model.stale.value).toBe(true)
  await vi.advanceTimersByTimeAsync(12_000)
  expect(gateway.read).toHaveBeenCalledTimes(2)
  await model.refresh()
  expect(model.problem.value).toBe(null)
  expect(model.stale.value).toBe(false)
  const frozen = snapshot()
  vi.mocked(gateway.read).mockResolvedValue(frozen)
  await vi.advanceTimersByTimeAsync(12_000)
  expect(model.stale.value).toBe(true)
  release()
  model.dispose()
})
it('aborts hidden reads and never publishes responses from a retired host identity', async () => {
  const events = new EventTarget(),
    page = {
      visibilityState: 'visible',
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    }
  vi.stubGlobal('document', page)
  const { model, gateway } = setup()
  let finish!: (value: HostOverview) => void
  vi.mocked(gateway.read).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const release = model.acquire()
  const signal = vi.mocked(gateway.read).mock.calls[0]![0]
  page.visibilityState = 'hidden'
  events.dispatchEvent(new Event('visibilitychange'))
  expect(signal.aborted).toBe(true)
  model.bind('another-session')
  finish(snapshot())
  await Promise.resolve()
  expect(model.data.value).toBe(null)
  await vi.advanceTimersByTimeAsync(6000)
  expect(gateway.read).toHaveBeenCalledTimes(1)
  page.visibilityState = 'visible'
  events.dispatchEvent(new Event('visibilitychange'))
  await model.refresh()
  expect(gateway.read).toHaveBeenCalledTimes(2)
  expect(model.data.value?.cpu.usagePercent).toBe(null)
  release()
  model.dispose()
})
it('preserves unknown and exact quantities while rejecting mismatched identity and impossible storage', async () => {
  const read = vi.fn(async () => snapshot())
  const gateway = createHostOverviewGateway({ getJson: read } as ReadClient, () => ({
    context,
    administrator: true,
    capabilities: ['host.overview.v1'],
  }))
  const signal = new AbortController().signal
  expect((await gateway.read(signal)).memory).toEqual({
    totalBytes: '18446744073709551615',
    availableBytes: null,
  })
  read.mockResolvedValueOnce({ ...snapshot(), context: { ...context, daemonEpoch: 'changed' } })
  await expect(gateway.read(signal)).rejects.toMatchObject({ code: 'context-changed' })
  read.mockResolvedValueOnce({
    ...snapshot(),
    storage: { totalBytes: '1', freeBytes: '2', availableBytes: '0' },
  })
  await expect(gateway.read(signal)).rejects.toMatchObject({ code: 'invalid-response' })
})
