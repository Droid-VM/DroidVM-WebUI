import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { createDiskActions, type DiskActionGateway, type DiskDetail } from '../../resources'
import { createAgentOperations, type AgentGateway } from '../../agent'
import { createConfigurationEditor, type ConfigurationGateway } from '../../configuration'
import type { Task } from '../../tasks'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { validUploadName } from '../../../shared/lib/uploadFiles'

export function validLinuxVmName(value: string) {
  const name = value.trim()
  return validUploadName(name) && !name.startsWith('.dvm-')
}

export type LinuxVmStep =
  | 'select'
  | 'clone'
  | 'convert'
  | 'flatten'
  | 'resize'
  | 'password'
  | 'grow'
  | 'configure'
export interface LinuxVmRecord {
  step: LinuxVmStep
  requestId?: string
  diskId?: string
  state: 'pending' | 'succeeded' | 'skipped' | 'failed' | 'unknown'
  task?: Task
  reason?: 'not-needed'
}
interface BoundRecord extends LinuxVmRecord {
  action?: string
  path?: string
  size?: string
}
export interface LinuxVmWizardOptions {
  disk?: DiskActionGateway
  agent?: AgentGateway
  configuration?: ConfigurationGateway
  loadDefaultCpus?: (signal: AbortSignal) => Promise<readonly number[] | undefined>
  refresh: () => Promise<boolean>
}
type DiskRequest = Parameters<DiskActionGateway['submit']>[0]
type DiskPreparation = Awaited<ReturnType<DiskActionGateway['prepare']>>
type AgentRequest = Parameters<AgentGateway['submit']>[0]
const steps: LinuxVmStep[] = [
  'select',
  'clone',
  'convert',
  'flatten',
  'resize',
  'password',
  'grow',
  'configure',
]
const diskSteps = new Set<LinuxVmStep>(['clone', 'convert', 'flatten', 'resize'])
const optionalSteps = new Set<LinuxVmStep>(['resize', 'password', 'grow'])
function reject(message: string): never {
  throw new ApiError('conflict', message)
}
function durableAgent(task: Task | undefined) {
  const result = task?.agentResult
  return !!(
    task?.state === 'succeeded' &&
    result?.outcome === 'succeeded' &&
    result.durabilityConfirmed &&
    result.committed &&
    !result.recoveryRequired &&
    result.guestCleanup === 'succeeded' &&
    result.cleanup.stopped &&
    result.cleanup.removed &&
    result.cleanup.diskSynced
  )
}

