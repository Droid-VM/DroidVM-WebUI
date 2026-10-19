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
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import type { PackageExportGateway, PackageExportPlan, PackageExportRequest } from '../api/export'
import { exportDraft, exportOperation } from './exportForm'

export function createPackageExport(
  gateway: PackageExportGateway | undefined,
  refresh: () => Promise<boolean>,
  newId = requestId,
) {
  const operations = createOperations(gateway, refresh, gateway?.tracking)
  const draft = reactive(exportDraft())
  const target = ref<string | null>(null),
    plan = shallowRef<PackageExportPlan | null>(null)
  const problem = shallowRef<ApiProblem | null>(null),
    loading = ref(false)
  const review = shallowRef<Omit<PackageExportRequest, 'requestId'> | null>(null)
  const acknowledged = ref(false)
  let controller: AbortController | undefined,
    generation = 0,
    identity: string | null = null,
    initialized = false
  const entry = computed(() => operations.entries.value.export ?? null)
  const pending = computed(() => !!entry.value && entry.value.state !== 'done')
  const valid = computed(() => (plan.value ? exportOperation(draft, plan.value) : null))
  const allowed = computed(() => operations.allowed('export') && !loading.value)
  function cancelReview() {
    review.value = null
    acknowledged.value = false
  }
  const stopDraftWatch = watch(draft, cancelReview, { deep: true, flush: 'sync' })
  function leave() {
    generation++
    controller?.abort()
    loading.value = false
    plan.value = null
    cancelReview()
  }
  async function prepare(id = target.value) {
    if (!id || !gateway || !allowed.value) return false
    leave()
    if (target.value !== id) {
      target.value = id
      draft.disks = []
      initialized = false
    }
    const current = new AbortController(),
      epoch = generation
    controller = current
    loading.value = true
    problem.value = null
    try {
      const value = await gateway.plan(id, current.signal)
      if (current.signal.aborted || epoch !== generation) return false
      plan.value = value
      if (!initialized) {
        draft.disks = value.disks.map((row) => row.index)
        initialized = true
      }
      return true
    } catch (cause) {
      if (!current.signal.aborted && epoch === generation) problem.value = describeApiError(cause)
      return false
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  function reviewDraft() {
    if (!plan.value || !valid.value || !allowed.value) return
    const baseline = plan.value
    review.value = {
      vmId: baseline.vmId,
      vmRevision: baseline.vmRevision,
      diskRevision: baseline.diskRevision,
      networkRevision: baseline.networkRevision,
      operation: valid.value,
    }
    acknowledged.value = false
  }
  async function submit() {
    if (!review.value || !acknowledged.value || !allowed.value) return
    const request: PackageExportRequest = {
      ...review.value,
      requestId: newId(),
      operation: { ...review.value.operation, disks: [...review.value.operation.disks] },
    }
    leave()
    problem.value = null
    await operations.submit('export', request)
  }
  function pause() {
    leave()
    operations.pause()
  }
  function clearLocal() {
    pause()
    target.value = null
    initialized = false
    identity = null
    problem.value = null
    Object.assign(draft, exportDraft())
  }
  function reset() {
    clearLocal()
    operations.reset()
  }
  return {
    supported: operations.supported,
    allowed,
    pending,
    entry,
    checking: operations.checking,
    recoveryProblem: operations.recoveryProblem,
    clearTracking: operations.clearTracking,
    draft,
    target: readonly(target),
    plan: readonly(plan),
    problem: readonly(problem),
    loading: readonly(loading),
    review: readonly(review),
    acknowledged,
    valid,
    prepare,
    reviewDraft,
    cancelReview,
    submit,
    leave,
    reconcile: operations.reconcile,
    pause,
    reset,
    bind(value: string) {
      if (identity === value) return
      clearLocal()
      identity = value
      operations.bind(value)
      target.value = entry.value?.request.vmId ?? null
    },
    dispose() {
      clearLocal()
      stopDraftWatch()
      operations.dispose()
    },
  }
}
export type PackageExport = ReturnType<typeof createPackageExport>
export const packageExportKey: InjectionKey<PackageExport> = Symbol('package-export')
export function usePackageExport() {
  const value = inject(packageExportKey)
  if (!value) throw new Error('Package export is not provided')
  return value
}
