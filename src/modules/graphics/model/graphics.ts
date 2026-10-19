import {
  computed,
  inject,
  readonly,
  ref,
  shallowReadonly,
  shallowRef,
  type InjectionKey,
} from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type { DisplayConnection, DisplayMetadata, VmGraphicsGateway } from '../api/gateway'
import { validateClipboard, type ClipboardMode, type ClipboardSendResult } from '../lib/clipboard'

export interface GraphicsConsumer {
  start(
    socket: WebSocket,
    password: string,
    inputEnabled: boolean,
    events: {
      ready(): void
      closed(): void
      clipboard(text: string): void
      clipboardMode(mode: ClipboardMode): void
    },
  ): void
  stop(): void
  sendClipboard?(text: string): ClipboardSendResult
}
interface GraphicsCoordination {
  reservedScreen(): string | undefined
  observed(value: DisplayMetadata): void
  invalidated(): void
}
function createSingleVmGraphics(gateway?: VmGraphicsGateway, coordination?: GraphicsCoordination) {
  const metadata = shallowRef<DisplayMetadata | null>(null),
    problem = shallowRef<ApiProblem | null>(null)
  const target = ref(''),
    screen = ref(''),
    status = ref<'idle' | 'loading' | 'connecting' | 'connected' | 'disconnected'>('idle')
  const supported = computed(() => !!gateway?.supported()),
    connected = computed(() => status.value === 'connected')
  const busy = computed(() => status.value === 'loading' || status.value === 'connecting')
  const selected = computed(() => metadata.value?.screens.find((item) => item.id === screen.value))
  const clipboardDraft = ref('')
  const clipboardReceived = ref<string | null>(null)
  const clipboardMode = ref<ClipboardMode>('unavailable')
  const clipboardSendState = ref<'idle' | ClipboardSendResult>('idle')
  const clipboardReceiveProblem = ref<'too-large' | 'invalid' | null>(null)
  let generation = 0,
    identity = '',
    expectedInstance: string | undefined
  let read: AbortController | undefined,
    connection: DisplayConnection | undefined,
    consumer: GraphicsConsumer | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  function clearClipboard() {
    clipboardDraft.value = ''
    clipboardReceived.value = null
    clipboardSendState.value = 'idle'
    clipboardReceiveProblem.value = null
  }
  function sendClipboard(): ClipboardSendResult {
    if (!connected.value || !selected.value?.inputEnabled || !consumer?.sendClipboard) {
      clipboardSendState.value = 'unavailable'
      return 'unavailable'
    }
    const invalid = validateClipboard(clipboardDraft.value, clipboardMode.value)
    if (invalid) {
      clipboardSendState.value = invalid
      return invalid
    }
    const epoch = generation
    let result: ClipboardSendResult
    try {
      result = consumer.sendClipboard(clipboardDraft.value)
    } catch {
      result = 'unavailable'
    }
    // A synchronous socket failure can disconnect while the adapter is sending.
    if (epoch === generation) clipboardSendState.value = result
    return result
  }
  function disconnect(cause?: unknown) {
    generation++
    clearClipboard()
    clipboardMode.value = 'unavailable'
    read?.abort()
    read = undefined
    clearTimeout(deadline)
    consumer?.stop()
    connection?.close()
    connection = undefined
    status.value = target.value ? 'disconnected' : 'idle'
    if (cause) problem.value = describeApiError(cause)
    if (cause instanceof ApiError && cause.code === 'context-changed') coordination?.invalidated()
  }
  async function refresh(connecting: boolean) {
    if (!gateway || !supported.value || !target.value || busy.value) return
    disconnect()
    const epoch = generation,
      abort = new AbortController()
    read = abort
    problem.value = null
    status.value = connecting ? 'connecting' : 'loading'
    try {
      const value = await gateway.read(target.value, abort.signal)
      if (epoch !== generation) return
      if (expectedInstance && expectedInstance !== value.expected.instanceId)
        throw new ApiError('context-changed', 'VM instance changed')
      coordination?.observed(value)
      expectedInstance ??= value.expected.instanceId
      metadata.value = value
      const reserved = coordination?.reservedScreen()
      if (!value.screens.some((item) => item.id === screen.value) || screen.value === reserved) {
        const available = value.screens.filter((item) => item.id !== reserved)
        screen.value = available.find((item) => item.available)?.id ?? available[0]?.id ?? ''
      }
      if (!connecting) {
        status.value = 'disconnected'
        return
      }
      if (!selected.value?.available || !consumer)
        throw new ApiError('unavailable', 'Display unavailable')
      const inputEnabled = selected.value.inputEnabled
      connection = gateway.connect(value, screen.value, {
        ready(socket, password) {
          if (epoch !== generation || !consumer) {
            socket.close()
            return
          }
          deadline = setTimeout(() => {
            if (epoch === generation) disconnect(new ApiError('timeout', 'RFB handshake timed out'))
          }, 15_000)
          consumer.start(socket, password, inputEnabled, {
            ready() {
              if (epoch === generation) {
                clearTimeout(deadline)
                status.value = 'connected'
              }
            },
            closed() {
              if (epoch === generation) disconnect(new ApiError('offline', 'Display disconnected'))
            },
            clipboardMode(mode) {
              if (epoch === generation) clipboardMode.value = inputEnabled ? mode : 'unavailable'
            },
            clipboard(text) {
              if (epoch !== generation || !connected.value || !selected.value?.inputEnabled) return
              const invalid = validateClipboard(text, 'utf8')
              if (invalid) {
                clipboardReceiveProblem.value = invalid === 'too-large' ? 'too-large' : 'invalid'
                return
              }
              clipboardReceived.value = text
              clipboardReceiveProblem.value = null
            },
          })
        },
        closed(cause) {
          if (epoch === generation) disconnect(cause)
        },
      })
    } catch (cause) {
      if (epoch === generation) disconnect(cause)
    } finally {
      if (epoch === generation) read = undefined
    }
  }
  function reset() {
    disconnect()
    target.value = ''
    metadata.value = null
    screen.value = ''
    problem.value = null
    status.value = 'idle'
    expectedInstance = undefined
  }
  return {
    supported,
    connected,
    busy,
    selected,
    clipboardDraft,
    clipboardReceived: readonly(clipboardReceived),
    clipboardMode: readonly(clipboardMode),
    clipboardSendState: readonly(clipboardSendState),
    clipboardReceiveProblem: readonly(clipboardReceiveProblem),
    sendClipboard,
    clearClipboard,
    metadata: readonly(metadata),
    problem: readonly(problem),
    screen: readonly(screen),
    status: readonly(status),
    async open(vmId: string, instanceId?: string, initialScreen?: string) {
      reset()
      target.value = vmId
      expectedInstance = instanceId
      screen.value = initialScreen ?? ''
      await refresh(false)
    },
    connect: () => refresh(true),
    reload: () => refresh(false),
    disconnect: () => disconnect(),
    reset,
    select(value: string) {
      if (
        value !== screen.value &&
        value !== coordination?.reservedScreen() &&
        metadata.value?.screens.some((item) => item.id === value)
      ) {
        disconnect()
        screen.value = value
      }
    },
    attach(value: GraphicsConsumer) {
      if (consumer) disconnect()
      consumer = value
      return () => {
        if (consumer === value) {
          disconnect()
          consumer = undefined
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
      consumer = undefined
      identity = ''
    },
  }
}
export type SingleVmGraphics = ReturnType<typeof createSingleVmGraphics>

export function createVmGraphics(gateway?: VmGraphicsGateway) {
  const secondary = shallowRef<SingleVmGraphics | null>(null)
  let vmId = '',
    identity = '',
    generation = 0
  const disconnectStale = (peer: SingleVmGraphics | null, value: DisplayMetadata) => {
    const observed = peer?.metadata.value
    if (
      observed &&
      (observed.expected.instanceId !== value.expected.instanceId ||
        observed.expected.revision !== value.expected.revision)
    )
      peer?.disconnect()
  }
  const primary = createSingleVmGraphics(gateway, {
    reservedScreen: () => secondary.value?.screen.value,
    observed: (value) => disconnectStale(secondary.value, value),
    invalidated: () => secondary.value?.disconnect(),
  })
  function removeSecondary() {
    generation++
    const previous = secondary.value
    secondary.value = null
    previous?.dispose()
  }
  function reset() {
    removeSecondary()
    primary.reset()
    vmId = ''
  }
  return {
    ...primary,
    secondary: shallowReadonly(secondary),
    async addSecondary() {
      const metadata = primary.metadata.value
      if (secondary.value || !vmId || !metadata || primary.busy.value || !primary.supported.value)
        return
      const screen = metadata.screens.find(
        (item) => item.available && item.id !== primary.screen.value,
      )
      if (!screen) return
      const epoch = generation
      const candidate = createSingleVmGraphics(gateway, {
        reservedScreen: () => primary.screen.value,
        observed(value) {
          if (primary.metadata.value?.expected.instanceId !== value.expected.instanceId)
            throw new ApiError('context-changed', 'Display instances no longer match')
          disconnectStale(primary, value)
        },
        invalidated: () => primary.disconnect(),
      })
      secondary.value = candidate
      await candidate.open(vmId, metadata.expected.instanceId, screen.id)
      // Removal/open/bind may have happened while an uncooperative read settled.
      if (epoch !== generation || secondary.value !== candidate) candidate.dispose()
    },
    removeSecondary,
    async open(id: string, instanceId?: string) {
      removeSecondary()
      vmId = id
      await primary.open(id, instanceId)
    },
    reset,
    bind(value: string) {
      if (identity !== value) reset()
      identity = value
      primary.bind(value)
    },
    pause() {
      removeSecondary()
      primary.pause()
    },
    dispose() {
      removeSecondary()
      primary.dispose()
      vmId = ''
      identity = ''
    },
  }
}
export type VmGraphics = ReturnType<typeof createVmGraphics>
export const vmGraphicsKey: InjectionKey<VmGraphics> = Symbol('vm-graphics')
export function useVmGraphics() {
  const model = inject(vmGraphicsKey)
  if (!model) throw new Error('VM graphics is not provided')
  return model
}
