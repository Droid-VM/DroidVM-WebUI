import { computed, inject, readonly, shallowRef, ref, type InjectionKey } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import {
  createOperationJournal,
  JournalError,
  type RecoveryProblem,
} from '../../../shared/model/operationJournal'
import type { Task } from '../../tasks'
import type {
  ConfigurationGateway,
  ConfigDocument,
  ConfigurationCommitTracking,
} from '../api/gateway'
import {
  cloneConfiguration,
  encodeDocument,
  parseDocument,
  parseConfiguration,
  type ConfigObject,
} from './document'
import { copyConfiguration, uniqueVmName } from './copy'
import { collectLeaseOccupancy, type LeaseOccupancy } from './leases'

export function createConfigurationEditor(gateway?: ConfigurationGateway) {
  const journal = gateway?.tracking ? createOperationJournal(gateway.tracking) : undefined
  const recoveryProblem = ref<RecoveryProblem | null>(null),
    restored = ref(false)
  let identity: string | null = null
  const draft = shallowRef<ConfigObject | null>(null)
  const peerLeases = shallowRef<LeaseOccupancy>(new Map())
  const copying = ref(false)
  const creating = ref(false)
  const newDraft = computed(() => copying.value || creating.value)
  const target = ref(''),
    state = ref<
      | 'idle'
      | 'loading'
      | 'editing'
      | 'staging'
      | 'pending'
      | 'unknown'
      | 'saved'
      | 'blocked'
      | 'error'
    >('idle')
  const problem = ref<ApiProblem | null>(null),
    task = shallowRef<Task | null>(null),
    dirty = ref(false)
  let baseline: ConfigDocument | null = null,
    pendingId = '',
    generation = 0
  let controller: AbortController | undefined
  let checking: AbortController | undefined
  let sourceId = ''
  let copyName: ((name: string) => string) | undefined
  let newName: string | undefined
  function pause() {
    generation++
    controller?.abort()
    controller = undefined
    checking = undefined
    if (state.value === 'pending') state.value = 'unknown'
    else if (state.value === 'staging' || state.value === 'loading') state.value = 'blocked'
  }
  function reset(preserveTracking = false) {
    pause()
    if (!preserveTracking) {
      try {
        journal?.clear(identity, true)
      } catch (cause) {
        trackingFailed(cause)
      }
    }
    if (!preserveTracking) identity = null
    restored.value = false
    baseline = null
    peerLeases.value = new Map()
    pendingId = ''
    draft.value = null
    target.value = ''
    task.value = null
    state.value = 'idle'
    problem.value = null
    dirty.value = false
    copying.value = false
    creating.value = false
    sourceId = ''
    copyName = undefined
    newName = undefined
  }
  function trackingFailed(cause: unknown) {
    recoveryProblem.value = cause instanceof JournalError ? cause.problem : 'invalid'
  }
  function bind(value: string) {
    if (identity === value && state.value !== 'idle') return
    reset(true)
    identity = value
    recoveryProblem.value = null
    if (!journal) return
    try {
      const records = journal.load(value)
      if (records.length > 1) throw new JournalError('invalid')
      const summary = records[0]?.request
      if (summary) {
        pendingId = summary.requestId
        target.value = summary.vmId
        sourceId = summary.vmId
        restored.value = true
        state.value = 'unknown'
      }
    } catch (cause) {
      trackingFailed(cause)
    }
  }
  async function load(
    id: string,
    options: {
      copyName?: (name: string) => string
      newName?: string
    } = {},
  ) {
    if (!gateway?.supported() || (journal && !identity)) return
    if (state.value === 'idle' && identity) bind(identity)
    if (recoveryProblem.value) {
      state.value = 'blocked'
      return
    }
    if (pendingId) {
      await reconcile()
      return
    }
    const previousIdentity = identity
    reset()
    identity = previousIdentity
    if (options.newName && !gateway.defaultsSupported()) return
    const epoch = generation,
      current = new AbortController()
    controller = current
    target.value = id
    sourceId = id
    copyName = options.copyName
    newName = options.newName
    copying.value = !!copyName
    creating.value = !!newName
    state.value = 'loading'
    try {
      const [loaded, defaults] = await Promise.all([
        gateway.read(current.signal),
        options.newName ? gateway.defaults(current.signal) : Promise.resolve(null),
      ])
      const document = parseDocument(loaded.json)
      const row =
        defaults === null
          ? document.vms.find((value) => value.id === id)
          : parseConfiguration(defaults)
      if (!row) throw new Error('VM is not configured')
      if (defaults !== null) {
        if (document.vms.some((vm) => vm.id === row.id)) throw new Error('VM already exists')
        row.name = uniqueVmName(document.vms, options.newName!)
      }
      if (epoch !== generation || current.signal.aborted) return
      baseline = loaded
      draft.value = options.copyName
        ? copyConfiguration(row, document.vms, options.copyName(String(row.name)))
        : cloneConfiguration(row)
      target.value = String(draft.value.id)
      peerLeases.value = collectLeaseOccupancy(document.vms, target.value)
      dirty.value = newDraft.value
      state.value = 'editing'
    } catch (cause) {
      if (epoch !== generation || current.signal.aborted) return
      problem.value = describeApiError(cause)
      state.value = 'error'
    }
  }
  function replace(row: ConfigObject) {
    if (state.value !== 'editing' || row.id !== target.value) return
    draft.value = row
    dirty.value = true
  }
  async function reconcile() {
    if (
      !gateway ||
      checking ||
      !pendingId ||
      !['pending', 'unknown', 'blocked'].includes(state.value)
    )
      return
    const epoch = generation,
      current = new AbortController()
    controller = current
    checking = current
    try {
      const result = await gateway.status(pendingId, current.signal)
      if (epoch !== generation || current.signal.aborted) return
      task.value = result.task
      if (!result.task) {
        state.value = 'unknown'
        return
      }
      if (result.task.state === 'succeeded') {
        if (!result.version?.persisted || result.version.durabilityUncertain) {
          state.value = 'blocked'
          return
        }
        // A new successful read is required before declaring the editor settled.
        const fresh = await gateway.read(current.signal)
        const document = parseDocument(fresh.json)
        if (epoch !== generation || current.signal.aborted) return
        if (!fresh.version.persisted || fresh.version.durabilityUncertain) {
          state.value = 'blocked'
          return
        }
        // Restored commits contain no draft. Show the freshly observed configuration,
        // never reconstruct a write or infer success from its mere existence.
        if (restored.value) {
          const row = document.vms.find((value) => value.id === target.value)
          baseline = fresh
          draft.value = row ? cloneConfiguration(row) : null
          peerLeases.value = collectLeaseOccupancy(document.vms, target.value)
        }
        state.value = 'saved'
        copying.value = false
        creating.value = false
        sourceId = target.value
        copyName = undefined
        newName = undefined
        pendingId = ''
        dirty.value = false
        problem.value = null
      } else if (['failed', 'cancelled'].includes(result.task.state)) {
        pendingId = ''
        state.value = 'blocked' // Preserve draft; explicit reload chooses a new baseline.
      } else state.value = 'pending'
    } catch (cause) {
      if (epoch !== generation || current.signal.aborted) return
      problem.value = describeApiError(cause)
      state.value = 'unknown'
    } finally {
      if (checking === current) checking = undefined
    }
  }
  async function save(remove = false) {
    if (!gateway || recoveryProblem.value || !baseline || !draft.value || state.value !== 'editing')
      return
    const epoch = generation,
      current = new AbortController()
    controller = current
    problem.value = null
    let upload = '',
      posted = false
    try {
      const document = parseDocument(baseline.json)
      const index = document.vms.findIndex((row) => row.id === target.value)
      if (draft.value.id !== target.value) throw new Error('VM identity changed')
      if (newDraft.value) {
        if (index >= 0 || remove) throw new Error('Invalid new VM identity or operation')
        document.vms.push(cloneConfiguration(draft.value))
      } else if (index < 0) throw new Error('VM identity changed')
      else if (remove) document.vms.splice(index, 1)
      else document.vms[index] = cloneConfiguration(draft.value)
      const json = encodeDocument(document),
        id = requestId()
      state.value = 'staging'
      upload = await gateway.stage(baseline.version.revision, json, current.signal)
      if (epoch !== generation || current.signal.aborted) {
        void gateway.abort(upload, new AbortController().signal).catch(() => undefined)
        return
      }
      const summary: ConfigurationCommitTracking = {
        requestId: id,
        vmId: target.value,
        action: remove ? 'delete' : newDraft.value ? 'create' : 'save',
      }
      if (journal) {
        try {
          if (!identity) throw new JournalError('unavailable')
          journal.save(identity, [{ key: 'vm-configuration', request: summary }])
        } catch (cause) {
          trackingFailed(cause)
          throw cause
        }
      }
      pendingId = id
      posted = true
      state.value = 'pending'
      const accepted = await gateway.commit(upload, id, current.signal)
      if (epoch !== generation || current.signal.aborted) return
      task.value = accepted
    } catch (cause) {
      if (epoch !== generation || current.signal.aborted) return
      problem.value = describeApiError(cause)
      state.value = posted
        ? 'unknown'
        : cause instanceof ApiError && cause.code === 'conflict'
          ? 'blocked'
          : 'editing'
      if (!posted && upload)
        void gateway.abort(upload, new AbortController().signal).catch(() => undefined)
    }
    if (epoch === generation && posted) await reconcile()
  }
  return {
    recoveryProblem: readonly(recoveryProblem),
    restored: readonly(restored),
    bind,
    clearTracking() {
      if (pendingId || !recoveryProblem.value) return
      try {
        journal?.clear(identity, true)
        recoveryProblem.value = null
      } catch (cause) {
        trackingFailed(cause)
      }
    },
    draft: readonly(draft),
    peerLeases: readonly(peerLeases),
    target: readonly(target),
    state: readonly(state),
    task: readonly(task),
    problem: readonly(problem),
    dirty: readonly(dirty),
    copying: readonly(copying),
    creating: readonly(creating),
    newDraft,
    canCreate: computed(() => !!gateway?.supported() && gateway.defaultsSupported()),
    supported: computed(() => !!gateway?.supported()),
    replace,
    open: (id: string, nameForCopy?: (name: string) => string) =>
      load(id, { copyName: nameForCopy }),
    create: (name: string) => load('', { newName: name }),
    reload: () => {
      if (pendingId) return reconcile()
      if (state.value === 'staging') return Promise.resolve()
      return load(sourceId, { copyName, newName })
    },
    pause,
    reset,
    save,
    reconcile,
    markDirty: () => {
      if (state.value === 'editing') dirty.value = true
    },
    exportJson: () => (draft.value ? encodeDocument(draft.value, true) : ''),
  }
}
export type ConfigurationEditor = ReturnType<typeof createConfigurationEditor>
export const configurationEditorKey: InjectionKey<ConfigurationEditor> =
  Symbol('configuration-editor')
export function useConfigurationEditor() {
  const editor = inject(configurationEditorKey)
  if (!editor) throw new Error('Configuration editor is not provided')
  return editor
}
