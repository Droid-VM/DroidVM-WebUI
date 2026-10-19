import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import { encodeDocument } from '../../../shared/model/configurationDocument'
import { createOperations } from '../../tasks'
import type { NetworkConfigurationGateway } from '../api/gateway'
import type { NetworkDetail, NetworkRuntimeGateway } from '../api/runtime'
import type {
  NetworkDeletionCommit,
  NetworkDeletionGateway,
  ConfigurationRecoveryGateway,
} from '../api/deletion'
import { parseNetworks } from './document'

interface Preview {
  id: string
  name: string
  expected: string
  detail: NetworkDetail
}
export function createNetworkDeletion(
  gateway?: NetworkDeletionGateway,
  configuration?: NetworkConfigurationGateway,
  runtime?: NetworkRuntimeGateway,
  recoveryGateway?: ConfigurationRecoveryGateway,
  refresh: () => Promise<boolean> = async () => true,
  newId = requestId,
) {
  const visible = ref(false),
    target = ref<string | null>(null),
    recoveryConfirmation = ref(false)
  const preview = shallowRef<Preview | null>(null),
    problem = shallowRef<ApiProblem | null>(null)
  const loading = ref(false),
    staging = ref(false),
    removed = ref(false)
  const observed = ref<'unknown' | 'present' | 'absent'>('unknown')
  const recoveredFor = ref<string | null>(null)
  let generation = 0,
    identity: string | null = null
  const reads = new Set<AbortController>()
  const operations = createOperations<NetworkDeletionCommit>(gateway, observe)
  const entry = computed(() => operations.entries.value.deletion ?? null)
  const uncertain = computed(
    () =>
      !!entry.value &&
      (entry.value.task?.errorCode === 'COMMIT_UNCERTAIN' ||
        entry.value.problem?.code === 'commit-uncertain') &&
      recoveredFor.value !== entry.value.request.requestId,
  )
  const deletionPending = computed(() => !!entry.value && entry.value.state !== 'done')
  const recovery = createOperations(recoveryGateway, async () => {
    const current = recovery.entries.value.recovery,
      epoch = generation
    const fresh = await observe()
    if (fresh && epoch === generation && current?.task?.state === 'succeeded')
      recoveredFor.value = entry.value?.request.requestId ?? null
    return fresh
  })
  const recoveryEntry = computed(() => recovery.entries.value.recovery ?? null)
  const recoveryPending = computed(
    () => !!recoveryEntry.value && recoveryEntry.value.state !== 'done',
  )
  const pending = computed(() => staging.value || deletionPending.value || recoveryPending.value)
  const supported = computed(
    () =>
      operations.supported.value && !!configuration?.supported() && !!runtime?.inspectSupported(),
  )
  const busy = computed(() => loading.value || staging.value || pending.value)
  const canSubmit = computed(
    () => supported.value && !!preview.value && !busy.value && !entry.value && !uncertain.value,
  )
  const canRecover = computed(
    () =>
      recovery.supported.value &&
      recovery.allowed('recovery') &&
      !loading.value &&
      !staging.value &&
      (recoveryConfirmation.value || uncertain.value || !!problem.value) &&
      (!entry.value?.task || ['failed', 'cancelled', 'succeeded'].includes(entry.value.task.state)),
  )

  async function observe() {
    if (!configuration || loading.value) return false
    const controller = new AbortController(),
      epoch = generation,
      id = target.value
    reads.add(controller)
    loading.value = true
    problem.value = null
    try {
      const rows = parseNetworks(await configuration.read(controller.signal))
      if (epoch !== generation) return false
      const exists = !!id && rows.some((item) => item.id === id)
      // A present network is inspected again after recovery; failure is not a
      // proof that a durable deletion completed.
      if (exists && runtime && id) await runtime.read(id, controller.signal)
      if (epoch !== generation || !(await refresh()) || epoch !== generation) return false
      observed.value = id ? (exists ? 'present' : 'absent') : 'unknown'
      removed.value = !!id && !exists && entry.value?.task?.state === 'succeeded'
      if (exists && entry.value?.task?.state === 'succeeded')
        throw new ApiError('conflict', 'Deleted network is still registered')
      return true
    } catch (cause) {
      if (epoch === generation) {
        observed.value = 'unknown'
        problem.value = describeApiError(cause)
      }
      return false
    } finally {
      reads.delete(controller)
      if (epoch === generation) loading.value = false
    }
  }
  async function open(id: string) {
    visible.value = true
    recoveryConfirmation.value = false
    if (pending.value || uncertain.value || staging.value) return false
    if (!configuration || !runtime || !supported.value) return false
    pause()
    operations.reset()
    recovery.reset()
    if (identity) {
      operations.bind(identity)
      recovery.bind(identity)
    }
    target.value = id
    preview.value = null
    observed.value = 'unknown'
    removed.value = false
    recoveredFor.value = null
    problem.value = null
    const controller = new AbortController(),
      epoch = generation
    reads.add(controller)
    loading.value = true
    try {
      const rows = parseNetworks(await configuration.read(controller.signal))
      if (epoch !== generation) return false
      const row = rows.find((item) => item.id === id)
      if (!row) throw new ApiError('conflict', 'Network is no longer registered')
      const expected = encodeDocument({ expected: row })
      const detail = await runtime.read(id, controller.signal)
      if (epoch !== generation) return false
      preview.value = { id, name: typeof row.name === 'string' ? row.name : id, expected, detail }
      observed.value = 'present'
      return true
    } catch (cause) {
      if (epoch === generation) problem.value = describeApiError(cause)
      return false
    } finally {
      reads.delete(controller)
      if (epoch === generation) loading.value = false
    }
  }
  async function submit() {
    const current = preview.value
    if (!gateway || !current || !canSubmit.value) return
    const controller = new AbortController(),
      epoch = generation
    reads.add(controller)
    staging.value = true
    problem.value = null
    let uploadId: string | undefined,
      submitted = false
    try {
      uploadId = await gateway.stage(current.expected, current.detail.vmRevision, controller.signal)
      if (epoch !== generation) return
      submitted = true
      await operations.submit('deletion', { networkId: current.id, uploadId, requestId: newId() })
    } catch (cause) {
      if (epoch === generation) problem.value = describeApiError(cause)
    } finally {
      reads.delete(controller)
      if (epoch === generation) staging.value = false
      if (uploadId && !submitted) {
        try {
          await gateway.abort(uploadId, new AbortController().signal)
        } catch {
          /* Bounded upload lease. */
        }
      }
    }
  }
  async function recover() {
    if (!canRecover.value) return
    recoveryConfirmation.value = false
    const epoch = generation
    await recovery.submit('recovery', { requestId: newId() })
    if (epoch === generation) await operations.reconcile()
  }
  async function reconcile() {
    const epoch = generation
    await recovery.reconcile()
    if (epoch === generation) await operations.reconcile()
  }
  function pause() {
    generation++
    reads.forEach((read) => read.abort())
    reads.clear()
    loading.value = staging.value = false
    recoveryConfirmation.value = false
    // A prepared destructive confirmation never survives a disconnected session.
    if (!entry.value) preview.value = null
    operations.pause()
    recovery.pause()
  }
  function reset() {
    pause()
    operations.reset()
    recovery.reset()
    visible.value = false
    recoveryConfirmation.value = false
    target.value = null
    preview.value = null
    problem.value = null
    observed.value = 'unknown'
    removed.value = false
    recoveredFor.value = null
    identity = null
  }
  return {
    supported,
    visible: readonly(visible),
    target: readonly(target),
    preview: readonly(preview),
    recoveryConfirmation: readonly(recoveryConfirmation),
    loading: readonly(loading),
    staging: readonly(staging),
    problem: readonly(problem),
    observed: readonly(observed),
    removed: readonly(removed),
    entry,
    recoveryEntry,
    pending,
    busy,
    uncertain,
    canSubmit,
    canRecover,
    recoverySupported: recovery.supported,
    checking: computed(() => operations.checking.value || recovery.checking.value),
    open,
    submit,
    recover,
    reconcile,
    close: () => {
      visible.value = false
      recoveryConfirmation.value = false
    },
    resume: () => {
      visible.value = true
      recoveryConfirmation.value = false
    },
    openRecovery: () => {
      visible.value = true
      recoveryConfirmation.value = true
      if (!entry.value) preview.value = null
    },
    cancelRecovery: () => {
      recoveryConfirmation.value = false
    },
    reload: () => (target.value ? open(target.value) : Promise.resolve(false)),
    pause,
    reset,
    bind(value: string) {
      if (identity !== value) reset()
      identity = value
      operations.bind(value)
      recovery.bind(value)
    },
    dispose() {
      reset()
      operations.dispose()
      recovery.dispose()
    },
  }
}
export type NetworkDeletion = ReturnType<typeof createNetworkDeletion>
export const networkDeletionKey: InjectionKey<NetworkDeletion> = Symbol('network-deletion')
export function useNetworkDeletion() {
  const model = inject(networkDeletionKey)
  if (!model) throw new Error('Network deletion is not provided')
  return model
}
