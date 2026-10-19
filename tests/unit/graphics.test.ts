import { expect, it, vi } from 'vitest'
import { createVmGraphics, type GraphicsConsumer } from '../../src/modules/graphics/model/graphics'
import type {
  DisplayMetadata,
  DisplayObserver,
  VmGraphicsGateway,
} from '../../src/modules/graphics/api/gateway'

const metadata = (): DisplayMetadata => ({
  context: { daemonEpoch: 'daemon', sessionId: 'a'.repeat(64) },
  vmId: 'vm',
  expected: { instanceId: 'c'.repeat(32), revision: '1' },
  screens: [
    { id: 'gpu-0', available: true, reason: '', inputEnabled: true },
    { id: 'simplefb', available: true, reason: '', inputEnabled: true },
  ],
})
function setup() {
  const observers: DisplayObserver[] = []
  const connection = { close: vi.fn() }
  const gateway: VmGraphicsGateway = {
    supported: () => true,
    read: vi.fn(async () => metadata()),
    connect: vi.fn((_value, _screen, observer) => {
      observers.push(observer)
      return connection
    }),
  }
  const consumer: GraphicsConsumer = { start: vi.fn(), stop: vi.fn() }
  return { model: createVmGraphics(gateway), gateway, consumer, observers, connection }
}
it('preserves the initial metadata read when the renderer attaches after page setup', async () => {
  const { model, gateway, consumer } = setup()
  let resolve!: (value: DisplayMetadata) => void
  vi.mocked(gateway.read).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const pending = model.open('vm', 'c'.repeat(32))
  const signal = vi.mocked(gateway.read).mock.calls[0]![1]
  model.attach(consumer)
  expect(signal.aborted).toBe(false)
  resolve(metadata())
  await pending
  expect(model.screen.value).toBe('gpu-0')
  expect(model.status.value).toBe('disconnected')
  model.dispose()
})
it('releases a screen on switch and ignores stale transport and renderer callbacks', async () => {
  const { model, gateway, consumer, observers, connection } = setup()
  model.attach(consumer)
  await model.open('vm')
  await model.connect()
  const socket = { close: vi.fn() } as unknown as WebSocket
  observers[0]!.ready(socket, 'secret')
  const events = vi.mocked(consumer.start).mock.calls[0]![3]
  events.ready()
  expect(model.connected.value).toBe(true)
  model.select('simplefb')
  expect(connection.close).toHaveBeenCalled()
  expect(consumer.stop).toHaveBeenCalled()
  events.ready()
  expect(model.connected.value).toBe(false)
  observers[0]!.ready(socket, 'old-secret')
  expect(socket.close).toHaveBeenCalled()
  expect(gateway.connect).toHaveBeenCalledTimes(1)
  await model.connect()
  expect(vi.mocked(gateway.connect).mock.calls[1]![1]).toBe('simplefb')
  model.dispose()
})
it('refuses a new instance during explicit reconnect and never replays a connection', async () => {
  const { model, gateway, consumer } = setup()
  model.attach(consumer)
  await model.open('vm', 'c'.repeat(32))
  vi.mocked(gateway.read).mockResolvedValueOnce({
    ...metadata(),
    expected: { instanceId: 'd'.repeat(32), revision: '2' },
  })
  await model.connect()
  expect(gateway.connect).not.toHaveBeenCalled()
  expect(model.problem.value?.code).toBe('context-changed')
  model.pause()
  expect(gateway.connect).not.toHaveBeenCalled()
  model.dispose()
})

