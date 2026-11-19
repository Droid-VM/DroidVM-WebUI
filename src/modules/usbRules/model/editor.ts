import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import { createOperations } from '../../tasks'
import type {
  UsbRule,
  UsbRulesDocument,
  UsbRulesGateway,
  UsbRuleTarget,
  RulesSnapshot,
  RulesCommit,
  UsbRulesPreview,
} from '../api/gateway'
import { deviceSubject, documentIssues, normalizedRules, type RuleLayer } from './document'

const copy = (rules: UsbRulesDocument): UsbRulesDocument => JSON.parse(JSON.stringify(rules))
const key = 'usb-rules'
export function createUsbRulesEditor(gateway?: UsbRulesGateway, newId = requestId) {
  const baseline = shallowRef<RulesSnapshot | null>(null)
  const observed = shallowRef<RulesSnapshot | null>(null)
  const draft = ref<UsbRulesDocument | null>(null)
  const targets = shallowRef<UsbRuleTarget[]>([])
  const previewData = shallowRef<UsbRulesPreview | null>(null)
  const previewProblem = ref<ApiProblem | null>(null),
    previewLoading = ref(false),
    previewTime = ref(0)
  let previewRequest: AbortController | undefined
  const problem = ref<ApiProblem | null>(null),
    targetProblem = ref<ApiProblem | null>(null)
  const loading = ref(false),
    staging = ref(false),
    targetLoading = ref(false),
    blocked = ref(false),
    saved = ref(false)
  let generation = 0,
    identity: string | null = null
  const reads = new Set<AbortController>()
  const operations = createOperations<RulesCommit>(gateway, observe, gateway?.tracking)
  const entry = computed(() => operations.entries.value[key] ?? null)
  const pending = computed(() => !!entry.value && entry.value.state !== 'done')
  const busy = computed(() => loading.value || staging.value || pending.value)
  const dirty = computed(
    () => !!draft.value && JSON.stringify(draft.value) !== JSON.stringify(baseline.value?.rules),
  )
  const issues = computed(() => (draft.value ? documentIssues(draft.value) : []))
  const editable = computed(
    () =>
      operations.supported.value &&
      !operations.recoveryProblem.value &&
      !!draft.value &&
      !busy.value &&
      !blocked.value,
  )
  const canSave = computed(
    () =>
      editable.value &&
      (dirty.value || baseline.value?.persistence !== 'persisted') &&
      !issues.value.length,
  )
  const protectedDraft = computed(() => dirty.value || staging.value || pending.value)
  const previewSupported = computed(
    () => operations.supported.value && !!gateway?.previewSupported(),
  )
  const canPreview = computed(
    () =>
      previewSupported.value &&
      !!baseline.value &&
      !dirty.value &&
      !busy.value &&
      !blocked.value &&
      !previewLoading.value,
  )
  function clearPreview() {
    previewRequest?.abort()
    previewRequest = undefined
    previewData.value = null
    previewProblem.value = null
    previewLoading.value = false
    previewTime.value = 0
  }
  async function preview() {
    if (!gateway || !canPreview.value || !baseline.value) return
    clearPreview()
    const current = baseline.value,
      controller = new AbortController(),
      epoch = generation
    previewRequest = controller
    previewLoading.value = true
    try {
      const result = await gateway.preview(current.revision, controller.signal)
      if (epoch !== generation || previewRequest !== controller) return
      if (result.revision !== current.revision || result.enabled !== current.rules.enabled)
        throw new ApiError('invalid-response', 'Preview version changed')
      // Validate returned references against the observed document, without
      // implementing VM availability, priority or failed-target matching here.
      for (const { device, match } of result.items) {
        if (!match?.layer) continue
        const rule = current.rules[match.layer]?.[match.index],
          subject = deviceSubject(device)
        if (
          !rule ||
          rule.target !== match.target ||
          (rule.vm ?? null) !== match.vmId ||
          (rule.controller ?? null) !== match.controllerId ||
          (rule.id !== undefined && rule.id !== subject.id) ||
          (rule.port !== undefined && rule.port !== subject.port)
        )
          throw new ApiError('invalid-response', 'Preview refers to another rule')
      }
      previewData.value = result
      previewTime.value = Date.now()
    } catch (cause) {
      if (epoch === generation && previewRequest === controller)
        previewProblem.value = describeApiError(cause)
    } finally {
      if (previewRequest === controller) {
        previewLoading.value = false
        previewRequest = undefined
      }
    }
  }

  async function read(replace: boolean) {
    if (!gateway || loading.value || !operations.supported.value) return false
    const controller = new AbortController(),
      epoch = generation
    reads.add(controller)
    loading.value = true
    problem.value = null
    try {
      const snapshot = await gateway.read(controller.signal)
      if (epoch !== generation) return false
      observed.value = snapshot
      if (replace) {
        baseline.value = snapshot
        draft.value = copy(snapshot.rules)
        blocked.value = false
      }
      return true
    } catch (cause) {
      if (epoch === generation) problem.value = describeApiError(cause)
      return false
    } finally {
      reads.delete(controller)
      if (epoch === generation) loading.value = false
    }
  }
  async function observe() {
    const success = entry.value?.task?.state === 'succeeded'
    // A failed/uncertain write must never replace the user's draft or rebase it.
    if (!success) blocked.value = true
    const fresh = await read(success)
    if (fresh && success && observed.value?.persistence !== 'persisted') {
      blocked.value = true
      return false
    }
    if (fresh && success) saved.value = true
    return fresh
  }
  async function reload() {
    if (staging.value || pending.value) return false
    clearPreview()
    const fresh = await read(true)
    if (fresh) {
      operations.reset()
      if (identity) operations.bind(identity)
      saved.value = false
    }
    return fresh
  }
  async function refreshTargets() {
    if (!gateway || targetLoading.value || !operations.supported.value) return false
    const controller = new AbortController(),
      epoch = generation
    reads.add(controller)
    targetLoading.value = true
    try {
      const value = await gateway.targets(controller.signal)
      if (epoch !== generation) return false
      targets.value = value
      targetProblem.value = null
      return true
    } catch (cause) {
      if (epoch === generation) targetProblem.value = describeApiError(cause)
      return false
    } finally {
      reads.delete(controller)
      if (epoch === generation) targetLoading.value = false
    }
  }
  async function save() {
    if (!gateway || !canSave.value || !draft.value || !baseline.value) return
    clearPreview()
    const epoch = generation,
      controller = new AbortController()
    const json = JSON.stringify(normalizedRules(draft.value)),
      revision = baseline.value.revision
    reads.add(controller)
    staging.value = true
    saved.value = false
    problem.value = null
    let uploadId: string | undefined,
      submitted = false
    try {
      uploadId = await gateway.stage(revision, json, controller.signal)
      if (epoch !== generation) return
      const request = { uploadId, requestId: newId() }
      submitted = true
      await operations.submit(key, request)
    } catch (cause) {
      if (epoch === generation) {
        problem.value = describeApiError(cause)
        blocked.value =
          problem.value.code === 'conflict' || problem.value.code === 'context-changed'
      }
    } finally {
      reads.delete(controller)
      if (epoch === generation) staging.value = false
      if (uploadId && !submitted) {
        try {
          await gateway.abort(uploadId, new AbortController().signal)
        } catch {
          /* Bounded lease. */
        }
      }
    }
  }
  function change(update: (rules: UsbRulesDocument) => void) {
    if (!editable.value || !draft.value) return
    clearPreview()
    update(draft.value)
    saved.value = false
  }
  function pause() {
    generation++
    clearPreview()
    reads.forEach((controller) => controller.abort())
    reads.clear()
    loading.value = staging.value = targetLoading.value = false
    operations.pause()
  }
  function reset(preserveTracking = false) {
    pause()
    operations.reset(preserveTracking)
    baseline.value = observed.value = draft.value = null
    targets.value = []
    problem.value = targetProblem.value = null
    blocked.value = saved.value = false
    identity = null
  }
  return {
    preview,
    previewSupported,
    canPreview,
    previewData: readonly(previewData),
    previewProblem: readonly(previewProblem),
    previewLoading: readonly(previewLoading),
    previewTime: readonly(previewTime),
    draft: readonly(draft),
    observed: readonly(observed),
    targets: readonly(targets),
    problem: readonly(problem),
    targetProblem: readonly(targetProblem),
    loading: readonly(loading),
    staging: readonly(staging),
    targetLoading: readonly(targetLoading),
    blocked: readonly(blocked),
    saved: readonly(saved),
    supported: operations.supported,
    entry,
    pending,
    busy,
    dirty,
    issues,
    editable,
    canSave,
    protectedDraft,
    checking: operations.checking,
    recoveryProblem: operations.recoveryProblem,
    clearTracking: operations.clearTracking,
    reconcile: operations.reconcile,
    reload,
    save,
    refreshTargets,
    async open() {
      if (entry.value?.restored) {
        await operations.reconcile()
        return refreshTargets()
      }
      const results = await Promise.all([
        draft.value ? Promise.resolve(true) : reload(),
        refreshTargets(),
      ])
      return results.every(Boolean)
    },
    enabled(value: boolean) {
      change((rules) => {
        rules.enabled = value
      })
    },
    add(layer: RuleLayer) {
      change((rules) => {
        ;(rules[layer] ??= []).push({
          target: layer === 'any' ? 'sink' : 'host',
          ...(layer === 'exact' || layer === 'device' ? { id: '' } : {}),
          ...(layer === 'exact' || layer === 'port' ? { port: '' } : {}),
          ...(layer === 'class' ? { class: '' } : {}),
        })
      })
    },
    update(layer: RuleLayer, index: number, value: UsbRule) {
      change((rules) => {
        const list = rules[layer]
        if (list?.[index]) list[index] = { ...value }
      })
    },
    remove(layer: RuleLayer, index: number) {
      change((rules) => {
        rules[layer]?.splice(index, 1)
      })
    },
    move(layer: RuleLayer, index: number, direction: -1 | 1) {
      change((rules) => {
        const list = rules[layer],
          other = index + direction
        if (!list?.[index] || !list[other]) return
        ;[list[index], list[other]] = [list[other], list[index]]
      })
    },
    exportJson: () => JSON.stringify(draft.value, null, 2),
    pause,
    reset,
    bind(value: string) {
      if (identity !== value) reset(true)
      identity = value
      operations.bind(value)
    },
    dispose() {
      reset(true)
      operations.dispose()
    },
  }
}
export type UsbRulesEditor = ReturnType<typeof createUsbRulesEditor>
export const usbRulesEditorKey: InjectionKey<UsbRulesEditor> = Symbol('usb-rules-editor')
export function useUsbRulesEditor() {
  const editor = inject(usbRulesEditorKey)
  if (!editor) throw new Error('USB rules editor is not provided')
  return editor
}