// This sequence owns no credentials and never advances on a polling response.
// Each write keeps the existing operation model and its original lookup identity.
export function createLinuxVmWizard(options: LinuxVmWizardOptions) {
  const step = ref<LinuxVmStep>('select'),
    name = ref('')
  const source = shallowRef<DiskDetail | null>(null),
    target = shallowRef<DiskDetail | null>(null)
  const sourceId = ref<string | null>(null),
    targetId = ref<string | null>(null)
  const rows = shallowRef<BoundRecord[]>([]),
    problem = shallowRef<ApiProblem | null>(null)
  const loading = ref(false)
  let identity: string | null = null,
    generation = 0,
    disposed = false,
    paused = false
  let read: AbortController | undefined
  let targetPath = '',
    seeded = false
  function put(value: BoundRecord) {
    rows.value = [...rows.value.filter((row) => row.step !== value.step), value]
  }
  function bound(current = step.value) {
    return rows.value.find((row) => row.step === current)
  }
  function verifyTask(task: Task, record: BoundRecord, agent: boolean) {
    if (
      task.requestId !== record.requestId ||
      task.kind !== (agent ? 'agent_operation' : 'disk_operation') ||
      task.resource !== `disk:${record.diskId}`
    )
      reject('Wizard task identity changed')
    if (
      agent &&
      task.agentResult &&
      (task.agentResult.diskId !== record.diskId || task.agentResult.action !== record.action)
    )
      reject('Wizard Agent target changed')
  }
  function inspect(value: DiskPreparation, id: string, writable: boolean) {
    const detail = value.detail
    if (
      !detail ||
      detail.disk.id !== id ||
      !value.catalog.vmRevision ||
      detail.revision !== value.catalog.revision ||
      detail.vmRevision !== value.catalog.vmRevision ||
      !detail.disk.selectable ||
      !detail.chainComplete ||
      detail.inspection.state !== 'ready' ||
      !['raw', 'qcow2'].includes(detail.inspection.format ?? '') ||
      !detail.inspection.virtualBytes ||
      BigInt(detail.inspection.virtualBytes) <= 0n ||
      detail.inspection.encrypted === true
    )
      reject('Image is not ready for Linux VM preparation')
    if (
      writable &&
      (id === sourceId.value ||
        detail.disk.path !== targetPath ||
        detail.readOnlyRequired ||
        detail.children.length ||
        detail.attachments.length)
    )
      reject('Prepared disk identity or writable ownership changed')
    return detail
  }
  function activeStep(expected: LinuxVmStep) {
    if (disposed || paused || loading.value || step.value !== expected)
      reject('Wizard stage changed')
    if (['succeeded', 'skipped'].includes(bound(expected)?.state ?? ''))
      reject('Wizard stage is already complete')
  }
  function recordTask(record: BoundRecord, task: Task) {
    const existing = bound(record.step)
    if (!existing || existing.requestId !== record.requestId) return
    if (
      existing.task &&
      (existing.task.id !== task.id || BigInt(task.revision) < BigInt(existing.task.revision))
    )
      reject('Wizard task identity or revision changed')
    put({
      ...record,
      task,
      state:
        task.state === 'succeeded'
          ? 'succeeded'
          : ['failed', 'cancelled'].includes(task.state)
            ? 'failed'
            : 'pending',
    })
  }
  function remember(record: BoundRecord) {
    // Freeze the previous stage before the reused child model replaces its entry.
    rows.value = materialized.value.map((row) => ({ ...row }))
    put(record)
  }
  function guardDisk(request: DiskRequest) {
    const current = step.value
    if (!diskSteps.has(current)) reject('No disk operation is permitted at this stage')
    activeStep(current)
    const op = request.operation,
      expectedId = current === 'clone' ? sourceId.value : targetId.value
    if (
      op.action !== current ||
      !('diskId' in op) ||
      op.diskId !== expectedId ||
      !expectedId ||
      (current !== 'clone' && expectedId === sourceId.value)
    )
      reject('Wizard disk operation changed')
    const observed = current === 'clone' ? source.value : target.value
    if (
      !observed ||
      request.revision !== observed.revision ||
      request.vmRevision !== observed.vmRevision
    )
      reject('Wizard disk confirmation changed')
    let path = observed.disk.path
    if (op.action === 'clone') {
      if (op.compress !== 'none' || 'format' in op)
        reject('Linux copy must keep its format and be uncompressed')
      if (
        !options.disk?.cloneDirectorySupported?.() ||
        op.createFolder !== true ||
        op.folder.slice(op.folder.lastIndexOf('/') + 1) !== name.value
      )
        reject('Linux copy must use the confirmed VM directory')
      path = `${op.folder === '/' ? '' : op.folder}/${op.name}`
      if (path === observed.disk.path) reject('Linux copy must have a new path')
    } else if (op.action === 'convert' || op.action === 'flatten') {
      if (op.format !== 'qcow2' || op.compress !== 'none' || 'folder' in op || 'name' in op)
        reject('Linux conversion must keep the new disk path and use uncompressed qcow2')
    } else if (op.action === 'resize') {
      if (
        op.shrink ||
        !observed.inspection.virtualBytes ||
        BigInt(op.size) <= BigInt(observed.inspection.virtualBytes)
      )
        reject('Linux disk can only grow')
    }
    remember({
      step: current,
      requestId: request.requestId,
      diskId: expectedId,
      action: op.action,
      path,
      ...(op.action === 'resize' ? { size: op.size } : {}),
      state: 'pending',
    })
    return bound(current)!
  }
  const guardedDisk: DiskActionGateway | undefined = options.disk && {
    ...options.disk,
    // This private sequence needs its own step/target recovery before it can
    // persist requests. Never read or clear the ordinary disk page's journal.
    tracking: undefined,
    async prepare(id, action, signal) {
      const expected = step.value
      activeStep(expected)
      if (
        !diskSteps.has(expected) ||
        action !== expected ||
        id !== (expected === 'clone' ? sourceId.value : targetId.value)
      )
        reject('Wizard disk preparation changed')
      const epoch = generation,
        result = await options.disk!.prepare(id, action, signal)
      if (epoch !== generation || signal.aborted || step.value !== expected)
        reject('Wizard stage changed')
      const detail = inspect(result, id!, expected !== 'clone')
      if (expected === 'clone') source.value = detail
      else target.value = detail
      return result
    },
    async submit(request, signal) {
      const record = guardDisk(request),
        epoch = generation
      const task = await options.disk!.submit(request, signal)
      verifyTask(task, record, false)
      if (epoch === generation) recordTask(record, task)
      return task
    },
    async find(request, signal) {
      const record = rows.value.find((row) => row.requestId === request.requestId)
      if (
        !record ||
        record.diskId !== ('diskId' in request.operation ? request.operation.diskId : null) ||
        record.action !== request.operation.action
      )
        reject('Wizard disk lookup changed')
      const epoch = generation,
        task = await options.disk!.find(request, signal)
      if (task) {
        verifyTask(task, record, false)
        if (epoch === generation) recordTask(record, task)
      }
      return task
    },
  }
  const guardedAgent: AgentGateway | undefined = options.agent && {
    ...options.agent,
    rescueSupported: () => false,
    async prepare(id, signal) {
      const expected = step.value,
        epoch = generation
      activeStep(expected)
      if (
        !['password', 'grow'].includes(expected) ||
        id !== targetId.value ||
        id === sourceId.value
      )
        reject('Wizard Agent target changed')
      const result = await options.agent!.prepare(id, signal)
      if (epoch !== generation || signal.aborted || step.value !== expected)
        reject('Wizard stage changed')
      target.value = inspect({ ...result, parent: null }, id, true)
      return result
    },
    async submit(request: AgentRequest, signal) {
      const current = step.value
      try {
        activeStep(current)
        const op = request.operation
        if (
          !['password', 'grow'].includes(current) ||
          request.rescue ||
          op.diskId !== targetId.value ||
          op.diskId === sourceId.value ||
          op.action !== (current === 'password' ? 'chpasswd' : 'autogrow') ||
          (op.action === 'chpasswd' && op.normalUsers) ||
          request.revision !== target.value?.revision ||
          request.vmRevision !== target.value?.vmRevision
        )
          reject('Wizard Agent confirmation changed')
        remember({
          step: current,
          requestId: request.requestId,
          diskId: op.diskId,
          action: op.action,
          state: 'pending',
        })
        const record = bound(current)!,
          epoch = generation
        // Delegate to the existing single-send secret boundary. No password is
        // copied into wizard state, records, retry data or configuration drafts.
        const response = options.agent!.submit(request, signal)
        if (op.action === 'chpasswd') op.password = ''
        const task = await response
        verifyTask(task, record, true)
        if (epoch === generation) recordTask(record, task)
        return task
      } finally {
        if (request.operation.action === 'chpasswd') request.operation.password = ''
      }
    },
    async find(reference, signal) {
      const record = rows.value.find((row) => row.requestId === reference.requestId)
      if (
        !record ||
        record.diskId !== reference.diskId ||
        record.action !== reference.action ||
        reference.rescue
      )
        reject('Wizard Agent lookup changed')
      const epoch = generation,
        task = await options.agent!.find(reference, signal)
      if (task) {
        verifyTask(task, record, true)
        if (epoch === generation) recordTask(record, task)
      }
      return task
    },
  }
  const diskActions = createDiskActions(
    guardedDisk,
    options.refresh,
    undefined,
    undefined,
    options.loadDefaultCpus,
  )
  const agent = createAgentOperations(guardedAgent, options.refresh)
  const editor = createConfigurationEditor(options.configuration)
  const materialized = computed<BoundRecord[]>(() =>
    rows.value.map((record) => {
      if (!record.requestId || record.state === 'skipped') return record
      const disk = diskActions.entries.value.disk,
        maintenance = agent.entry.value
      const entry =
        disk?.request.requestId === record.requestId
          ? disk
          : maintenance?.reference.requestId === record.requestId
            ? maintenance
            : null
      if (!entry) return record
      const task = entry.task ?? undefined
      const state =
        entry.state === 'unknown'
          ? 'unknown'
          : entry.state !== 'done'
            ? 'pending'
            : task?.state === 'succeeded'
              ? 'succeeded'
              : 'failed'
      return { ...record, state, task }
    }),
  )
  const current = computed(() => materialized.value.find((row) => row.step === step.value))
  const completed = computed(() => step.value === 'configure' && editor.state.value === 'saved')
  const supported = computed(
    () =>
      !disposed &&
      !!options.disk?.supported() &&
      !!options.disk?.cloneDirectorySupported?.() &&
      !!options.agent?.supported() &&
      !!options.configuration?.supported() &&
      !!options.configuration.defaultsSupported(),
  )
  const recoveryClear = computed(
    () =>
      diskActions.recovery.settled.value &&
      (!diskActions.recovery.supported.value ||
        (diskActions.recovery.pending.value === 0 && !diskActions.recovery.problem.value)) &&
      (!agent.recovery.supported.value ||
        (agent.pendingRecords.value === 0 && !agent.recoveryProblem.value)) &&
      !Object.values(agent.recovery.entries.value).some((row) => row.state !== 'done'),
  )
  const pending = computed(
    () =>
      loading.value ||
      materialized.value.some((row) => ['pending', 'unknown'].includes(row.state)) ||
      ['loading', 'staging', 'pending', 'unknown'].includes(editor.state.value) ||
      !diskActions.recovery.settled.value ||
      agent.busy.value,
  )
  const canContinue = computed(
    () =>
      !pending.value &&
      !completed.value &&
      recoveryClear.value &&
      (current.value?.state === 'skipped' ||
        (current.value?.state === 'succeeded' &&
          (diskSteps.has(step.value) || durableAgent(current.value.task)))),
  )
  function safeFailure(record: BoundRecord) {
    const task = record.task
    if (record.state === 'failed' && !task) {
      const disk = diskActions.entries.value.disk,
        maintenance = agent.entry.value
      const entry =
        disk?.request.requestId === record.requestId
          ? disk
          : maintenance?.reference.requestId === record.requestId
            ? maintenance
            : null
      return !!(
        entry?.state === 'done' &&
        entry.problem &&
        [
          'conflict',
          'unauthenticated',
          'permission-denied',
          'unsupported',
          'context-changed',
        ].includes(entry.problem.code)
      )
    }
    if (
      record.state !== 'failed' ||
      !task ||
      !['failed', 'cancelled'].includes(task.state) ||
      task.errorCode === 'COMMIT_UNCERTAIN'
    )
      return false
    if (record.step === 'resize') return recoveryClear.value
    const result = task.agentResult
    return !!(
      result &&
      result.outcome !== 'uncertain' &&
      result.outcome !== 'rescue_ready' &&
      !result.recoveryRequired &&
      result.cleanup.stopped &&
      result.cleanup.removed &&
      ((result.cleanup.diskSynced && ['succeeded', 'not_required'].includes(result.guestCleanup)) ||
        (!result.committed && result.guestCleanup === 'not_required'))
    )
  }
  const canSkip = computed(
    () =>
      optionalSteps.has(step.value) &&
      !pending.value &&
      recoveryClear.value &&
      (!current.value || safeFailure(current.value)),
  )
  const canPrepare = computed(
    () =>
      supported.value &&
      step.value !== 'select' &&
      !completed.value &&
      !pending.value &&
      !diskActions.open.value &&
      !agent.open.value &&
      current.value?.state !== 'succeeded' &&
      current.value?.state !== 'skipped' &&
      (step.value === 'configure'
        ? ['idle', 'blocked', 'error'].includes(editor.state.value)
        : recoveryClear.value &&
          (diskSteps.has(step.value) ? diskActions.allowed.value : agent.allowed.value)),
  )
  async function recoverStatus() {
    await Promise.all([diskActions.recovery.readStatus(), agent.readRecovery()])
  }
  async function observeTarget(signal: AbortSignal) {
    if (!options.disk || !targetId.value) reject('Prepared disk is missing')
    const result = await options.disk.prepare(targetId.value, 'resize', signal)
    return inspect(result, targetId.value, true)
  }
  async function choose(id: string, vmName: string) {
    if (!supported.value || step.value !== 'select' || pending.value || !validLinuxVmName(vmName))
      return
    paused = false
    const epoch = generation,
      controller = new AbortController()
    read = controller
    loading.value = true
    problem.value = null
    try {
      const result = await options.disk!.prepare(id, 'clone', controller.signal)
      const detail = inspect(result, id, false)
      await recoverStatus()
      if (epoch !== generation || controller.signal.aborted) return
      if (!recoveryClear.value) reject('Finish pending disk or Agent recovery first')
      source.value = detail
      sourceId.value = id
      name.value = vmName.trim()
      step.value = 'clone'
    } catch (cause) {
      if (epoch === generation) problem.value = describeApiError(cause)
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  async function prepare() {
    paused = false
    if (step.value === 'configure' && seeded) {
      if (!pending.value && ['blocked', 'error'].includes(editor.state.value)) await editor.reload()
      return
    }
    if (!canPrepare.value) return
    problem.value = null
    if (diskSteps.has(step.value)) {
      const action = step.value as 'clone' | 'convert' | 'flatten' | 'resize'
      const id = action === 'clone' ? sourceId.value : targetId.value
      if (id) await diskActions.prepare(id, action)
    } else if (step.value === 'password' || step.value === 'grow') {
      if (targetId.value)
        await agent.prepare(targetId.value, step.value === 'password' ? 'chpasswd' : 'autogrow')
    } else if (step.value === 'configure' && target.value) {
      const epoch = generation,
        controller = new AbortController()
      read = controller
      loading.value = true
      try {
        const observed = await observeTarget(controller.signal)
        if (epoch !== generation || controller.signal.aborted) return
        target.value = observed
        seeded = true
        await editor.createLinux(name.value, { diskPath: observed.disk.path })
      } catch (cause) {
        if (epoch === generation) problem.value = describeApiError(cause)
      } finally {
        if (epoch === generation) loading.value = false
      }
    }
  }
  async function advance(skipped: boolean) {
    const previous = step.value,
      record = current.value,
      epoch = generation
    const controller = new AbortController()
    read = controller
    loading.value = true
    problem.value = null
    try {
      if (previous === 'clone') {
        const id = record?.task?.diskId
        if (!id || id === sourceId.value || !record?.path)
          reject('Clone did not identify a new registered disk')
        targetId.value = id
        targetPath = record.path
      }
      const observed = await observeTarget(controller.signal)
      await recoverStatus()
      if (epoch !== generation || controller.signal.aborted) return
      if (!recoveryClear.value) reject('Recovery is still required')
      if (!skipped && previous === 'resize' && observed.inspection.virtualBytes !== record?.size)
        reject('Prepared disk size changed after resize')
      if (
        !skipped &&
        (previous === 'convert' || previous === 'flatten') &&
        observed.inspection.format !== 'qcow2'
      )
        reject('Prepared disk format changed')
      if (!skipped && previous === 'flatten' && observed.disk.parentId)
        reject('Prepared disk still has a backing parent')
      rows.value = materialized.value.map((row) => ({ ...row }))
      if (skipped) put({ ...record, step: previous, diskId: targetId.value!, state: 'skipped' })
      target.value = observed
      diskActions.close()
      agent.close()
      step.value = steps[steps.indexOf(previous) + 1]!
      if (
        (step.value === 'convert' && observed.inspection.format === 'qcow2') ||
        (step.value === 'flatten' && !observed.disk.parentId)
      )
        put({ step: step.value, diskId: targetId.value!, state: 'skipped', reason: 'not-needed' })
      // Configuration creation is another explicit prepare; never allocate a
      // new UUID merely because a poll or previous maintenance stage completed.
    } catch (cause) {
      if (epoch === generation) problem.value = describeApiError(cause)
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  async function next() {
    paused = false
    if (canContinue.value && step.value !== 'configure') await advance(false)
  }
  async function skip(confirmed = false) {
    paused = false
    if (confirmed && canSkip.value) await advance(true)
  }
  async function reconcile(): Promise<boolean> {
    if (disposed || loading.value) return false
    const epoch = generation
    await Promise.all([diskActions.reconcile(), agent.reconcile(), editor.reconcile()])
    if (epoch !== generation) return false
    await Promise.all([diskActions.recovery.reconcile(), agent.reconcileRecovery()])
    return epoch === generation && !disposed
  }
  function pause() {
    paused = true
    generation++
    read?.abort()
    read = undefined
    loading.value = false
    diskActions.pause()
    agent.pause()
    editor.pause()
  }
  function reset() {
    pause()
    rows.value = []
    source.value = target.value = null
    sourceId.value = targetId.value = null
    targetPath = ''
    seeded = false
    name.value = ''
    step.value = 'select'
    problem.value = null
    diskActions.reset()
    agent.reset()
    editor.reset()
    identity = null
  }
  return {
    diskActions,
    agent,
    editor,
    step: readonly(step),
    name: readonly(name),
    source: readonly(source),
    target: readonly(target),
    sourceId: readonly(sourceId),
    targetId: readonly(targetId),
    records: readonly(materialized),
    problem: readonly(problem),
    loading: readonly(loading),
    pending,
    supported,
    canPrepare,
    canContinue,
    canSkip,
    completed,
    vmId: computed(() => editor.target.value || null),
    blocked: computed(
      () =>
        !!problem.value ||
        !!current.value?.task?.errorCode ||
        (step.value !== 'select' && !recoveryClear.value),
    ),
    hasWork: computed(
      () =>
        !completed.value && (step.value !== 'select' || !!sourceId.value || rows.value.length > 0),
    ),
    choose,
    prepare,
    next,
    skip,
    reconcile,
    pause,
    leave: pause,
    reset,
    bind(value: string) {
      if (identity === value) {
        paused = false
        return
      }
      reset()
      identity = value
      diskActions.bind(value)
      agent.bind(value)
    },
    dispose() {
      disposed = true
      reset()
      diskActions.dispose()
      agent.dispose()
    },
  }
}
export type LinuxVmWizard = ReturnType<typeof createLinuxVmWizard>
export const linuxVmWizardKey: InjectionKey<LinuxVmWizard> = Symbol('linux-vm-wizard')
export function useLinuxVmWizard() {
  const wizard = inject(linuxVmWizardKey)
  if (!wizard) throw new Error('Linux VM wizard is not provided')
  return wizard
}