it('prepares two distinct screens without auto-connecting and keeps their sessions independent', async () => {
  const { model, gateway, consumer, observers } = setup()
  const connections: { close: ReturnType<typeof vi.fn> }[] = []
  vi.mocked(gateway.connect).mockImplementation((_value, _screen, observer) => {
    observers.push(observer)
    const connection = { close: vi.fn() }
    connections.push(connection)
    return connection
  })
  model.attach(consumer)
  await model.open('vm')
  await model.addSecondary()
  const secondary = model.secondary.value!
  const secondConsumer: GraphicsConsumer = { start: vi.fn(), stop: vi.fn() }
  secondary.attach(secondConsumer)
  expect(secondary.screen.value).toBe('simplefb')
  expect(secondary.status.value).toBe('disconnected')
  expect(gateway.connect).not.toHaveBeenCalled()
  await model.addSecondary()
  expect(model.secondary.value).toBe(secondary)
  model.select('simplefb')
  secondary.select('gpu-0')
  expect(model.screen.value).toBe('gpu-0')
  expect(secondary.screen.value).toBe('simplefb')
  await model.connect()
  await secondary.connect()
  const socket = { close: vi.fn() } as unknown as WebSocket
  observers[0]!.ready(socket, '')
  observers[1]!.ready(socket, '')
  const primaryEvents = vi.mocked(consumer.start).mock.calls[0]![3]
  const secondaryEvents = vi.mocked(secondConsumer.start).mock.calls[0]![3]
  primaryEvents.ready()
  secondaryEvents.ready()
  secondary.disconnect()
  expect(model.connected.value).toBe(true)
  expect(connections[0]!.close).not.toHaveBeenCalled()
  expect(connections[1]!.close).toHaveBeenCalledOnce()
  model.removeSecondary()
  expect(model.secondary.value).toBeNull()
  model.dispose()
})

it('does not fall back onto the other screen and closes both panes on instance invalidation', async () => {
  const { model, gateway, consumer, observers } = setup()
  model.attach(consumer)
  await model.open('vm')
  await model.addSecondary()
  const secondary = model.secondary.value!
  const secondConsumer: GraphicsConsumer = { start: vi.fn(), stop: vi.fn() }
  secondary.attach(secondConsumer)
  vi.mocked(gateway.read).mockResolvedValueOnce({
    ...metadata(),
    screens: [metadata().screens[1]!],
  })
  await model.reload()
  expect(model.screen.value).toBe('')
  expect(secondary.screen.value).toBe('simplefb')
  vi.mocked(gateway.read).mockResolvedValueOnce({
    ...metadata(),
    screens: [metadata().screens[1]!],
  })
  await model.connect()
  expect(gateway.connect).not.toHaveBeenCalled()
  expect(model.problem.value?.code).toBe('unavailable')
  await model.reload()
  await model.connect()
  await secondary.connect()
  const socket = { close: vi.fn() } as unknown as WebSocket
  observers[0]!.ready(socket, '')
  observers[1]!.ready(socket, '')
  vi.mocked(consumer.start).mock.calls[0]![3].ready()
  vi.mocked(secondConsumer.start).mock.calls[0]![3].ready()
  vi.mocked(gateway.read).mockResolvedValueOnce({
    ...metadata(),
    expected: { instanceId: 'd'.repeat(32), revision: '2' },
  })
  await secondary.reload()
  expect(secondary.problem.value?.code).toBe('context-changed')
  expect(secondary.connected.value).toBe(false)
  expect(model.connected.value).toBe(false)
  expect(gateway.connect).toHaveBeenCalledTimes(2)
  model.removeSecondary()
  vi.mocked(gateway.read).mockResolvedValueOnce({
    ...metadata(),
    screens: [metadata().screens[0]!],
  })
  await model.reload()
  await model.addSecondary()
  expect(model.secondary.value).toBeNull()
  model.dispose()
})

it('cancels pending secondary initialization across all global lifecycle transitions', async () => {
  for (const transition of ['reset', 'pause', 'bind', 'open', 'dispose'] as const) {
    const { model, gateway, consumer } = setup()
    model.attach(consumer)
    await model.open('vm')
    let resolve!: (value: DisplayMetadata) => void
    vi.mocked(gateway.read).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = model.addSecondary()
    const previous = model.secondary.value!
    const signal = vi.mocked(gateway.read).mock.calls[1]![1]
    if (transition === 'bind') model.bind('new-session')
    else if (transition === 'open') await model.open('next-vm')
    else model[transition]()
    expect(signal.aborted).toBe(true)
    expect(model.secondary.value).toBeNull()
    resolve(metadata())
    await pending
    expect(model.secondary.value).toBeNull()
    expect(previous.status.value).toBe('idle')
    expect(gateway.connect).not.toHaveBeenCalled()
    model.dispose()
  }
})
