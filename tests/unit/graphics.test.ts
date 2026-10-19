import { expect, it, vi } from 'vitest'
import { createVmGraphics, type GraphicsConsumer } from '../../src/modules/graphics/model/graphics'
import { CLIPBOARD_LIMIT, validateClipboard } from '../../src/modules/graphics/lib/clipboard'
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

it('bounds clipboard text by UTF-8 bytes and requires a connected compatible receiver', async () => {
  expect(validateClipboard('', 'latin1')).toBeNull()
  expect(validateClipboard('é'.repeat(CLIPBOARD_LIMIT / 2), 'latin1')).toBeNull()
  expect(validateClipboard('é'.repeat(CLIPBOARD_LIMIT / 2 + 1), 'latin1')).toBe('too-large')
  expect(validateClipboard('😀'.repeat(CLIPBOARD_LIMIT / 4), 'utf8')).toBeNull()
  for (const text of ['a\0b', '\ud800', '\udc00', '\ud800x'])
    expect(validateClipboard(text, 'utf8')).toBe('invalid')
  const { model, consumer, observers } = setup()
  const send = vi.fn<NonNullable<GraphicsConsumer['sendClipboard']>>(() => 'sent')
  consumer.sendClipboard = send
  model.attach(consumer)
  await model.open('vm')
  await model.connect()
  observers[0]!.ready({ close: vi.fn() } as unknown as WebSocket, '')
  const events = vi.mocked(consumer.start).mock.calls[0]![3]
  events.clipboardMode('latin1')
  model.clipboardDraft.value = 'draft'
  expect(model.sendClipboard()).toBe('unavailable')
  expect(send).not.toHaveBeenCalled()
  events.ready()
  model.clipboardDraft.value = '中文'
  expect(model.sendClipboard()).toBe('encoding')
  model.clipboardDraft.value = 'x'.repeat(CLIPBOARD_LIMIT + 1)
  expect(model.sendClipboard()).toBe('too-large')
  model.clipboardDraft.value = '\ud800'
  expect(model.sendClipboard()).toBe('invalid')
  expect(send).not.toHaveBeenCalled()
  events.clipboardMode('utf8')
  model.clipboardDraft.value = '中文😀'
  expect(model.sendClipboard()).toBe('sent')
  expect(send).toHaveBeenLastCalledWith('中文😀')
  model.clipboardDraft.value = ''
  expect(model.sendClipboard()).toBe('sent')
  expect(send).toHaveBeenLastCalledWith('')
  send.mockReturnValueOnce('unavailable')
  expect(model.sendClipboard()).toBe('unavailable')
  expect(model.clipboardSendState.value).toBe('unavailable')
  model.dispose()
})

it('keeps received text separate and clears clipboard across screen and VM generations', async () => {
  const { model, consumer, observers } = setup()
  model.attach(consumer)
  await model.open('vm')
  await model.connect()
  const socket = { close: vi.fn() } as unknown as WebSocket
  observers[0]!.ready(socket, '')
  const old = vi.mocked(consumer.start).mock.calls[0]![3]
  old.clipboardMode('utf8')
  old.clipboard('before handshake')
  expect(model.clipboardReceived.value).toBeNull()
  old.ready()
  model.clipboardDraft.value = 'unsent draft'
  old.clipboard('客机文本')
  expect(model.clipboardReceived.value).toBe('客机文本')
  expect(model.clipboardDraft.value).toBe('unsent draft')
  old.clipboard('中'.repeat(Math.floor(CLIPBOARD_LIMIT / 3) + 1))
  expect(model.clipboardReceived.value).toBe('客机文本')
  expect(model.clipboardReceiveProblem.value).toBe('too-large')
  old.clipboard('\0')
  expect(model.clipboardReceiveProblem.value).toBe('invalid')
  expect(model.clipboardReceived.value).toBe('客机文本')
  old.clipboard('')
  expect(model.clipboardReceived.value).toBe('')
  expect(model.clipboardReceiveProblem.value).toBeNull()
  model.clearClipboard()
  expect(model.clipboardDraft.value).toBe('')
  expect(model.clipboardReceived.value).toBeNull()
  expect(model.clipboardMode.value).toBe('utf8')
  model.clipboardDraft.value = 'private draft'
  old.clipboard('private received')
  model.select('simplefb')
  old.clipboardMode('utf8')
  old.ready()
  old.clipboard('late old screen')
  expect(model.clipboardDraft.value).toBe('')
  expect(model.clipboardReceived.value).toBeNull()
  expect(model.clipboardMode.value).toBe('unavailable')
  expect(model.clipboardSendState.value).toBe('idle')
  await model.connect()
  observers[1]!.ready(socket, '')
  const current = vi.mocked(consumer.start).mock.calls[1]![3]
  current.clipboardMode('latin1')
  current.ready()
  model.clipboardDraft.value = 'next VM must not inherit'
  current.clipboard('second screen')
  await model.open('other-vm')
  current.clipboardMode('utf8')
  current.clipboard('late old VM')
  expect(model.clipboardDraft.value).toBe('')
  expect(model.clipboardReceived.value).toBeNull()
  expect(model.clipboardMode.value).toBe('unavailable')
  model.dispose()
})

