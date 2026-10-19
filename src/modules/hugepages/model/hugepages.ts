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
import type {
  HugepageGateway,
  HugepageObservation,
  HugepageOperation,
  HugepageRequest,
} from '../api/http'

export const advancedFields = [
  {
    key: 'system_reserve_mb',
    label: 'hugepagesAdvancedSystemReserve',
    hint: 'hugepagesAdvancedSystemReserveHint',
    minimum: 64n,
    maximum: 1048576n,
  },
  {
    key: 'cma_reservoir_floor_mb',
    label: 'hugepagesAdvancedCmaFloor',
    hint: 'hugepagesAdvancedCmaFloorHint',
    minimum: 0n,
    maximum: 1048576n,
  },
  {
    key: 'boot_acquire',
    label: 'hugepagesAdvancedBootAcquire',
    hint: 'hugepagesAdvancedBootAcquireHint',
    minimum: 0n,
    maximum: 3n,
  },
  {
    key: 'boot_acquire_runs',
    label: 'hugepagesAdvancedBootRuns',
    hint: 'hugepagesAdvancedBootRunsHint',
    minimum: 1n,
    maximum: 99n,
  },
  {
    key: 'boot_acquire_wait',
    label: 'hugepagesAdvancedBootWait',
    hint: 'hugepagesAdvancedBootWaitHint',
    minimum: 0n,
    maximum: 3600n,
  },
] as const
type AdvancedKey = (typeof advancedFields)[number]['key']
export const hugepageGroups = [
  'overview',
  'reserve',
  'module',
  'cma',
  'advanced',
  'maintenance',
] as const

