import { computed, inject, type InjectionKey } from 'vue'
import { requestId } from '../../../shared/api/requestId'
import { ApiError } from '../../../shared/api/errors'
import { compactCpuSet, cpuSet } from '../../../shared/lib/cpuSet'
import { createPreferenceEditor } from '../../hostPreferences'
import { createOperations } from '../../tasks'
import type { DiskOptimizationPreferences, OptimizationRememberState } from '../../resources'
import type { DiskDefaultGateway, DiskDefaultValues } from '../api/http'

export function createDiskDefaults(gateway?: DiskDefaultGateway, newId = requestId) {
  let editorBusy = () => false
  let refreshEditor = async () => true
  const rememberOperations = createOperations(
    gateway,
    () => refreshEditor(),
    gateway?.rememberTracking,
  )
  const rememberEntry = computed(
    () => rememberOperations.entries.value['optimize-compression'] ?? null,
  )
  const rememberReceipt = computed(() => rememberEntry.value?.task?.diskDefaultResult ?? null)
  const rememberPending = computed(
    () =>
      !!rememberEntry.value &&
      (rememberEntry.value.state !== 'done' || !!rememberReceipt.value?.uncertain),
  )
  const editor = createPreferenceEditor(
    {
      gateway,
      writeAllowed: () => !rememberPending.value && !rememberOperations.recoveryProblem.value,
      defaults: { optimizeCompression: 'ask', qemuImgCpus: [] } as DiskDefaultValues,
      resource: 'disk-defaults',
      receipt: (task) => task.diskDefaultResult,
      valid: (values) =>
        ['ask', 'none'].includes(values.optimizeCompression) &&
        values.qemuImgCpus.length <= 1024 &&
        new Set(values.qemuImgCpus).size === values.qemuImgCpus.length &&
        values.qemuImgCpus.every((id) => Number.isInteger(id) && id >= 0 && id <= 1023),
    },
    newId,
  )
  editorBusy = () =>
    editor.pending.value || !!editor.recoveryProblem.value || !!editor.status.value?.uncertain
  refreshEditor = editor.refresh
  const canRemember = () =>
    !!gateway?.supported() &&
    !editorBusy() &&
    !rememberPending.value &&
    rememberOperations.allowed('optimize-compression')
  const rememberState = computed<OptimizationRememberState>(() => {
    const entry = rememberEntry.value
    if (!entry) return { state: 'idle', expected: null, requestId: null, problem: null }
    const receipt = rememberReceipt.value
    const state =
      receipt?.uncertain || entry.state === 'unknown'
        ? 'unknown'
        : entry.state === 'done'
          ? entry.task?.state === 'succeeded' && receipt?.saved
            ? 'saved'
            : 'failed'
          : entry.state
    return {
      state,
      expected: { ...entry.request.expected },
      requestId: entry.request.requestId,
      problem: entry.problem,
    }
  })
  const optimization: DiskOptimizationPreferences = {
    async read(signal) {
      if (!gateway?.readable())
        return { expected: null, compression: 'ask', cpus: undefined, canRemember: false }
      const value = await gateway.read(signal)
      if (value.uncertain) throw new ApiError('commit-uncertain', 'Disk defaults are uncertain')
      return {
        expected: { ...value.expected },
        compression: value.values.optimizeCompression,
        cpus: [...value.values.qemuImgCpus],
        canRemember: canRemember(),
      }
    },
    async remember(expected) {
      if (!canRemember()) return
      await rememberOperations.submit('optimize-compression', {
        requestId: newId(),
        expected: { ...expected },
        changes: { optimizeCompression: 'none' },
      })
    },
    reconcile: rememberOperations.reconcile,
    state: () => rememberState.value,
  }
  const cpuText = computed(() => compactCpuSet(editor.draft.qemuImgCpus.map((id) => [id, id])))
  function chooseCpus(value: string) {
    if (!editor.editable.value) return
    const ranges = value.trim() ? cpuSet(value, 1023) : []
    if (!ranges) return
    const ids = new Set<number>()
    for (const [first, last] of ranges) for (let id = first; id <= last; id++) ids.add(id)
    editor.draft.qemuImgCpus = [...ids].sort((a, b) => a - b)
    editor.cancelReview()
  }
  return {
    ...editor,
    cpuText,
    chooseCpus,
    optimization,
    rememberEntry,
    rememberPending,
    rememberReceipt,
    rememberChecking: rememberOperations.checking,
    rememberRecoveryProblem: rememberOperations.recoveryProblem,
    reconcileRemember: rememberOperations.reconcile,
    clearRememberTracking() {
      if (rememberReceipt.value?.uncertain || editor.status.value?.uncertain) return
      rememberOperations.clearTracking()
    },
    pending: computed(() => editor.pending.value || rememberPending.value),
    bind(identity: string) {
      editor.bind(identity)
      rememberOperations.bind(identity)
    },
    pause() {
      editor.pause()
      rememberOperations.pause()
    },
    deactivate() {
      editor.deactivate()
      rememberOperations.pause()
    },
    reset() {
      editor.reset()
      rememberOperations.reset()
    },
    dispose() {
      editor.dispose()
      rememberOperations.dispose()
    },
    async loadSavedCpus(signal: AbortSignal): Promise<readonly number[] | undefined> {
      if (!gateway?.readable()) return undefined
      const value = await gateway.read(signal)
      if (value.uncertain) throw new ApiError('commit-uncertain', 'Disk defaults are uncertain')
      return [...value.values.qemuImgCpus]
    },
  }
}
export type DiskDefaults = ReturnType<typeof createDiskDefaults>
export const diskDefaultsKey: InjectionKey<DiskDefaults> = Symbol('disk-defaults')
export function useDiskDefaults() {
  const model = inject(diskDefaultsKey)
  if (!model) throw new Error('Disk defaults are not provided')
  return model
}
