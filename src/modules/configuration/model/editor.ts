import { computed, inject, readonly, shallowRef, ref, type InjectionKey } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import type { Task } from '../../tasks'
import type { ConfigurationGateway, ConfigDocument } from '../api/gateway'
import {
  cloneConfiguration,
  encodeDocument,
  parseDocument,
  parseConfiguration,
  type ConfigObject,
} from './document'
import { copyConfiguration, uniqueVmName } from './copy'
import { collectLeaseOccupancy, type LeaseOccupancy } from './leases'
import {
  createLinuxSeed,
  seedLinuxConfiguration,
  type LinuxSeed,
  type LinuxSeedOptions,
} from './linuxSeed'

export function createConfigurationEditor(gateway?: ConfigurationGateway) {
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
  let linuxSeed: LinuxSeed | undefined
  function pause() {
    generation++
    controller?.abort()
    controller = undefined
    checking = undefined
    if (state.value === 'pending') state.value = 'unknown'
    else if (state.value === 'staging' || state.value === 'loading') state.value = 'blocked'
  }
  function reset() {
    pause()
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
    linuxSeed = undefined
  }
  async function load(
    id: string,
    options: {
      copyName?: (name: string) => string
      newName?: string
      linuxSeed?: LinuxSeed
    } = {},
  ) {
    reset()
    if (!gateway?.supported()) return
    if (options.newName && !gateway.defaultsSupported()) return
    const epoch = generation,
      current = new AbortController()
    controller = current
    target.value = id
    sourceId = id
    copyName = options.copyName
    newName = options.newName
    linuxSeed = options.linuxSeed
    copying.value = !!copyName
    creating.value = !!newName
    state.value = 'loading'
    try {
      const [loaded, defaults] = await Promise.all([
        gateway.read(current.signal),
        options.newName ? gateway.defaults(current.signal) : Promise.resolve(null),
      ])
      const document = parseDocument(loaded.json)
      let row =
        defaults === null
          ? document.vms.find((value) => value.id === id)
          : parseConfiguration(defaults)
      if (!row) throw new Error('VM is not configured')
      if (defaults !== null && options.linuxSeed)
        row = seedLinuxConfiguration(row, options.linuxSeed)
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
        parseDocument(fresh.json)
        if (epoch !== generation || current.signal.aborted) return
        if (!fresh.version.persisted || fresh.version.durabilityUncertain) {
          state.value = 'blocked'
          return
        }
        state.value = 'saved'
        copying.value = false
        creating.value = false
        sourceId = target.value
        copyName = undefined
        newName = undefined
        linuxSeed = undefined
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
    if (!gateway || !baseline || !draft.value || state.value !== 'editing') return
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
    createLinux: (name: string, options: LinuxSeedOptions) =>
      load('', { newName: name, linuxSeed: createLinuxSeed(options) }),
    reload: () => {
      if (pendingId) return reconcile()
      if (state.value === 'staging') return Promise.resolve()
      return load(sourceId, { copyName, newName, linuxSeed })
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