it('blocks clipboard in view-only mode and ignores late callbacks after disconnect', async () => {
  const { model, gateway, consumer, observers } = setup()
  vi.mocked(gateway.read).mockImplementation(async () => ({
    ...metadata(),
    screens: metadata().screens.map((screen) => ({ ...screen, inputEnabled: false })),
  }))
  const send = vi.fn<NonNullable<GraphicsConsumer['sendClipboard']>>(() => 'sent')
  consumer.sendClipboard = send
  model.attach(consumer)
  await model.open('vm')
  await model.connect()
  observers[0]!.ready({ close: vi.fn() } as unknown as WebSocket, '')
  const events = vi.mocked(consumer.start).mock.calls[0]![3]
  events.clipboardMode('utf8')
  events.ready()
  model.clipboardDraft.value = 'local only'
  events.clipboard('do not receive')
  expect(model.clipboardMode.value).toBe('unavailable')
  expect(model.clipboardReceived.value).toBeNull()
  expect(model.sendClipboard()).toBe('unavailable')
  expect(send).not.toHaveBeenCalled()
  model.disconnect()
  events.clipboardMode('utf8')
  events.clipboard('late')
  expect(model.clipboardDraft.value).toBe('')
  expect(model.clipboardReceived.value).toBeNull()
  expect(model.clipboardMode.value).toBe('unavailable')
  expect(model.clipboardSendState.value).toBe('idle')
  expect(model.clipboardReceiveProblem.value).toBeNull()
  model.reset()
  expect(model.status.value).toBe('idle')
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
  primaryEvents.clipboard('primary clipboard')
  secondaryEvents.clipboard('secondary clipboard')
  expect(model.clipboardReceived.value).toBe('primary clipboard')
  expect(secondary.clipboardReceived.value).toBe('secondary clipboard')
  secondary.disconnect()
  expect(model.connected.value).toBe(true)
  expect(connections[0]!.close).not.toHaveBeenCalled()
  expect(connections[1]!.close).toHaveBeenCalledOnce()
  model.removeSecondary()
  secondaryEvents.clipboard('late removed pane')
  expect(model.secondary.value).toBeNull()
  expect(secondary.clipboardReceived.value).toBeNull()
  expect(model.clipboardReceived.value).toBe('primary clipboard')
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
    model.clipboardDraft.value = 'primary private text'
    let resolve!: (value: DisplayMetadata) => void
    vi.mocked(gateway.read).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = model.addSecondary()
    const previous = model.secondary.value!
    previous.clipboardDraft.value = 'secondary private text'
    const signal = vi.mocked(gateway.read).mock.calls[1]![1]
    if (transition === 'bind') model.bind('new-session')
    else if (transition === 'open') await model.open('next-vm')
    else model[transition]()
    expect(signal.aborted).toBe(true)
    expect(model.secondary.value).toBeNull()
    expect(model.clipboardDraft.value).toBe('')
    expect(previous.clipboardDraft.value).toBe('')
    resolve(metadata())
    await pending
    expect(model.secondary.value).toBeNull()
    expect(previous.status.value).toBe('idle')
    expect(gateway.connect).not.toHaveBeenCalled()
    model.dispose()
  }
})
