import {
  computed,
  inject,
  reactive,
  readonly,
  ref,
  shallowRef,
  watch,
  type InjectionKey,
} from 'vue'
import { createOperations } from '../../tasks'
import { requestId } from '../../../shared/api/requestId'
import type { PackageImportGateway, PackageImportPlan, PackageImportRequest } from '../api/import'
import { importDraft, importOperation, initialNetworks, validHostPath } from './importForm'

export function createPackageImport(
  gateway: PackageImportGateway | undefined,
  refresh: () => Promise<boolean>,
  newId = requestId,
) {
  const previews = createOperations(gateway?.preview, async () => true, gateway?.preview.tracking)
  const operations = createOperations(gateway, refresh, gateway?.tracking)
  const draft = reactive(importDraft())
  const plan = shallowRef<PackageImportPlan | null>(null),
    planRequestId = ref<string | null>(null)
  const review = shallowRef<Omit<PackageImportRequest, 'requestId'> | null>(null),
    acknowledged = ref(false)
  const recoveryAcknowledged = ref(false),
    recoveryReviewedFor = ref<string | null>(null)
  let identity: string | null = null,
    activePlanRequest: string | null = null,
    initialized = false
  const previewEntry = computed(() => previews.entries.value.preview ?? null)
  const entry = computed(() => operations.entries.value.import ?? null)
  const pending = computed(() =>
    [previewEntry.value, entry.value].some((row) => row && row.state !== 'done'),
  )
  const unresolved = computed(
    () =>
      !!(
        entry.value?.task?.packageImport?.registrationUncertain ||
        entry.value?.task?.packageImport?.recoveryRequired
      ),
  )
  const recoveryRequired = computed(
    () => unresolved.value && entry.value?.request.requestId !== recoveryReviewedFor.value,
  )
  const valid = computed(() => (plan.value ? importOperation(draft, plan.value) : null))
  const canPreview = computed(
    () =>
      previews.allowed('preview') &&
      !operations.recoveryProblem.value &&
      !pending.value &&
      validHostPath(draft.source),
  )
  const allowed = computed(
    () =>
      operations.allowed('import') &&
      !previews.recoveryProblem.value &&
      !pending.value &&
      !recoveryRequired.value,
  )
  function cancelReview() {
    review.value = null
    acknowledged.value = false
  }
  function clearPlan() {
    plan.value = null
    planRequestId.value = null
    activePlanRequest = null
    cancelReview()
  }
  const stopSource = watch(
    () => draft.source,
    () => {
      clearPlan()
      initialized = false
      draft.networks = []
    },
    { flush: 'sync' },
  )
  const stopDraft = watch(draft, cancelReview, { deep: true, flush: 'sync' })
  function applyPreview() {
    const current = previewEntry.value
    if (
      !current ||
      current.state !== 'done' ||
      current.task?.state !== 'succeeded' ||
      !current.task.packageImportPlan ||
      current.request.requestId !== activePlanRequest ||
      current.request.source !== draft.source ||
      entry.value?.request.planRequestId === current.request.requestId ||
      planRequestId.value === current.request.requestId
    )
      return
    plan.value = current.task.packageImportPlan
    planRequestId.value = current.request.requestId
    if (!initialized) {
      draft.networks = initialNetworks(plan.value)
      initialized = true
    }
  }
  async function readPreview() {
    if (!canPreview.value) return
    clearPlan()
    const request = { requestId: newId(), source: draft.source }
    activePlanRequest = request.requestId
    await previews.submit('preview', request)
    applyPreview()
  }
  async function reconcile() {
    await previews.reconcile()
    applyPreview()
    await operations.reconcile()
  }
  function resetNetworks() {
    if (plan.value) draft.networks = initialNetworks(plan.value)
  }
  function restartAfterReview() {
    if (
      pending.value ||
      entry.value?.state !== 'done' ||
      !entry.value.task ||
      !['failed', 'cancelled'].includes(entry.value.task.state) ||
      !recoveryRequired.value ||
      !recoveryAcknowledged.value
    )
      return
    recoveryReviewedFor.value = entry.value.request.requestId
    recoveryAcknowledged.value = false
    clearPlan()
  }
  function reviewDraft() {
    if (!plan.value || !planRequestId.value || !valid.value || !allowed.value) return
    review.value = { planRequestId: planRequestId.value, operation: valid.value }
    acknowledged.value = false
  }
  async function submit() {
    if (
      !review.value ||
      !acknowledged.value ||
      !allowed.value ||
      review.value.planRequestId !== planRequestId.value
    )
      return
    const request: PackageImportRequest = {
      ...review.value,
      requestId: newId(),
      operation: {
        ...review.value.operation,
        networks: review.value.operation.networks.map((row) => ({ ...row })),
      },
    }
    clearPlan()
    await operations.submit('import', request)
  }
  function pause() {
    cancelReview()
    recoveryAcknowledged.value = false
    previews.pause()
    operations.pause()
  }
  function clearLocal() {
    pause()
    clearPlan()
    identity = null
    initialized = false
    recoveryReviewedFor.value = null
    recoveryAcknowledged.value = false
    Object.assign(draft, importDraft())
  }
  function reset() {
    clearLocal()
    previews.reset()
    operations.reset()
  }
  function clearTracking() {
    if (unresolved.value) return
    operations.clearTracking()
  }
  return {
    supported: operations.supported,
    pending,
    canPreview,
    allowed,
    recoveryRequired,
    unresolved,
    recoveryProblem: operations.recoveryProblem,
    previewRecoveryProblem: previews.recoveryProblem,
    clearTracking,
    clearPreviewTracking: previews.clearTracking,
    draft,
    plan: readonly(plan),
    planRequestId: readonly(planRequestId),
    previewEntry,
    entry,
    checking: computed(() => previews.checking.value || operations.checking.value),
    review: readonly(review),
    acknowledged,
    valid,
    recoveryAcknowledged,
    restartAfterReview,
    readPreview,
    reconcile,
    resetNetworks,
    reviewDraft,
    cancelReview,
    submit,
    leave: cancelReview,
    pause,
    reset,
    bind(value: string) {
      if (identity === value) return
      clearLocal()
      identity = value
      previews.bind(value)
      operations.bind(value)
      const recovered = previewEntry.value
      if (recovered) {
        // The synchronous source watcher clears activePlanRequest, so restore
        // the source first. A plan already referenced by an import stays spent.
        draft.source = recovered.request.source
        if (entry.value?.request.planRequestId !== recovered.request.requestId)
          activePlanRequest = recovered.request.requestId
      }
    },
    dispose() {
      clearLocal()
      stopSource()
      stopDraft()
      previews.dispose()
      operations.dispose()
    },
  }
}
export type PackageImport = ReturnType<typeof createPackageImport>
export const packageImportKey: InjectionKey<PackageImport> = Symbol('package-import')
export function usePackageImport() {
  const value = inject(packageImportKey)
  if (!value) throw new Error('Package import is not provided')
  return value
}
