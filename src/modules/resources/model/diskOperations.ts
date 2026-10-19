import {
  computed,
  inject,
  readonly,
  ref,
  shallowRef,
  type DeepReadonly,
  type InjectionKey,
} from 'vue'
import { createOperations } from '../../tasks'
import { createDiskRecovery } from './diskRecovery'
import { createResizeGrow, type ResizeGrowContinuation } from './resizeGrow'
import { requestId } from '../../../shared/api/requestId'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import {
  optimizationAllowed,
  optimizationOperation,
  isOptimizationOperation,
  type DiskOptimizationPreferences,
  type DiskOptimizationDefaults,
  type DiskOptimizationOrigin,
  type DiskOptimizationCheck,
} from './diskOptimize'
import type {
  DiskAction,
  DiskActionGateway,
  DiskOperation,
  DiskPreparation,
} from '../api/diskOperations'

export function createDiskActions(
  gateway: DiskActionGateway | undefined,
  refresh: () => Promise<boolean>,
  newId = requestId,
  continuation?: ResizeGrowContinuation,
  loadDefaultCpus?: (signal: AbortSignal) => Promise<readonly number[] | undefined>,
  optimization?: DiskOptimizationPreferences,
) {
  const operations = createOperations(gateway, refresh, gateway?.tracking)
  const resizeGrow = createResizeGrow(continuation)
  const preparation = shallowRef<DiskPreparation | null>(null),
    problem = shallowRef<ApiProblem | null>(null)
  const open = ref(false),
    loading = ref(false),
    action = ref<DiskAction>('create'),
    selected = ref<string | null>(null)
  const initial = shallowRef<DeepReadonly<DiskOperation> | null>(null)
  const defaultCpus = shallowRef<readonly number[] | undefined>(undefined)
  const optimizing = ref(false),
    optimizeOrigin = ref<DiskOptimizationOrigin>('manual'),
    optimizeCheck = ref<DiskOptimizationCheck>('ready'),
    optimizeConfirmed = ref(false)
  const optimizeDefaults = shallowRef<DiskOptimizationDefaults | null>(null)
  const rememberAttempt = ref<string | null>(null)
  const rememberState = computed(
    () =>
      optimization?.state() ?? {
        state: 'idle' as const,
        expected: null,
        requestId: null,
        problem: null,
      },
  )
  const rememberBusy = computed(() =>
    ['posting', 'waiting', 'unknown'].includes(rememberState.value.state),
  )
  const canOptimize = computed(
    () =>
      !!preparation.value &&
      optimizeCheck.value === 'ready' &&
      optimizationAllowed(preparation.value),
  )
  let submittedOptimization: {
    requestId: string
    origin: DiskOptimizationOrigin
    defaults: DiskOptimizationDefaults | null
  } | null = null
  let read: AbortController | undefined
  const recovery = createDiskRecovery(
    gateway?.recovery,
    refresh,
    () => operations.allowed('disk') && !open.value,
    () => operations.entries.value.disk?.request.requestId ?? null,
  )
  const allowed = computed(
    () =>
      operations.allowed('disk') &&
      !resizeGrow.pending.value &&
      recovery.settled.value &&
      (operations.entries.value.disk?.task?.errorCode !== 'COMMIT_UNCERTAIN' ||
        recovery.recoveredRequest.value === operations.entries.value.disk?.request.requestId),
  )
  function close() {
    read?.abort()
    preparation.value = null
    defaultCpus.value = undefined
    open.value = false
    loading.value = false
    problem.value = null
  }
  async function prepare(
    id: string | null,
    nextAction: DiskAction,
    previous: DeepReadonly<DiskOperation> | null = null,
  ) {
    if (!allowed.value || !gateway) return
    optimizing.value = false
    optimizeDefaults.value = null
    optimizeConfirmed.value = false
    rememberAttempt.value = null
    read?.abort()
    const current = new AbortController()
    read = current
    selected.value = id
    action.value = nextAction
    open.value = true
    loading.value = true
    preparation.value = null
    problem.value = null
    initial.value = previous
    defaultCpus.value = undefined
    try {
      const [value, cpus] = await Promise.all([
        gateway.prepare(id, nextAction, current.signal),
        previous ? undefined : loadDefaultCpus?.(current.signal),
      ])
      if (!current.signal.aborted) {
        defaultCpus.value = cpus ? [...cpus] : undefined
        preparation.value = value
      }
    } catch (cause) {
      if (!current.signal.aborted) problem.value = describeApiError(cause)
    } finally {
      if (!current.signal.aborted) loading.value = false
    }
  }
  async function prepareOptimize(
    id: string,
    origin: DiskOptimizationOrigin = 'manual',
    previous: DeepReadonly<DiskOperation> | null = null,
    frozenDefaults: DiskOptimizationDefaults | null = null,
  ) {
    if (!allowed.value || !gateway) return
    read?.abort()
    const current = new AbortController()
    read = current
    selected.value = id
    action.value = 'convert'
    optimizing.value = true
    optimizeOrigin.value = origin
    optimizeCheck.value = 'ready'
    optimizeConfirmed.value = false
    optimizeDefaults.value = frozenDefaults
    rememberAttempt.value = null
    open.value = true
    loading.value = true
    preparation.value = null
    problem.value = null
    initial.value = previous
    defaultCpus.value = undefined
    try {
      let value = await gateway.prepare(id, 'convert', current.signal)
      if (current.signal.aborted) return
      if (origin === 'import' && !previous) {
        if (value.detail?.disk.parentId || (value.detail?.chain.length ?? 0) > 1) {
          optimizeCheck.value = 'overlay'
          preparation.value = value
          return
        }
        if (!gateway.compressionSupported?.() || !gateway.compression) {
          optimizeCheck.value = 'unknown'
          preparation.value = value
          return
        }
        const checked = await gateway.compression(id, current.signal)
        const latest = await gateway.prepare(id, 'convert', current.signal)
        if (current.signal.aborted) return
        if (
          checked.revision !== value.catalog.revision ||
          checked.vmRevision !== value.catalog.vmRevision ||
          latest.catalog.revision !== checked.revision ||
          latest.catalog.vmRevision !== checked.vmRevision ||
          checked.disk.id !== id ||
          checked.disk.path !== latest.detail?.disk.path ||
          checked.disk.parentId !== latest.detail?.disk.parentId ||
          checked.inspection.format !== latest.detail?.inspection.format
        )
          throw new ApiError('conflict', 'Disk changed during effective compression inspection')
        value = latest
        const compression =
          checked.inspection.state === 'ready' && latest.detail?.inspection.state === 'ready'
            ? checked.inspection.effectiveCompression
            : null
        if (compression === 'none') {
          optimizeCheck.value = 'uncompressed'
          preparation.value = value
          return
        }
        if (compression !== 'deflate' && compression !== 'zstd') {
          optimizeCheck.value = 'unknown'
          preparation.value = value
          return
        }
      }
      const defaults = previous
        ? (frozenDefaults ?? {
            expected: null,
            compression: 'ask' as const,
            cpus: undefined,
            canRemember: false,
          })
        : optimization
          ? await optimization.read(current.signal)
          : {
              expected: null,
              compression: 'ask' as const,
              cpus: await loadDefaultCpus?.(current.signal),
              canRemember: false,
            }
      if (current.signal.aborted) return
      const operation = previous ?? optimizationOperation(value, defaults.cpus)
      if (operation && !isOptimizationOperation(operation, value))
        throw new ApiError('conflict', 'Optimization parameters no longer match the disk')
      optimizeDefaults.value = {
        ...defaults,
        expected: defaults.expected ? { ...defaults.expected } : null,
        cpus: defaults.cpus ? [...defaults.cpus] : undefined,
      }
      defaultCpus.value = previous ? undefined : defaults.cpus
      initial.value = operation
      preparation.value = value
    } catch (cause) {
      if (!current.signal.aborted) problem.value = describeApiError(cause)
    } finally {
      if (!current.signal.aborted) loading.value = false
    }
  }
  async function retry() {
    const entry = operations.entries.value.disk
    if (!entry) return
    const operation = entry.request.operation
    if (submittedOptimization?.requestId === entry.request.requestId && 'diskId' in operation)
      await prepareOptimize(
        operation.diskId,
        submittedOptimization.origin,
        operation,
        submittedOptimization.defaults,
      )
    else
      await prepare(
        'diskId' in operation ? operation.diskId : (operation.backingId ?? null),
        operation.action,
        operation,
      )
  }
  function canGrow(operation: DiskOperation | null) {
    const detail = preparation.value?.detail
    return !!(
      resizeGrow.available.value &&
      operation?.action === 'resize' &&
      !operation.shrink &&
      detail?.inspection.virtualBytes &&
      detail.disk.id === operation.diskId &&
      detail.chainComplete &&
      !detail.readOnlyRequired &&
      !detail.children.length &&
      detail.inspection.state === 'ready' &&
      BigInt(operation.size) > BigInt(detail.inspection.virtualBytes)
    )
  }
  async function submit(operation: DiskOperation, grow = false, remember = false) {
    const baseline = preparation.value
    if (!baseline?.catalog.vmRevision || !allowed.value || (grow && !canGrow(operation))) return
    if (optimizing.value) {
      if (
        !canOptimize.value ||
        !isOptimizationOperation(operation, baseline) ||
        grow ||
        rememberBusy.value ||
        !optimizeDefaults.value ||
        (optimizeDefaults.value.compression === 'ask' && !optimizeConfirmed.value)
      )
        return
      if (remember) {
        const expected = optimizeDefaults.value.expected
        if (!optimization || !expected || !optimizeDefaults.value.canRemember) return
        if (!rememberAttempt.value) {
          const currentRead = read
          const previousId = optimization.state().requestId
          await optimization.remember(expected)
          if (
            read === currentRead &&
            !currentRead?.signal.aborted &&
            optimization.state().requestId !== previousId
          )
            rememberAttempt.value = optimization.state().requestId
          // Saving preferences never dispatches a disk mutation as a continuation.
          return
        }
        if (
          rememberState.value.requestId !== rememberAttempt.value ||
          rememberState.value.state !== 'saved' ||
          rememberState.value.expected?.revision !== expected.revision
        )
          return
      }
    }
    const request = {
      requestId: newId(),
      revision: baseline.catalog.revision,
      vmRevision: baseline.catalog.vmRevision,
      operation: JSON.parse(JSON.stringify(operation)) as DiskOperation,
    }
    submittedOptimization = optimizing.value
      ? {
          requestId: request.requestId,
          origin: optimizeOrigin.value,
          defaults: optimizeDefaults.value
            ? {
                ...optimizeDefaults.value,
                expected: optimizeDefaults.value.expected
                  ? { ...optimizeDefaults.value.expected }
                  : null,
                cpus: optimizeDefaults.value.cpus ? [...optimizeDefaults.value.cpus] : undefined,
              }
            : null,
        }
      : null
    resizeGrow.reset()
    if (
      grow &&
      operation.action === 'resize' &&
      !resizeGrow.begin(request.requestId, {
        diskId: operation.diskId,
        revision: request.revision,
        vmRevision: request.vmRevision,
        size: operation.size,
      })
    )
      return
    close()
    await operations.submit('disk', request)
    await resizeGrow.advance(operations.entries.value.disk)
  }
  async function reconcile() {
    // An uncertain result permanently cancels automatic continuation, including
    // when this lookup later recovers a successful resize receipt.
    const entry = operations.entries.value.disk
    if (entry?.state === 'unknown' || entry?.problem) resizeGrow.stop()
    await operations.reconcile()
    await resizeGrow.advance(operations.entries.value.disk)
  }
  return {
    ...operations,
    recovery,
    resizeGrow,
    allowed,
    initial: readonly(initial),
    defaultCpus: readonly(defaultCpus),
    optimizing: readonly(optimizing),
    optimizeOrigin: readonly(optimizeOrigin),
    optimizeCheck: readonly(optimizeCheck),
    optimizeDefaults: readonly(optimizeDefaults),
    optimizeConfirmed,
    canOptimize,
    rememberState,
    rememberBusy,
    lastOptimizationOrigin: computed(() =>
      submittedOptimization?.requestId === operations.entries.value.disk?.request.requestId
        ? (submittedOptimization?.origin ?? null)
        : null,
    ),
    queryOptimizationPreference: async () => {
      await optimization?.reconcile()
    },
    open: readonly(open),
    loading: readonly(loading),
    action: readonly(action),
    selected: readonly(selected),
    preparation: readonly(preparation),
    problem: readonly(problem),
    prepare,
    prepareOptimize,
    retry,
    close,
    submit,
    canGrow,
    resumeGrow: () => resizeGrow.resume(operations.entries.value.disk),
    reconcile,
    bind(identity: string) {
      close()
      resizeGrow.bind(identity)
      operations.bind(identity)
      recovery.bind(identity)
    },
    pause() {
      close()
      resizeGrow.stop()
      operations.pause()
      recovery.pause()
    },
    reset(preserveTracking = false) {
      close()
      resizeGrow.reset(preserveTracking)
      operations.reset(preserveTracking)
      recovery.reset(preserveTracking)
      submittedOptimization = null
    },
    dispose() {
      close()
      resizeGrow.dispose()
      operations.dispose()
      recovery.dispose()
    },
  }
}
export type DiskActions = ReturnType<typeof createDiskActions>
export const diskActionsKey: InjectionKey<DiskActions> = Symbol('disk-actions')
export function useDiskActions() {
  const actions = inject(diskActionsKey)
  if (!actions) throw new Error('Disk actions are not provided')
  return actions
}
