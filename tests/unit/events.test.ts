import { afterEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import { createEventFeed } from '../../src/modules/events/model/feed'
import type {
  EventAccess,
  EventGateway,
  EventNotification,
} from '../../src/modules/events/api/gateway'
import { useVisiblePolling } from '../../src/shared/model/visiblePolling'

const hooks = vi.hoisted(() => ({
  mounted: [] as (() => void)[],
  unmounted: [] as (() => void)[],
  live: undefined as unknown,
}))
vi.mock('vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  inject: () => hooks.live,
  onMounted: (fn: () => void) => hooks.mounted.push(fn),
  onUnmounted: (fn: () => void) => hooks.unmounted.push(fn),
}))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  hooks.mounted = []
  hooks.unmounted = []
  hooks.live = undefined
})
function environment() {
  vi.useFakeTimers()
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  vi.stubGlobal('document', document)
  vi.stubGlobal('window', new EventTarget())
  return document
}
it('reconnects with covered cursor, rejects old callbacks and clears cursor across identities', async () => {
  const document = environment()
  const access = ref<EventAccess>({
    context: { daemonEpoch: 'daemon', sessionId: 'a'.repeat(64) },
    csrfToken: 'b'.repeat(64),
  })
  const callbacks: {
    receive: Parameters<EventGateway['connect']>[2]
    closed: Parameters<EventGateway['connect']>[3]
  }[] = []
  const connect = vi.fn<EventGateway['connect']>((_, _cursor, receive, closed) => {
    callbacks.push({ receive, closed })
    return vi.fn()
  })
  const feed = createEventFeed({ access: () => access.value, connect, reauthenticate: vi.fn() })
  const ready: EventNotification = {
    type: 'ready',
    context: access.value.context,
    cursor: { epoch: 'daemon', sequence: '9007199254740993' },
    resources: [],
  }
  callbacks[0]!.receive(ready)
  expect(feed.revisions.vms).toBe(1)
  callbacks[0]!.closed(false)
  callbacks[0]!.receive({ ...ready, type: 'invalidate', resources: ['vms'] })
  expect(feed.revisions.vms).toBe(1)
  await vi.advanceTimersByTimeAsync(1600)
  expect(connect.mock.calls[1]![1]).toEqual(ready.cursor)
  access.value = {
    ...access.value,
    context: { ...access.value.context, sessionId: 'c'.repeat(64) },
  }
  expect(connect.mock.calls[2]![1]).toBeNull()
  document.visibilityState = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(60_000)
  expect(connect).toHaveBeenCalledTimes(3)
  document.visibilityState = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  expect(connect).toHaveBeenCalledTimes(4)
  feed.dispose()
})
it('retains invalidation during a baseline read and does not bypass failure backoff', async () => {
  environment()
  const live = {
    connected: ref(true),
    revisions: reactive({ vms: 0, tasks: 0, disks: 0, networks: 0 }),
  }
  hooks.live = live
  let finish: (value: boolean) => void = () => undefined
  const work = vi
    .fn<() => Promise<boolean>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValue(false)
  const scope = effectScope()
  scope.run(() => useVisiblePolling(() => true, work, ['vms']))
  hooks.mounted.forEach((fn) => fn())
  live.revisions.vms++
  await nextTick()
  finish(true)
  await vi.advanceTimersByTimeAsync(600)
  expect(work).toHaveBeenCalledTimes(2)
  for (let i = 0; i < 4; i++) {
    live.revisions.vms++
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
  }
  expect(work).toHaveBeenCalledTimes(2)
  hooks.unmounted.forEach((fn) => fn())
  scope.stop()
})