export function createHugepages(gateway?: HugepageGateway, newId = requestId) {
  const status = shallowRef<HugepageObservation | null>(null),
    problem = shallowRef<ApiProblem | null>(null)
  const loading = ref(false),
    fresh = ref(false),
    acknowledged = ref(false)
  const draft = reactive({
    pool: '',
    cma: '',
    cmaTrial: '',
    lever: 'none' as 'none' | 'flag' | 'hook',
    advanced: Object.fromEntries(advancedFields.map((field) => [field.key, ''])) as Record<
      AdvancedKey,
      string
    >,
  })
  const confirmRisk = ref(false)
  const review = shallowRef<Omit<HugepageRequest, 'requestId'> | null>(null)
  const supported = computed(() => !!gateway?.readable())
  const management = computed(() => !!gateway?.management())
  let identity: string | null = null,
    generation = 0,
    controller: AbortController | undefined
  let timer: ReturnType<typeof setInterval> | undefined,
    ticking = false,
    active = false,
    failureUntil = 0
  const operations = createOperations(gateway, refresh, gateway?.tracking)
  const entry = computed(() => operations.entries.value.hugepages ?? null)
  const receipt = computed(() => entry.value?.task?.hugepageResult ?? null)
  const unresolvedReceipt = computed(
    () =>
      !!entry.value?.task &&
      ['succeeded', 'failed', 'cancelled'].includes(entry.value.task.state) &&
      (!receipt.value ||
        receipt.value.uncertain ||
        (entry.value.task.state !== 'succeeded' && (receipt.value.saved || receipt.value.applied))),
  )
  const pending = computed(
    () =>
      !!entry.value &&
      (entry.value.state !== 'done' || (unresolvedReceipt.value && !acknowledged.value)),
  )
  const editable = computed(
    () =>
      operations.supported.value &&
      fresh.value &&
      !loading.value &&
      status.value?.busy === false &&
      operations.allowed('hugepages') &&
      (!unresolvedReceipt.value || acknowledged.value),
  )
  const number = (value: string) =>
    /^(0|[1-9][0-9]{0,9})$/.test(value) && BigInt(value) <= 1073741824n
  const valid = computed(
    () =>
      number(draft.pool) &&
      (draft.cma === '' || number(draft.cma)) &&
      (draft.cma === '' || draft.cma === '0' || BigInt(draft.cma) >= BigInt(draft.pool)) &&
      (status.value?.consumerPages === null ||
        status.value?.consumerPages === undefined ||
        BigInt(draft.pool) >= BigInt(status.value.consumerPages)),
  )
  const dirty = computed(
    () =>
      !!status.value &&
      (draft.pool !== (status.value.savedPoolPages ?? '') ||
        draft.cma !== (status.value.savedCmaPages ?? '')),
  )
  function cancelReview() {
    review.value = null
    confirmRisk.value = false
  }
  const stopDraft = watch(draft, cancelReview, { flush: 'sync' })
  async function refresh(replaceDraft = false) {
    if (!gateway || !supported.value || loading.value) return false
    const epoch = generation,
      current = new AbortController()
    controller = current
    loading.value = true
    const hadData = !!status.value
    try {
      const value = await gateway.read(current.signal)
      if (current.signal.aborted || epoch !== generation) return false
      if (status.value?.fingerprint !== value.fingerprint) cancelReview()
      status.value = value
      fresh.value = true
      problem.value = null
      failureUntil = 0
      if (replaceDraft || !hadData) {
        draft.pool = value.savedPoolPages ?? value.actualPoolPages ?? ''
        draft.cma = value.savedCmaPages ?? value.actualCmaPages ?? ''
        draft.cmaTrial =
          value.actualCmaPages !== null && value.actualCmaPages !== '0'
            ? value.actualCmaPages
            : (value.cma?.savedLastPages ?? value.savedCmaPages ?? value.actualPoolPages ?? '')
        draft.lever = value.cma?.savedLever ?? 'none'
        for (const field of advancedFields)
          draft.advanced[field.key] =
            value.advanced?.find((item) => item.key === field.key)?.saved ?? ''
      }
      return true
    } catch (cause) {
      if (!current.signal.aborted && epoch === generation) {
        problem.value = describeApiError(cause)
        fresh.value = false
        failureUntil = Date.now() + 60000
        cancelReview()
      }
      return false
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  function validAdvanced(key: AdvancedKey, value: string) {
    if (value === '') return true
    const field = advancedFields.find((item) => item.key === key)
    return (
      !!field &&
      /^(0|[1-9][0-9]{0,6})$/.test(value) &&
      BigInt(value) >= field.minimum &&
      BigInt(value) <= field.maximum
    )
  }
  function canPrepare(operation: HugepageOperation) {
    const value = status.value
    if (!editable.value || !value) return false
    const base = ['targets', 'acquire', 'stop-acquire'].includes(operation.kind)
    if (!base && !management.value) return false
    switch (operation.kind) {
      case 'targets':
        return (
          number(operation.poolPages) &&
          (operation.cmaPages === null || number(operation.cmaPages)) &&
          value.installed === true &&
          (operation.cmaPages === null ||
            operation.cmaPages === '0' ||
            BigInt(operation.cmaPages) >= BigInt(operation.poolPages)) &&
          value.consumerPages !== null &&
          BigInt(operation.poolPages) >= BigInt(value.consumerPages)
        )
      case 'acquire':
        return (
          value.loaded === true &&
          value.acquireActive === false &&
          value.features?.acquire !== false
        )
      case 'stop-acquire':
        return (
          value.loaded === true &&
          value.acquireActive === true &&
          value.features?.stopAcquire !== false
        )
      case 'runtime':
        return (
          value.installed === true &&
          (operation.enabled || (value.loaded === true && value.consumerCount === 0))
        )
      case 'unload':
        return value.loaded === true && value.consumerCount === 0
      case 'boot':
        return value.installed === true && value.bootEnabled !== null
      case 'cma':
        return (
          value.loaded === true &&
          value.hasCma === true &&
          number(operation.pages) &&
          (!operation.enabled ||
            (BigInt(operation.pages) > 0n &&
              value.features?.acquire === true &&
              value.actualPoolPages !== null &&
              BigInt(operation.pages) >= BigInt(value.actualPoolPages))) &&
          (!operation.persist ||
            operation.pages === '0' ||
            value.savedPoolPages === null ||
            BigInt(operation.pages) >= BigInt(value.savedPoolPages)) &&
          (operation.lever === null ||
            value.cma?.vendorAllowed === true ||
            (operation.lever === 'flag' ? value.features?.restrict : value.features?.gfpHook) ===
              true)
        )
      case 'cma-save':
        return (
          value.loaded === true &&
          value.hasCma === true &&
          number(operation.pages) &&
          BigInt(operation.pages) > 0n &&
          operation.pages === value.actualCmaPages &&
          (value.savedPoolPages === null ||
            BigInt(operation.pages) >= BigInt(value.savedPoolPages)) &&
          (operation.lever === null ||
            value.cma?.vendorAllowed === true ||
            (operation.lever === 'flag'
              ? value.cma?.restrictEnabled
              : value.cma?.gfpHookEnabled) === true)
        )
      case 'advanced':
        return (
          value.installed === true &&
          !!value.advanced?.some((item) => item.key === operation.key) &&
          validAdvanced(operation.key, operation.value ?? '')
        )
      case 'reconcile':
        return value.loaded === true && value.features?.reconcile === true
      case 'migrate-settings':
        return value.installed === true && value.hasLegacySettings === true
      case 'dismiss-crash':
        return value.installed === true && value.hasCrash === true
    }
  }
  function prepare(operation: HugepageOperation) {
    if (!canPrepare(operation) || !status.value) return
    confirmRisk.value = false
    review.value = {
      expected: { fingerprint: status.value.fingerprint },
      operation: structuredClone(operation),
    }
  }
  const requiresRiskConfirmation = computed(() => {
    const operation = review.value?.operation
    return (
      operation?.kind === 'unload' ||
      (operation?.kind === 'advanced' && operation.key === 'system_reserve_mb') ||
      (operation?.kind === 'cma' && operation.enabled && operation.lever !== null)
    )
  })
  async function submit() {
    if (
      !editable.value ||
      !review.value ||
      !canPrepare(review.value.operation) ||
      (requiresRiskConfirmation.value && !confirmRisk.value) ||
      review.value.expected.fingerprint !== status.value?.fingerprint
    )
      return
    const request: HugepageRequest = { ...review.value, requestId: newId() }
    cancelReview()
    acknowledged.value = false
    await operations.submit('hugepages', request)
  }
  async function tick() {
    if (
      !active ||
      ticking ||
      Date.now() < failureUntil ||
      (typeof document !== 'undefined' && document.hidden)
    )
      return
    ticking = true
    const epoch = generation
    try {
      await operations.reconcile()
      if (epoch === generation) await refresh()
    } finally {
      ticking = false
    }
  }
  function stop() {
    active = false
    if (timer) clearInterval(timer)
    timer = undefined
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', visibility)
    pause()
  }
  function pause() {
    generation++
    controller?.abort()
    loading.value = false
    fresh.value = false
    cancelReview()
    operations.pause()
  }
  function visibility() {
    if (document.hidden) pause()
    else {
      failureUntil = 0
      void tick()
    }
  }
  function clearState() {
    pause()
    status.value = null
    problem.value = null
    identity = null
    acknowledged.value = false
    draft.pool = ''
    draft.cma = ''
    draft.cmaTrial = ''
    draft.lever = 'none'
    for (const field of advancedFields) draft.advanced[field.key] = ''
    failureUntil = 0
  }
  function reset() {
    clearState()
    operations.reset()
  }
  return {
    status: readonly(status),
    problem: readonly(problem),
    loading: readonly(loading),
    fresh: readonly(fresh),
    supported,
    management,
    editable,
    draft,
    valid,
    dirty,
    review: readonly(review),
    pending,
    entry,
    receipt,
    acknowledged,
    unresolvedReceipt,
    checking: operations.checking,
    recoveryProblem: operations.recoveryProblem,
    clearTracking() {
      // Clearing storage must not substitute for reviewing a partial native
      // receipt. Keep its entry and existing explicit acknowledgement flow.
      if (unresolvedReceipt.value && !acknowledged.value) return
      cancelReview()
      operations.clearTracking()
    },
    cancelReview,
    prepare,
    canPrepare,
    confirmRisk,
    requiresRiskConfirmation,
    validAdvanced,
    advancedFields,
    saveAdvanced: (key: AdvancedKey) =>
      prepare({ kind: 'advanced', key, value: draft.advanced[key] || null }),
    trialCma: () =>
      prepare({
        kind: 'cma',
        enabled: true,
        pages: draft.cmaTrial,
        persist: false,
        lever: draft.lever === 'none' ? null : draft.lever,
      }),
    saveCma: () =>
      prepare({
        kind: 'cma-save',
        pages: status.value?.actualCmaPages ?? '',
        lever: draft.lever === 'none' ? null : draft.lever,
      }),
    submit,
    saveTargets: () =>
      prepare({
        kind: 'targets',
        poolPages: draft.pool,
        cmaPages: draft.cma || null,
        persist: true,
      }),
    refresh: () => refresh(),
    reloadDraft: () => refresh(true),
    reconcile: operations.reconcile,
    activate() {
      if (active) return
      active = true
      failureUntil = 0
      timer = setInterval(tick, 3000)
      document.addEventListener('visibilitychange', visibility)
      void tick()
    },
    deactivate: stop,
    pause,
    reset,
    bind(value: string) {
      if (identity !== value) clearState()
      identity = value
      operations.bind(value)
      if (active) void tick()
    },
    dispose() {
      stop()
      clearState()
      stopDraft()
      operations.dispose()
    },
  }
}
export type Hugepages = ReturnType<typeof createHugepages>
export const hugepagesKey: InjectionKey<Hugepages> = Symbol('hugepages')
export function useHugepages() {
  const value = inject(hugepagesKey)
  if (!value) throw new Error('Hugepages is not provided')
  return value
}
