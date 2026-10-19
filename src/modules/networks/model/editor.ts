import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import {
  cloneConfiguration,
  encodeDocument,
  getPath,
  object,
  setPath,
  type ConfigObject,
} from '../../../shared/model/configurationDocument'
import { createOperations } from '../../tasks'
import type { NetworkConfigurationGateway, NetworkCommit } from '../api/gateway'
import {
  editField,
  networkIssues,
  newNetwork,
  newVlan,
  parseNetworks,
  vlans,
  type NetworkField,
} from './document'

export function createNetworkEditor(gateway?: NetworkConfigurationGateway, newId = requestId) {
  const baseline = shallowRef<ConfigObject | null>(null),
    draft = shallowRef<ConfigObject | null>(null)
  const observed = shallowRef<ConfigObject[]>([]),
    target = ref<string | null>(null)
  const buffers = ref<Record<string, string>>({}),
    invalid = ref<Record<string, boolean>>({})
  const problem = ref<ApiProblem | null>(null),
    loading = ref(false),
    staging = ref(false),
    blocked = ref(false),
    saved = ref(false)
  let generation = 0,
    identity: string | null = null
  const reads = new Set<AbortController>(),
    key = 'network-configuration'
  const operations = createOperations<NetworkCommit>(gateway, observe, gateway?.tracking)
  const entry = computed(() => operations.entries.value[key] ?? null)
  const pending = computed(() => !!entry.value && entry.value.state !== 'done')
  const busy = computed(() => loading.value || staging.value || pending.value)
  const dirty = computed(
    () =>
      !!draft.value &&
      (Object.values(invalid.value).some(Boolean) ||
        encodeDocument(draft.value) !== encodeDocument(baseline.value)),
  )
  const issues = computed(() =>
    draft.value
      ? [
          ...Object.keys(invalid.value)
            .filter((path) => invalid.value[path])
            .map((path) => ({ path, message: 'networkIntegerInvalid' as const })),
          ...networkIssues(draft.value, observed.value),
        ]
      : [],
  )
  const editable = computed(
    () =>
      operations.supported.value &&
      !operations.recoveryProblem.value &&
      !!draft.value &&
      !busy.value &&
      !blocked.value,
  )
  const canSave = computed(() => editable.value && dirty.value && !issues.value.length)
  const protectedDraft = computed(() => dirty.value || staging.value || pending.value)

  async function read(replace: boolean) {
    if (!gateway || loading.value || !operations.supported.value || !target.value) return false
    const controller = new AbortController(),
      epoch = generation,
      selected = target.value
    reads.add(controller)
    loading.value = true
    problem.value = null
    try {
      const rows = parseNetworks(await gateway.read(controller.signal))
      if (epoch !== generation) return false
      observed.value = rows
      if (replace) {
        const id = draft.value?.id ?? (selected === 'new' ? null : selected)
        const row = id ? rows.find((item) => item.id === id) : undefined
        if (
          id &&
          !row &&
          (selected !== 'new' || baseline.value || entry.value?.task?.state === 'succeeded')
        )
          throw new ApiError('conflict', 'Network is no longer available')
        baseline.value = row ? cloneConfiguration(row) : null
        draft.value = row ? cloneConfiguration(row) : newNetwork(rows)
        buffers.value = {}
        invalid.value = {}
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
    const epoch = generation,
      success = entry.value?.task?.state === 'succeeded'
    if (!success) blocked.value = true
    const fresh = await read(success)
    if (epoch !== generation) return false
    if (fresh && success) saved.value = true
    return fresh
  }
  async function reload() {
    if (staging.value || pending.value) return false
    const epoch = generation,
      fresh = await read(true)
    if (epoch !== generation) return false
    if (fresh) {
      operations.reset()
      if (identity) operations.bind(identity)
      saved.value = false
    }
    return fresh
  }
  async function save() {
    if (!gateway || !canSave.value || !draft.value) return
    const epoch = generation,
      controller = new AbortController()
    const json = encodeDocument({ operations: [{ expected: baseline.value, config: draft.value }] })
    reads.add(controller)
    staging.value = true
    saved.value = false
    problem.value = null
    let uploadId: string | undefined,
      submitted = false
    try {
      uploadId = await gateway.stage(json, controller.signal)
      if (epoch !== generation) return
      const request = { uploadId, requestId: newId(), networkId: String(draft.value.id) }
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
  function change(update: (row: ConfigObject) => void) {
    if (!editable.value || !draft.value) return
    const row = cloneConfiguration(draft.value)
    update(row)
    draft.value = row
    saved.value = false
  }
  function pause() {
    generation++
    reads.forEach((item) => item.abort())
    reads.clear()
    loading.value = staging.value = false
    operations.pause()
  }
  function reset(preserveTracking = false) {
    pause()
    operations.reset(preserveTracking)
    baseline.value = draft.value = null
    observed.value = []
    buffers.value = {}
    invalid.value = {}
    target.value = null
    problem.value = null
    blocked.value = saved.value = false
    identity = null
  }
  return {
    draft: readonly(draft),
    observed: readonly(observed),
    target: readonly(target),
    buffers: readonly(buffers),
    problem: readonly(problem),
    loading: readonly(loading),
    staging: readonly(staging),
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
    async open(id: string) {
      if (entry.value?.restored) {
        target.value = entry.value.request.networkId ?? id
        await operations.reconcile()
        if (pending.value) return target.value === id
        if (target.value === id) return true
      }
      if (target.value === id && draft.value) return true
      if (protectedDraft.value) return false
      const previousIdentity = identity
      reset()
      identity = previousIdentity
      if (identity) operations.bind(identity)
      target.value = id
      return reload()
    },
    update(field: NetworkField, value: string | boolean) {
      change((row) => {
        if (typeof value === 'string') buffers.value[field.key] = value
        invalid.value[field.key] = !editField(row, field, value)
      })
    },
    addVlan() {
      if (issues.value.some((item) => item.message === 'networkIntegerInvalid')) return
      change((row) => {
        const list = vlans(row)
        if (!list) return
        const ids = new Set(list.filter(object).map((item) => Number(String(item.vlan_id ?? 0))))
        let id = 0
        while (ids.has(id) && id <= 4094) id++
        if (id > 4094) return
        list.push(
          newVlan(id, row.bridge_type, [
            ...observed.value.filter((item) => item.id !== row.id),
            row,
          ]),
        )
        setPath(row, ['l3', 'vlans'], list)
      })
    },
    removeVlan(index: number) {
      change((row) => {
        const list = getPath(row, ['l3', 'vlans'])
        if (!Array.isArray(list) || !list[index]) return
        list.splice(index, 1)
        function shifted<T>(values: Record<string, T>) {
          return Object.fromEntries(
            Object.entries(values).flatMap(([path, value]) => {
              const match = /^l3\.vlans\.(\d+)\.(.*)$/.exec(path)
              if (!match) return [[path, value]]
              const position = Number(match[1])
              return position === index
                ? []
                : [[`l3.vlans.${position > index ? position - 1 : position}.${match[2]}`, value]]
            }),
          )
        }
        buffers.value = shifted(buffers.value)
        invalid.value = shifted(invalid.value)
      })
    },
    exportJson: () => encodeDocument(draft.value, true),
    pause,
    reset,
    bind(value: string) {
      if (identity !== value) reset(true)
      identity = value
      operations.bind(value)
      if (entry.value?.restored) target.value = entry.value.request.networkId ?? null
    },
    dispose() {
      reset(true)
      operations.dispose()
    },
  }
}
export type NetworkEditor = ReturnType<typeof createNetworkEditor>
export const networkEditorKey: InjectionKey<NetworkEditor> = Symbol('network-editor')
export function useNetworkEditor() {
  const editor = inject(networkEditorKey)
  if (!editor) throw new Error('Network editor is not provided')
  return editor
}
