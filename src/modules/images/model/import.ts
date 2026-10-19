import { computed, inject, readonly, ref, shallowRef, watch, type InjectionKey } from 'vue'
import { requestId } from '../../../shared/api/requestId'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { validHostPath } from '../../../shared/lib/hostPath'
import { createOperations } from '../../tasks'
import type { ImageImportGateway, ImageImportPlan } from '../api/import'

/** App-owned navigation into resources; it prepares a new review and never submits a rewrite. */
export type ImageOptimizeOpener = (diskId: string) => Promise<void>

export function createImageImport(
  gateway: ImageImportGateway | undefined,
  refresh: () => Promise<boolean>,
  newId = requestId,
  openOptimize?: ImageOptimizeOpener,
) {
  const previews = createOperations(gateway?.preview, async () => true)
  const operations = createOperations(gateway, refresh)
  const source = ref(''),
    acknowledged = ref(false),
    outcomeAcknowledged = ref(false)
  const plan = shallowRef<ImageImportPlan | null>(null),
    planRequestId = ref<string | null>(null)
  let identity: string | null = null,
    activePlanRequest: string | null = null,
    generation = 0
  const previewEntry = computed(() => previews.entries.value.preview ?? null)
  const entry = computed(() => operations.entries.value.import ?? null)
  const pending = computed(() =>
    [previewEntry.value, entry.value].some((row) => row && row.state !== 'done'),
  )
  const checking = computed(() => previews.checking.value || operations.checking.value)
  const canPreview = computed(
    () => previews.supported.value && !pending.value && !entry.value && validHostPath(source.value),
  )
  const canSubmit = computed(
    () =>
      operations.supported.value &&
      !pending.value &&
      !entry.value &&
      !!plan.value &&
      !!planRequestId.value &&
      acknowledged.value,
  )
  const result = computed(() => entry.value?.task?.imageImport ?? null)
  const succeeded = computed(
    () =>
      entry.value?.state === 'done' &&
      entry.value.task?.state === 'succeeded' &&
      !!result.value?.registered &&
      !result.value.registrationUncertain &&
      !result.value.recoveryRequired,
  )
  const recoveryRequired = computed(
    () => !!(result.value?.registrationUncertain || result.value?.recoveryRequired),
  )
  const openingOptimize = ref(false),
    reviewingOutcome = ref(false)
  const optimizeProblem = shallowRef<ApiProblem | null>(null)
  const optimizeAvailable = computed(
    () => !!openOptimize && operations.supported.value && succeeded.value && !!result.value?.diskId,
  )
  const canOptimize = computed(
    () => optimizeAvailable.value && !openingOptimize.value && !reviewingOutcome.value,
  )
  const canRestart = computed(
    () =>
      operations.supported.value &&
      !pending.value &&
      !!entry.value &&
      outcomeAcknowledged.value &&
      !openingOptimize.value,
  )
  const restartProblem = shallowRef<ApiProblem | null>(null)
  async function optimize() {
    const diskId = result.value?.diskId
    if (!canOptimize.value || !diskId || !openOptimize) return
    const epoch = generation
    openingOptimize.value = true
    optimizeProblem.value = null
    try {
      // Only the confirmed result ID crosses the module boundary. Plan revisions,
      // paths and task revisions cannot authorize the next disk mutation.
      await openOptimize(diskId)
    } catch (cause) {
      if (epoch === generation) optimizeProblem.value = describeApiError(cause)
    } finally {
      if (epoch === generation) openingOptimize.value = false
    }
  }
  function clearPlan() {
    plan.value = null
    planRequestId.value = null
    activePlanRequest = null
    acknowledged.value = false
  }
  const stopSource = watch(source, clearPlan, { flush: 'sync' })
  function applyPreview() {
    const current = previewEntry.value
    if (
      !current ||
      current.state !== 'done' ||
      current.task?.state !== 'succeeded' ||
      !current.task.imageImportPlan ||
      current.request.requestId !== activePlanRequest ||
      current.request.source !== source.value
    )
      return
    if (planRequestId.value === current.request.requestId) return
    plan.value = current.task.imageImportPlan
    planRequestId.value = current.request.requestId
    acknowledged.value = false
  }
  async function readPreview() {
    if (!canPreview.value) return
    clearPlan()
    const request = { requestId: newId(), source: source.value }
    activePlanRequest = request.requestId
    await previews.submit('preview', request)
    applyPreview()
  }
  async function submit() {
    if (!canSubmit.value || !planRequestId.value) return
    const request = { requestId: newId(), planRequestId: planRequestId.value }
    acknowledged.value = false
    outcomeAcknowledged.value = false
    await operations.submit('import', request)
  }
  async function reconcile() {
    await previews.reconcile()
    applyPreview()
    await operations.reconcile()
    return true
  }
  async function restart() {
    if (!canRestart.value || reviewingOutcome.value) return
    const epoch = generation
    reviewingOutcome.value = true
    restartProblem.value = null
    try {
      const fresh = await refresh()
      if (epoch !== generation) return
      if (!fresh) throw new ApiError('unavailable', 'Cannot refresh registration state')
      operations.reset()
      previews.reset()
      clearPlan()
      outcomeAcknowledged.value = false
      optimizeProblem.value = null
    } catch (cause) {
      if (epoch === generation) restartProblem.value = describeApiError(cause)
    } finally {
      if (epoch === generation) reviewingOutcome.value = false
    }
  }
  function pause() {
    generation++
    acknowledged.value = false
    outcomeAcknowledged.value = false
    reviewingOutcome.value = false
    restartProblem.value = null
    openingOptimize.value = false
    optimizeProblem.value = null
    previews.pause()
    operations.pause()
  }
  function reset() {
    pause()
    previews.reset()
    operations.reset()
    clearPlan()
    source.value = ''
    identity = null
  }
  return {
    acceptSource(path: string) {
      if (!operations.supported.value || pending.value || entry.value || !validHostPath(path))
        return false
      clearPlan()
      source.value = path
      return true
    },
    supported: operations.supported,
    source,
    acknowledged,
    outcomeAcknowledged,
    plan: readonly(plan),
    previewEntry,
    entry,
    pending,
    checking,
    canPreview,
    canSubmit,
    result,
    succeeded,
    recoveryRequired,
    optimizeAvailable,
    canOptimize,
    openingOptimize: readonly(openingOptimize),
    optimizeProblem: readonly(optimizeProblem),
    optimize,
    canRestart,
    reviewingOutcome: readonly(reviewingOutcome),
    restartProblem: readonly(restartProblem),
    readPreview,
    submit,
    reconcile,
    restart,
    pause,
    reset,
    leave() {
      acknowledged.value = false
      outcomeAcknowledged.value = false
    },
    bind(value: string) {
      if (identity === value) return
      if (identity !== value) reset()
      identity = value
      previews.bind(value)
      operations.bind(value)
    },
    dispose() {
      reset()
      stopSource()
      previews.dispose()
      operations.dispose()
    },
  }
}
export type ImageImport = ReturnType<typeof createImageImport>
export const imageImportKey: InjectionKey<ImageImport> = Symbol('image-import')
export function useImageImport() {
  const value = inject(imageImportKey)
  if (!value) throw new Error('Image import is not provided')
  return value
}
