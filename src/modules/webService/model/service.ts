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
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import { createOperations } from '../../tasks'
import type { WebServiceGateway, WebServiceRequest, WebServiceStatus } from '../api/http'
import {
  cloneWebSettings,
  parseWebSettings,
  sameWebSettings,
  webServiceDraft,
  type WebServiceSettings,
} from '../lib/settings'

export function createWebService(gateway: WebServiceGateway | undefined, newId = requestId) {
  const status = shallowRef<WebServiceStatus | null>(null),
    baseline = shallowRef<WebServiceSettings | null>(null)
  const draft = reactive(webServiceDraft()),
    problem = shallowRef<ApiProblem | null>(null)
  const loading = ref(false),
    fresh = ref(false),
    acknowledged = ref(false),
    outcomeAcknowledged = ref(false)
  const review = shallowRef<Omit<WebServiceRequest, 'requestId'> | null>(null)
  const observedFor = ref<string | null>(null),
    reviewedFor = ref<string | null>(null)
  let generation = 0,
    identity: string | null = null,
    readSerial = 0,
    controller: AbortController | undefined
  const operations = createOperations(gateway, () => readStatus(false))
  const entry = computed(() => operations.entries.value.service ?? null)
  const locked = computed(
    () => !!entry.value && reviewedFor.value !== entry.value.request.requestId && !applied.value,
  )
  const valid = computed(() => parseWebSettings(draft))
  const dirty = computed(
    () => !!baseline.value && (!valid.value || !sameWebSettings(baseline.value, valid.value)),
  )
  const editable = computed(
    () =>
      operations.supported.value &&
      operations.allowed('service') &&
      fresh.value &&
      !!baseline.value &&
      !loading.value &&
      !locked.value &&
      !status.value?.applyPending &&
      status.value?.error !== 'configuration_write_failed',
  )
  const applied = computed(() => {
    const current = entry.value,
      actual = status.value
    return (
      !!current &&
      current.task?.state === 'succeeded' &&
      !!actual &&
      fresh.value &&
      observedFor.value === current.request.requestId &&
      !actual.applyPending &&
      actual.error === null &&
      sameWebSettings(actual.settings, current.request.settings) &&
      (actual.settings.enabled
        ? actual.running && (actual.state === 'running' || actual.state === 'local_only')
        : !actual.running && actual.state === 'disabled')
    )
  })
  const pending = computed(
    () =>
      !!entry.value &&
      (entry.value.state !== 'done' ||
        (locked.value && !applied.value && !!status.value?.applyPending)),
  )
  const canRestartWorkflow = computed(
    () =>
      locked.value &&
      entry.value?.state === 'done' &&
      fresh.value &&
      observedFor.value === entry.value.request.requestId &&
      !loading.value &&
      !status.value?.applyPending &&
      status.value?.error !== 'configuration_write_failed' &&
      outcomeAcknowledged.value,
  )
  function cancelReview() {
    review.value = null
    acknowledged.value = false
  }
  const stopDraft = watch(draft, cancelReview, { deep: true, flush: 'sync' })
  async function readStatus(replaceDraft: boolean) {
    if (!gateway || !operations.supported.value || loading.value) return false
    cancelReview()
    outcomeAcknowledged.value = false
    const current = new AbortController(),
      epoch = generation,
      request = entry.value?.request.requestId ?? null
    controller = current
    loading.value = true
    fresh.value = false
    readSerial++
    try {
      const value = await gateway.read(current.signal)
      if (current.signal.aborted || epoch !== generation) return false
      status.value = value
      fresh.value = true
      observedFor.value = request
      problem.value = null
      if (
        (replaceDraft && !locked.value) ||
        (applied.value && (!baseline.value || !sameWebSettings(baseline.value, value.settings)))
      ) {
        baseline.value = cloneWebSettings(value.settings)
        Object.assign(draft, webServiceDraft(value.settings))
      }
      return true
    } catch (cause) {
      if (!current.signal.aborted && epoch === generation) problem.value = describeApiError(cause)
      return false
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  function reviewAction(action: WebServiceRequest['action']) {
    if (
      !editable.value ||
      !baseline.value ||
      !valid.value ||
      (action === 'configure' && !dirty.value) ||
      (action === 'restart' && !baseline.value.enabled)
    )
      return
    review.value = {
      action,
      expected: cloneWebSettings(baseline.value),
      settings: cloneWebSettings(action === 'restart' ? baseline.value : valid.value),
    }
    acknowledged.value = false
  }
  async function submit() {
    if (!editable.value || !review.value || !acknowledged.value) return
    const request: WebServiceRequest = {
      ...review.value,
      requestId: newId(),
      expected: cloneWebSettings(review.value.expected),
      settings: cloneWebSettings(review.value.settings),
    }
    cancelReview()
    outcomeAcknowledged.value = false
    observedFor.value = null
    fresh.value = false
    await operations.submit('service', request)
  }
  async function reconcile() {
    const before = readSerial
    await operations.reconcile()
    if (readSerial === before && entry.value && entry.value.state !== 'posting')
      await readStatus(false)
    return !problem.value && !entry.value?.problem
  }
  function restartWorkflow() {
    if (!canRestartWorkflow.value || !entry.value || !status.value) return
    reviewedFor.value = entry.value.request.requestId
    baseline.value = cloneWebSettings(status.value.settings)
    Object.assign(draft, webServiceDraft(status.value.settings))
    cancelReview()
    outcomeAcknowledged.value = false
  }
  function pause() {
    generation++
    controller?.abort()
    loading.value = false
    fresh.value = false
    cancelReview()
    outcomeAcknowledged.value = false
    operations.pause()
  }
  function reset() {
    pause()
    operations.reset()
    status.value = null
    baseline.value = null
    problem.value = null
    observedFor.value = null
    reviewedFor.value = null
    identity = null
    Object.assign(draft, webServiceDraft())
  }
  return {
    supported: operations.supported,
    lanAutoLoginSupported: computed(() => gateway?.lanAutoLoginSupported?.() ?? false),
    status: readonly(status),
    draft,
    baseline: readonly(baseline),
    problem: readonly(problem),
    loading: readonly(loading),
    fresh: readonly(fresh),
    acknowledged,
    outcomeAcknowledged,
    review: readonly(review),
    valid,
    dirty,
    editable,
    applied,
    pending,
    locked,
    canRestartWorkflow,
    entry,
    checking: operations.checking,
    read: () => readStatus(true),
    reviewAction,
    cancelReview,
    submit,
    reconcile,
    restartWorkflow,
    leave: cancelReview,
    pause,
    reset,
    bind(value: string) {
      if (identity !== value) reset()
      identity = value
      operations.bind(value)
    },
    dispose() {
      reset()
      stopDraft()
      operations.dispose()
    },
  }
}
export type WebService = ReturnType<typeof createWebService>
export const webServiceKey: InjectionKey<WebService> = Symbol('web-service')
export function useWebService() {
  const value = inject(webServiceKey)
  if (!value) throw new Error('Web service is not provided')
  return value
}
