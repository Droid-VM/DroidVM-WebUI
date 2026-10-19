import { afterEach, expect, it, vi } from 'vitest'
import { createVmTerminal } from '../../src/modules/terminal/model/terminal'
import { createVmTerminalGateway } from '../../src/modules/terminal/api/websocket'
import type {
  TerminalMetadata,
  TerminalObserver,
  TerminalOutput,
  VmTerminalGateway,
} from '../../src/modules/terminal/api/gateway'
import type { HttpClient } from '../../src/shared/api/httpClient'
import { ApiError } from '../../src/shared/api/errors'

const context = { daemonEpoch: 'daemon', sessionId: 'a'.repeat(64) }
const metadata = (): TerminalMetadata => ({
  context,
  vmId: 'vm',
  expected: { instanceId: 'c'.repeat(32), revision: '1' },
  streams: ['uart', 'uart-2'],
  resizeSupported: false,
})
const frame = (start: string, next: string, bytes: Uint8Array): TerminalOutput => ({
  type: 'output',
  context,
  generation: 'generation',
  floor: '0',
  start,
  next,
  end: next,
  reset: false,
  more: false,
  data: btoa(String.fromCharCode(...bytes)),
  bytes,
})
afterEach(() => vi.useRealTimers())
function setup() {
  const connection = {
    input: vi.fn().mockReturnValue(true),
    acknowledge: vi.fn().mockReturnValue(true),
    close: vi.fn(),
  }
  const observers: TerminalObserver[] = []
  const gateway: VmTerminalGateway = {
    supported: () => true,
    read: vi.fn().mockResolvedValue(metadata()),
    connect: vi
      .fn()
      .mockImplementation((_metadata, _stream, _cursor, observer: TerminalObserver) => {
        observers.push(observer)
        return connection
      }),
  }
  const consumer = { write: vi.fn().mockResolvedValue(undefined), reset: vi.fn() }
  const model = createVmTerminal(gateway)
  model.bind('session')
  model.attach(consumer)
  return { model, gateway, consumer, connection, observers }
}
it('acknowledges output only after raw bytes are rendered and resumes from the consumed cursor', async () => {
  const { model, gateway, consumer, connection, observers } = setup()
  let consumed!: () => void
  consumer.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        consumed = resolve
      }),
  )
  await model.open('vm')
  await model.connect()
  const observer = observers[0]!
  observer.ready()
  observer.output(frame('0', '1', new Uint8Array([0xe4])))
  expect(connection.acknowledge).not.toHaveBeenCalled()
  expect(consumer.write).toHaveBeenCalledWith(new Uint8Array([0xe4]))
  consumed()
  await Promise.resolve()
  expect(connection.acknowledge).toHaveBeenCalledWith({ generation: 'generation', offset: '1' })
  observer.output(frame('1', '3', new Uint8Array([0xb8, 0xad])))
  await Promise.resolve()
  model.disconnect()
  await model.connect()
  expect(vi.mocked(gateway.connect).mock.calls[1]![2]).toEqual({
    generation: 'generation',
    offset: '3',
  })
  model.dispose()
})
it('allows one unacknowledged input, bounds the queue and never replays partial input', async () => {
  const { model, connection, observers } = setup()
  await model.open('vm')
  await model.connect()
  const observer = observers[0]!
  observer.ready()
  expect(model.input(new Uint8Array(600))).toBe(true)
  expect(connection.input).toHaveBeenCalledTimes(1)
  expect(connection.input.mock.calls[0]![0]).toBe('1')
  expect(connection.input.mock.calls[0]![1]).toHaveLength(512)
  expect(model.input(new Uint8Array(4096))).toBe(false)
  observer.acknowledged('1', 512)
  expect(connection.input).toHaveBeenCalledTimes(2)
  expect(connection.input.mock.calls[1]![0]).toBe('2')
  observer.acknowledged('2', 2)
  expect(model.status.value).toBe('disconnected')
  expect(model.inputUncertain.value).toBe(true)
  expect(model.inputDiscarded.value).toBe(true)
  expect(model.queuedBytes.value).toBe(0)
  await model.connect()
  observers[1]!.ready()
  expect(connection.input).toHaveBeenCalledTimes(2)
  model.dispose()
})
it('expires a missing input receipt and isolates late rendering and reads from another identity', async () => {
  vi.useFakeTimers()
  const { model, gateway, consumer, connection, observers } = setup()
  await model.open('vm')
  await model.connect()
  observers[0]!.ready()
  model.text('x')
  await vi.advanceTimersByTimeAsync(10_000)
  expect(model.inputUncertain.value).toBe(true)
  expect(model.connected.value).toBe(false)
  await model.connect()
  observers[1]!.ready()
  let finish!: () => void
  consumer.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  observers[1]!.output(frame('0', '1', new Uint8Array([65])))
  model.bind('other-session')
  finish()
  await Promise.resolve()
  expect(connection.acknowledge).not.toHaveBeenCalled()
  expect(model.metadata.value).toBe(null)
  let read!: (value: TerminalMetadata) => void
  vi.mocked(gateway.read).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        read = resolve
      }),
  )
  const opening = model.open('vm')
  model.bind('third-session')
  read(metadata())
  await opening
  expect(model.metadata.value).toBe(null)
  model.dispose()
})
it('keeps terminal credentials in the first frame and rejects a second output before consumption', () => {
  const sent: Record<string, unknown>[] = []
  const socket = {
    readyState: 1,
    bufferedAmount: 0,
    onopen: null as ((event: Event) => void) | null,
    onmessage: null as ((event: MessageEvent) => void) | null,
    onclose: null as ((event: CloseEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    send: (data: string) => {
      sent.push(JSON.parse(data) as Record<string, unknown>)
    },
    close: vi.fn(),
  }
  const create = vi.fn().mockReturnValue(socket)
  const gateway = createVmTerminalGateway(
    {} as HttpClient,
    () => ({
      context,
      csrfToken: 'b'.repeat(64),
      administrator: true,
      capabilities: ['vm.terminal.v1'],
    }),
    { create, origin: 'http://127.0.0.1:8080' },
  )
  const observer: TerminalObserver = {
    ready: vi.fn(),
    output: vi.fn(),
    acknowledged: vi.fn(),
    closed: vi.fn(),
  }
  const connection = gateway.connect(metadata(), 'uart', null, observer)
  expect(create).toHaveBeenCalledWith('ws://127.0.0.1:8080/api/v1/terminal', 'droidvm.terminal.v1')
  socket.onopen!(new Event('open'))
  expect(sent[0]).toMatchObject({ type: 'open', csrfToken: 'b'.repeat(64), cursor: null })
  const receive = (value: unknown) =>
    socket.onmessage!(new MessageEvent('message', { data: JSON.stringify(value) }))
  receive({ ...metadata(), streams: undefined, type: 'ready', stream: 'uart' })
  const output = { ...frame('0', '1', new Uint8Array([65])), bytes: undefined }
  receive(output)
  expect(observer.output).toHaveBeenCalledTimes(1)
  expect(sent).toHaveLength(1)
  expect(connection.acknowledge({ generation: 'generation', offset: '1' })).toBe(true)
  expect(sent[1]).toEqual({ type: 'ackOutput', generation: 'generation', offset: '1' })
  receive({ ...output, start: '1', next: '2', end: '2' })
  receive({ ...output, start: '2', next: '3', end: '3' })
  expect(observer.closed).toHaveBeenCalledWith(expect.any(ApiError))
  expect(socket.close).toHaveBeenCalledTimes(1)
  connection.close()
})
