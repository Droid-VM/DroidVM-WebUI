import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type { LogGateway, LogList, LogRead } from '../api/gateway'

const limit = 1 << 20
export function createLogViewer(gateway?: LogGateway) {
  const target = shallowRef<LogList | null>(null)
  const stream = ref('')
  const bytes = shallowRef(new Uint8Array(0))
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const problem = shallowRef<ApiProblem | null>(null)
  const busy = ref(false),
    more = ref(false),
    discontinuous = ref(false),
    partial = ref(false)
  const follow = ref(true)
  let cursor: LogRead['cursor'] = null,
    generation = 0,
    disposed = false
  let pending: AbortController | undefined
  const supported = computed(() => !disposed && !!gateway?.supported())
  function clearRead() {
    generation++
    pending?.abort()
    pending = undefined
    bytes.value = new Uint8Array(0)
    cursor = null
    busy.value = false
    more.value = false
    discontinuous.value = false
    partial.value = false
    problem.value = null
  }
  async function reload(tail = cursor === null) {
    const current = target.value
    if (!current || !stream.value || !gateway || !supported.value || busy.value) return
    const epoch = generation,
      controller = new AbortController(),
      selected = stream.value
    pending = controller
    busy.value = true
    problem.value = null
    try {
      // A bounded catch-up pass; slower producers cost only one chunk.
      for (let page = 0; page < 16; page++) {
        const value = await gateway.read(
          {
            vmId: current.vmId,
            instanceId: current.instanceId,
            stream: selected,
            cursor,
            tail: cursor === null && tail,
          },
          controller.signal,
        )
        if (disposed || epoch !== generation || controller.signal.aborted) return
        if (value.reset) {
          bytes.value = new Uint8Array(0)
          discontinuous.value = true
        }
        if (!cursor || value.reset) partial.value = BigInt(value.start) > 0n
        const old = bytes.value
        const keep = Math.min(old.length, limit - value.bytes.length)
        if (keep < old.length) partial.value = true
        const next = new Uint8Array(keep + value.bytes.length)
        next.set(old.subarray(old.length - keep))
        next.set(value.bytes, keep)
        bytes.value = next
        cursor = { generation: value.generation, offset: value.next }
        more.value = value.more
        status.value = 'ready'
        if (!value.more) break
      }
    } catch (cause) {
      if (disposed || epoch !== generation || controller.signal.aborted) return
      problem.value = describeApiError(cause)
      status.value = 'error'
    } finally {
      if (epoch === generation) {
        busy.value = false
        pending = undefined
      }
    }
  }
  async function select(name: string) {
    if (!target.value?.streams.includes(name)) return
    clearRead()
    stream.value = name
    status.value = 'loading'
    await reload(true)
  }
  async function open(vmId: string) {
    reset()
    if (!supported.value || !gateway) return
    const controller = new AbortController(),
      epoch = generation
    pending = controller
    status.value = 'loading'
    try {
      const result = await gateway.list(vmId, controller.signal)
      if (disposed || epoch !== generation || controller.signal.aborted) return
      target.value = result
      const initial = result.streams.includes('stdio') ? 'stdio' : result.streams[0]
      if (initial) await select(initial)
      else status.value = 'ready'
    } catch (cause) {
      if (disposed || epoch !== generation || controller.signal.aborted) return
      problem.value = describeApiError(cause)
      status.value = 'error'
    }
  }
  function reset() {
    clearRead()
    target.value = null
    stream.value = ''
    status.value = 'idle'
  }
  return {
    target: readonly(target),
    stream: readonly(stream),
    status: readonly(status),
    problem: readonly(problem),
    busy: readonly(busy),
    more: readonly(more),
    partial: readonly(partial),
    discontinuous: readonly(discontinuous),
    supported,
    follow,
    // Decode the bounded contiguous bytes together so split UTF-8 characters are
    // reconstructed. An unfinished suffix waits for its next byte during follow.
    text: computed(() => new TextDecoder().decode(bytes.value, { stream: follow.value })),
    byteCount: computed(() => bytes.value.length),
    exportBytes: () => bytes.value.slice(),
    open,
    select,
    refresh: () => reload(),
    reset,
    async history() {
      if (!target.value || busy.value) return
      clearRead()
      status.value = 'loading'
      await reload(false)
    },
    dispose() {
      disposed = true
      reset()
    },
  }
}
export type LogViewer = ReturnType<typeof createLogViewer>
export const logViewerKey: InjectionKey<LogViewer> = Symbol('log-viewer')
export function useLogViewer(): LogViewer {
  const viewer = inject(logViewerKey)
  if (!viewer) throw new Error('Log viewer is not provided')
  return viewer
}
