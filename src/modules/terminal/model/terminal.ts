import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type {
  TerminalConnection,
  TerminalCursor,
  TerminalMetadata,
  TerminalOutput,
  VmTerminalGateway,
} from '../api/gateway'

export interface TerminalConsumer {
  write(bytes: Uint8Array): Promise<void>
  reset(): void
}
export function createVmTerminal(gateway?: VmTerminalGateway) {
  const target = ref<string | null>(null),
    metadata = shallowRef<TerminalMetadata | null>(null)
  const stream = ref(''),
    status = ref<'idle' | 'loading' | 'connecting' | 'connected' | 'disconnected'>('idle')
  const problem = shallowRef<ApiProblem | null>(null)
  const inputUncertain = ref(false),
    inputDiscarded = ref(false),
    outputReset = ref(false)
  const queuedBytes = ref(0)
  const supported = computed(() => !!gateway?.supported())
  const connected = computed(() => status.value === 'connected')
  const busy = computed(() => status.value === 'loading' || status.value === 'connecting')
  let identity: string | null = null,
    generation = 0
  let read: AbortController | null = null,
    connection: TerminalConnection | null = null
  let consumer: TerminalConsumer | null = null,
    cursor: TerminalCursor | null = null
  let queue: Uint8Array[] = [],
    sequence = 1n
  let pending: { sequence: string; bytes: number } | null = null,
    rendering = false
  let inputTimer: ReturnType<typeof setTimeout> | undefined,
    outputTimer: ReturnType<typeof setTimeout> | undefined
  function disconnect(cause?: ApiError) {
    generation++
    read?.abort()
    read = null
    connection?.close()
    connection = null
    clearTimeout(inputTimer)
    clearTimeout(outputTimer)
    if (pending) inputUncertain.value = true
    if (queue.length) inputDiscarded.value = true
    pending = null
    queue = []
    queuedBytes.value = 0
    // A partly rendered frame cannot be resumed without duplicating bytes.
    if (rendering) {
      cursor = null
      consumer?.reset()
    }
    rendering = false
    status.value = target.value ? 'disconnected' : 'idle'
    if (cause) problem.value = describeApiError(cause)
    if (cause?.code === 'context-changed') {
      metadata.value = null
      cursor = null
      consumer?.reset()
    }
  }
  function pump() {
    if (!connected.value || pending || !connection || !queue.length) return
    const bytes = queue.shift()!
    if (sequence > 18446744073709551615n) {
      disconnect(new ApiError('unavailable', 'Terminal input sequence exhausted'))
      return
    }
    pending = { sequence: String(sequence++), bytes: bytes.length }
    const current = pending
    if (!connection.input(current.sequence, bytes)) {
      disconnect(new ApiError('offline', 'Terminal input could not be sent'))
      return
    }
    if (pending === current)
      inputTimer = setTimeout(
        () => disconnect(new ApiError('timeout', 'Terminal input receipt missing')),
        10_000,
      )
  }
  function input(bytes: Uint8Array) {
    if (!connected.value || !bytes.length) return false
    if (bytes.length > 4096 || queuedBytes.value + bytes.length > 4096) {
      inputDiscarded.value = true
      return false
    }
    for (let offset = 0; offset < bytes.length; offset += 512)
      queue.push(bytes.slice(offset, offset + 512))
    queuedBytes.value += bytes.length
    pump()
    return true
  }
  function acknowledged(value: string, accepted: number) {
    if (
      !pending ||
      pending.sequence !== value ||
      !Number.isInteger(accepted) ||
      accepted < 0 ||
      accepted > pending.bytes
    ) {
      disconnect(new ApiError('invalid-response', 'Invalid terminal input receipt'))
      return
    }
    clearTimeout(inputTimer)
    if (accepted !== pending.bytes) {
      inputDiscarded.value = true
      disconnect(new ApiError('unavailable', 'Terminal input only partially accepted'))
      return
    }
    queuedBytes.value -= pending.bytes
    pending = null
    pump()
  }
  async function output(value: TerminalOutput, epoch: number) {
    if (epoch !== generation) return
    if (!consumer || rendering) {
      disconnect(new ApiError('unavailable', 'Terminal renderer unavailable'))
      return
    }
    rendering = true
    if (value.reset) {
      consumer.reset()
      outputReset.value = true
    }
    outputTimer = setTimeout(
      () => disconnect(new ApiError('timeout', 'Terminal renderer stalled')),
      10_000,
    )
    try {
      await consumer.write(value.bytes)
      if (epoch !== generation) return
      clearTimeout(outputTimer)
      rendering = false
      cursor = { generation: value.generation, offset: value.next }
      if (!connection?.acknowledge(cursor))
        disconnect(new ApiError('offline', 'Terminal output acknowledgement failed'))
    } catch {
      if (epoch === generation) disconnect(new ApiError('unavailable', 'Terminal rendering failed'))
    }
  }
  async function open(vmId: string) {
    reset()
    target.value = vmId
    if (!gateway || !supported.value) return false
    const current = new AbortController(),
      epoch = generation
    read = current
    status.value = 'loading'
    try {
      const value = await gateway.read(vmId, current.signal)
      if (epoch !== generation) return false
      metadata.value = value
      stream.value = value.streams[0] ?? ''
      status.value = 'disconnected'
      return true
    } catch (cause) {
      if (epoch === generation) {
        problem.value = describeApiError(cause)
        status.value = 'disconnected'
      }
      return false
    } finally {
      if (epoch === generation) read = null
    }
  }
  async function connect() {
    if (!gateway || !supported.value || !target.value || busy.value || connected.value || !consumer)
      return
    disconnect()
    const current = new AbortController(),
      epoch = generation,
      vmId = target.value
    read = current
    problem.value = null
    status.value = 'connecting'
    try {
      const value = await gateway.read(vmId, current.signal)
      if (epoch !== generation) return
      const previous = metadata.value
      if (
        !previous ||
        previous.context.daemonEpoch !== value.context.daemonEpoch ||
        previous.context.sessionId !== value.context.sessionId ||
        previous.expected.instanceId !== value.expected.instanceId ||
        previous.expected.revision !== value.expected.revision
      ) {
        cursor = null
        consumer.reset()
      }
      metadata.value = value
      if (!stream.value) stream.value = value.streams[0] ?? ''
      if (!value.streams.includes(stream.value))
        throw new ApiError('unavailable', 'Serial stream no longer available')
      sequence = 1n
      connection = gateway.connect(value, stream.value, cursor, {
        ready: () => {
          if (epoch === generation) status.value = 'connected'
        },
        output: (frame) => {
          void output(frame, epoch)
        },
        acknowledged: (id, accepted) => {
          if (epoch === generation) acknowledged(id, accepted)
        },
        closed: (cause) => {
          if (epoch === generation) disconnect(cause)
        },
      })
    } catch (cause) {
      if (epoch === generation)
        disconnect(
          cause instanceof ApiError ? cause : new ApiError('offline', 'Terminal connection failed'),
        )
    } finally {
      if (epoch === generation) read = null
    }
  }
  function reset() {
    disconnect()
    target.value = null
    metadata.value = null
    stream.value = ''
    cursor = null
    status.value = 'idle'
    problem.value = null
    inputUncertain.value = inputDiscarded.value = outputReset.value = false
    consumer?.reset()
  }
  return {
    supported,
    connected,
    busy,
    target: readonly(target),
    metadata: readonly(metadata),
    stream: readonly(stream),
    status: readonly(status),
    problem: readonly(problem),
    queuedBytes: readonly(queuedBytes),
    inputUncertain: readonly(inputUncertain),
    inputDiscarded: readonly(inputDiscarded),
    outputReset: readonly(outputReset),
    open,
    connect,
    disconnect: () => disconnect(),
    reset,
    input,
    text: (value: string) => input(new TextEncoder().encode(value)),
    rejectInput: () => {
      inputDiscarded.value = true
    },
    dismissNotices: () => {
      inputUncertain.value = inputDiscarded.value = outputReset.value = false
    },
    select(value: string) {
      if (value === stream.value || !metadata.value?.streams.includes(value)) return
      disconnect()
      stream.value = value
      cursor = null
      consumer?.reset()
    },
    attach(value: TerminalConsumer) {
      if (consumer || connection) disconnect()
      consumer = value
      cursor = null
      return () => {
        if (consumer === value) {
          disconnect()
          consumer = null
          cursor = null
        }
      }
    },
    bind(value: string) {
      if (identity !== value) reset()
      identity = value
    },
    pause: () => disconnect(),
    dispose() {
      reset()
      consumer = null
      identity = null
    },
  }
}
export type VmTerminal = ReturnType<typeof createVmTerminal>
export const vmTerminalKey: InjectionKey<VmTerminal> = Symbol('vm-terminal')
export function useVmTerminal() {
  const model = inject(vmTerminalKey)
  if (!model) throw new Error('VM terminal is not provided')
  return model
}
