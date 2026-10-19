import { expect, it, vi } from 'vitest'
import { createLinuxVmWizard, validLinuxVmName } from '../../src/modules/linuxVm/model/wizard'
import type { DiskActionGateway, DiskDetail } from '../../src/modules/resources'
import type { AgentGateway, AgentResult } from '../../src/modules/agent'
import type { ConfigurationGateway } from '../../src/modules/configuration'
import type { Task } from '../../src/modules/tasks'
import { ApiError } from '../../src/shared/api/errors'

// Keep this state-machine test on the real model factories; Vue component
// compilation and public UI wiring are exercised by the HTTP browser probe.
vi.mock(
  '../../src/modules/resources',
  () => import('../../src/modules/resources/model/diskOperations'),
)
vi.mock('../../src/modules/agent', () => import('../../src/modules/agent/model/operations'))
vi.mock(
  '../../src/modules/configuration',
  () => import('../../src/modules/configuration/model/editor'),
)

type DiskRequest = Parameters<DiskActionGateway['submit']>[0]
type AgentRequest = Parameters<AgentGateway['submit']>[0]
const sourceId = '11111111-1111-4111-8111-111111111111'
const copyId = '22222222-2222-4222-8222-222222222222'
const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
function detail(id: string, format: string, parentId: string | null = null): DiskDetail {
  const disk = {
    id,
    name: id === sourceId ? 'source' : 'copy',
    path: id === sourceId ? '/source' : '/copy',
    parentId,
    backing: false,
    selectable: true,
  }
  return {
    context,
    revision: 'disks',
    vmRevision: 'vms',
    disk,
    chain: [disk],
    chainComplete: true,
    children: [],
    attachments: [],
    readOnlyRequired: false,
    checkedAtMs: 1,
    inspection: {
      state: 'ready',
      format,
      virtualBytes: '1024',
      allocatedBytes: '0',
      clusterBytes: null,
      encrypted: false,
      dirty: false,
      compression: null,
    },
  }
}
function task(
  requestId: string,
  kind: string,
  diskId: string,
  state: Task['state'] = 'succeeded',
): Task {
  return {
    id: `task-${requestId}`,
    requestId,
    kind,
    resource: `disk:${diskId}`,
    revision: '1',
    state,
    cancellable: false,
    phase: '',
    unit: '',
    completed: '0',
    total: null,
    createdMs: '1',
    finishedMs: '2',
    resultAvailable: true,
    errorCode: null,
  }
}
function fixture(format = 'raw', parentId: string | null = null) {
  const disks = new Map([[sourceId, detail(sourceId, format, parentId)]])
  const tasks = new Map<string, Task>()
  let loseClone = false,
    uncertainAgent = false
  const prepare = vi.fn(async (id: string | null) => {
    const observed = id ? disks.get(id) : undefined
    if (!observed) throw new Error('missing disk')
    return {
      catalog: {
        context,
        revision: 'disks',
        vmRevision: 'vms',
        items: [...disks.values()].map((row) => row.disk),
      },
      detail: structuredClone(observed),
      parent: null,
    }
  })
  const submitDisk = vi.fn(async (request: DiskRequest) => {
    const op = request.operation
    if (!('diskId' in op)) throw new Error('not a registered operation')
    const observed = disks.get(op.diskId)!
    if (op.action === 'clone') {
      const copy = detail(copyId, observed.inspection.format!, observed.disk.parentId)
      copy.disk.path = `${op.folder === '/' ? '' : op.folder}/${op.name}`
      disks.set(copyId, copy)
    } else if (op.action === 'convert') observed.inspection.format = 'qcow2'
    else if (op.action === 'flatten') {
      observed.disk.parentId = null
      observed.inspection.format = 'qcow2'
    } else if (op.action === 'resize') observed.inspection.virtualBytes = op.size
    else throw new Error('unexpected disk action')
    const result = task(request.requestId, 'disk_operation', op.diskId)
    result.diskId = op.action === 'clone' ? copyId : op.diskId
    tasks.set(request.requestId, result)
    if (op.action === 'clone' && loseClone) throw new Error('lost receipt')
    return result
  })
  const disk: DiskActionGateway = {
    supported: () => true,
    cloneDirectorySupported: () => true,
    prepare,
    submit: submitDisk,
    find: vi.fn(async (request) => tasks.get(request.requestId) ?? null),
  }
  const submitAgent = vi.fn(async (request: AgentRequest) => {
    const result = task(
      request.requestId,
      'agent_operation',
      request.operation.diskId,
      uncertainAgent ? 'failed' : 'succeeded',
    )
    const receipt: AgentResult = {
      diskId: request.operation.diskId,
      action: request.operation.action,
      outcome: uncertainAgent ? 'uncertain' : 'succeeded',
      guestOutcome: 'succeeded',
      guestCode: null,
      guestCleanup: 'succeeded',
      cleanup: { stopped: true, removed: true, diskSynced: !uncertainAgent },
      durabilityConfirmed: !uncertainAgent,
      committed: true,
      reason: uncertainAgent ? 'disk_sync_failed' : 'none',
      recoveryRequired: false,
      actions: [{ action: request.operation.action, state: 'succeeded', code: null }],
    }
    result.agentResult = receipt
    result.errorCode = uncertainAgent ? 'COMMIT_UNCERTAIN' : null
    tasks.set(request.requestId, result)
    return result
  })
  const agent: AgentGateway = {
    supported: () => true,
    prepare: async (id) => {
      const value = await prepare(id)
      return { catalog: value.catalog, detail: value.detail! }
    },
    submit: submitAgent,
    find: vi.fn(async (reference) => tasks.get(reference.requestId) ?? null),
    recovery: { supported: () => false, status: vi.fn(), submit: vi.fn(), find: vi.fn() },
  }
  const configuration: ConfigurationGateway = {
    supported: () => true,
    defaultsSupported: () => true,
    defaults: vi.fn(),
    read: vi.fn(),
    stage: vi.fn(),
    abort: vi.fn(),
    commit: vi.fn(),
    status: vi.fn(),
  }
  const wizard = createLinuxVmWizard({ disk, agent, configuration, refresh: async () => true })
  wizard.bind('session')
  return {
    wizard,
    disk,
    agent,
    submitDisk,
    submitAgent,
    disks,
    loseClone: () => {
      loseClone = true
    },
    uncertainAgent: () => {
      uncertainAgent = true
    },
  }
}
async function clone(f: ReturnType<typeof fixture>) {
  await f.wizard.choose(sourceId, 'Linux')
  await f.wizard.prepare()
  await f.wizard.diskActions.submit({
    action: 'clone',
    diskId: sourceId,
    folder: '/Linux',
    name: 'copy',
    compress: 'none',
    createFolder: true,
  })
}

it('keeps its private disk sequence separate from ordinary disk page tracking', () => {
  const getItem = vi.fn(() => null),
    setItem = vi.fn(),
    removeItem = vi.fn()
  const wizard = createLinuxVmWizard({
    refresh: async () => true,
    disk: {
      supported: () => false,
      prepare: vi.fn(),
      submit: vi.fn(),
      find: vi.fn(),
      tracking: {
        namespace: 'disk',
        valid: (value): value is DiskRequest => !!value,
        key: () => 'disk',
        storage: { getItem, setItem, removeItem, clear: vi.fn(), key: () => null, length: 0 },
      },
    },
  })
  wizard.bind('epoch:session')
  wizard.reset()
  wizard.dispose()
  expect(getItem).not.toHaveBeenCalled()
  expect(setItem).not.toHaveBeenCalled()
  expect(removeItem).not.toHaveBeenCalled()
})
async function toPassword(f: ReturnType<typeof fixture>) {
  await clone(f)
  await f.wizard.next()
  if (f.wizard.records.value.find((row) => row.step === 'convert')?.state !== 'skipped') {
    await f.wizard.prepare()
    await f.wizard.diskActions.submit({
      action: 'convert',
      diskId: copyId,
      format: 'qcow2',
      compress: 'none',
    })
  }
  await f.wizard.next()
  if (f.wizard.records.value.find((row) => row.step === 'flatten')?.state !== 'skipped') {
    await f.wizard.prepare()
    await f.wizard.diskActions.submit({
      action: 'flatten',
      diskId: copyId,
      format: 'qcow2',
      compress: 'none',
    })
  }
  await f.wizard.next()
  await f.wizard.skip(true)
  expect(f.wizard.step.value).toBe('password')
}

it('queries a lost clone without advancing, then converts only the raw copy through explicit stages', async () => {
  const f = fixture()
  f.loseClone()
  await clone(f)
  const originalRequest = f.submitDisk.mock.calls[0]![0]
  expect(originalRequest.operation).toMatchObject({
    folder: '/Linux',
    name: 'copy',
    createFolder: true,
  })
  expect(f.wizard.records.value[0]?.state).toBe('unknown')
  await f.wizard.next()
  expect(f.wizard.step.value).toBe('clone')
  f.wizard.leave()
  await f.wizard.reconcile()
  expect(f.submitDisk).toHaveBeenCalledTimes(1)
  expect(f.disk.find).toHaveBeenCalledWith(originalRequest, expect.any(AbortSignal))
  expect(f.wizard.step.value).toBe('clone')
  await f.wizard.next()
  expect(f.wizard.step.value).toBe('convert')
  await f.wizard.prepare()
  await f.wizard.diskActions.submit({
    action: 'convert',
    diskId: sourceId,
    format: 'qcow2',
    compress: 'none',
  })
  expect(f.submitDisk).toHaveBeenCalledTimes(1)
  await f.wizard.prepare()
  await f.wizard.diskActions.submit({
    action: 'convert',
    diskId: copyId,
    format: 'qcow2',
    compress: 'none',
  })
  await f.wizard.next()
  expect(f.wizard.step.value).toBe('flatten')
  expect(f.wizard.records.value.find((row) => row.step === 'flatten')?.reason).toBe('not-needed')
  await f.wizard.next()
  expect(f.wizard.step.value).toBe('resize')
  await f.wizard.skip()
  expect(f.wizard.step.value).toBe('resize')
  await f.wizard.skip(true)
  expect(f.wizard.step.value).toBe('password')
  expect(f.disks.get(sourceId)?.inspection.format).toBe('raw')
  f.wizard.dispose()
})

it('requires flattening a qcow2 copy with a parent and rejects shrinking or resizing the source', async () => {
  const f = fixture('qcow2', 'base')
  await clone(f)
  await f.wizard.next()
  await f.wizard.next()
  expect(f.wizard.step.value).toBe('flatten')
  expect(f.wizard.canSkip.value).toBe(false)
  await f.wizard.skip(true)
  expect(f.wizard.step.value).toBe('flatten')
  await f.wizard.prepare()
  await f.wizard.diskActions.submit({
    action: 'flatten',
    diskId: copyId,
    format: 'qcow2',
    compress: 'none',
  })
  await f.wizard.next()
  await f.wizard.prepare()
  await f.wizard.diskActions.submit({ action: 'resize', diskId: sourceId, size: '2048' })
  await f.wizard.prepare()
  await f.wizard.diskActions.submit({ action: 'resize', diskId: copyId, size: '512', shrink: true })
  expect(f.submitDisk).toHaveBeenCalledTimes(2)
  await f.wizard.prepare()
  await f.wizard.diskActions.submit({ action: 'resize', diskId: copyId, size: '2048' })
  await f.wizard.next()
  expect(f.wizard.step.value).toBe('password')
  expect(f.disks.get(sourceId)?.disk.parentId).toBe('base')
  expect(f.disks.get(sourceId)?.inspection.virtualBytes).toBe('1024')
  expect(f.disks.get(copyId)?.disk.parentId).toBeNull()
  f.wizard.dispose()
})

it('clears the root-only single-send password and cannot skip uncertain maintenance or act on the source', async () => {
  const f = fixture('qcow2')
  await toPassword(f)
  await f.wizard.prepare()
  const wrong = {
    action: 'chpasswd' as const,
    diskId: sourceId,
    password: 'DontKeep1',
    normalUsers: false,
  }
  await f.wizard.agent.submit(wrong)
  expect(wrong.password).toBe('')
  expect(f.submitAgent).not.toHaveBeenCalled()
  const broad = {
    action: 'chpasswd' as const,
    diskId: copyId,
    password: 'DontKeep2',
    normalUsers: true,
  }
  await f.wizard.agent.submit(broad)
  expect(broad.password).toBe('')
  expect(f.submitAgent).not.toHaveBeenCalled()
  f.uncertainAgent()
  await f.wizard.prepare()
  const operation = {
    action: 'chpasswd' as const,
    diskId: copyId,
    password: 'DontKeep3',
    normalUsers: false,
  }
  await f.wizard.agent.submit(operation)
  expect(operation.password).toBe('')
  expect(f.submitAgent).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(f.wizard.records.value)).not.toContain('DontKeep')
  expect(f.wizard.canContinue.value).toBe(false)
  expect(f.wizard.canSkip.value).toBe(false)
  await f.wizard.skip(true)
  await f.wizard.next()
  expect(f.wizard.step.value).toBe('password')
  f.wizard.leave()
  await f.wizard.reconcile()
  expect(f.submitAgent).toHaveBeenCalledTimes(1)
  expect(f.wizard.targetId.value).toBe(copyId)
  f.wizard.bind('another-session')
  expect(f.wizard.records.value).toEqual([])
  expect(f.wizard.targetId.value).toBeNull()
  f.wizard.dispose()
})

it('allows an explicit skip after a failed Agent stage that never committed and fully stopped', async () => {
  const f = fixture('qcow2')
  await toPassword(f)
  f.submitAgent.mockImplementationOnce(async (request) => ({
    ...task(request.requestId, 'agent_operation', copyId, 'failed'),
    agentResult: {
      diskId: copyId,
      action: request.operation.action,
      outcome: 'failed',
      guestOutcome: 'skipped',
      guestCode: null,
      guestCleanup: 'not_required',
      cleanup: { stopped: true, removed: true, diskSynced: false },
      durabilityConfirmed: false,
      committed: false,
      reason: 'start_rejected',
      recoveryRequired: false,
      actions: [],
    },
  }))
  await f.wizard.prepare()
  await f.wizard.agent.submit({
    action: 'chpasswd',
    diskId: copyId,
    password: 'DontKeep',
    normalUsers: false,
  })
  expect(f.wizard.canContinue.value).toBe(false)
  expect(f.wizard.canSkip.value).toBe(true)
  await f.wizard.skip(true)
  expect(f.wizard.step.value).toBe('grow')
  expect(f.wizard.records.value.find((row) => row.step === 'password')?.state).toBe('skipped')
  f.wizard.dispose()
})

it('allows skipping an explicit pre-admission conflict but never treats a missing task as rejection', async () => {
  const f = fixture('qcow2')
  await toPassword(f)
  f.submitAgent.mockRejectedValueOnce(new ApiError('conflict', 'Configuration changed'))
  await f.wizard.prepare()
  await f.wizard.agent.submit({
    action: 'chpasswd',
    diskId: copyId,
    password: 'DontKeep',
    normalUsers: false,
  })
  expect(f.wizard.agent.entry.value?.task).toBeNull()
  expect(f.wizard.agent.entry.value?.state).toBe('done')
  expect(f.wizard.canContinue.value).toBe(false)
  expect(f.wizard.canSkip.value).toBe(true)
  await f.wizard.skip(true)
  expect(f.wizard.step.value).toBe('grow')
  f.wizard.dispose()
})

it('requires a single directory name and rejects old daemons before starting the wizard', async () => {
  expect(validLinuxVmName(' Linux 主机 ')).toBe(true)
  for (const name of ['', '.', '..', 'a/b', 'a\\b', 'bad\nname', '.dvm-private', '字'.repeat(86)]) {
    expect(validLinuxVmName(name)).toBe(false)
    const invalid = fixture()
    await invalid.wizard.choose(sourceId, name)
    expect(invalid.disk.prepare).not.toHaveBeenCalled()
    expect(invalid.wizard.step.value).toBe('select')
    invalid.wizard.dispose()
  }
  const oldDaemon = fixture()
  oldDaemon.disk.cloneDirectorySupported = () => false
  await oldDaemon.wizard.choose(sourceId, 'Linux')
  expect(oldDaemon.disk.prepare).not.toHaveBeenCalled()
  expect(oldDaemon.wizard.supported.value).toBe(false)
  oldDaemon.wizard.dispose()
})

it('keeps cloning bound to the chosen VM directory and refuses a lost directory capability', async () => {
  const f = fixture()
  await f.wizard.choose(sourceId, 'Linux')
  const operation = {
    action: 'clone' as const,
    diskId: sourceId,
    folder: '/images/Linux',
    name: 'root.img',
    compress: 'none' as const,
    createFolder: true,
  }
  for (const changed of [
    { ...operation, folder: '/images/other' },
    { ...operation, createFolder: false },
    { ...operation, createFolder: undefined },
  ]) {
    await f.wizard.prepare()
    await f.wizard.diskActions.submit(changed)
    expect(f.submitDisk).not.toHaveBeenCalled()
    expect(f.wizard.canContinue.value).toBe(false)
  }
  await f.wizard.prepare()
  f.disk.cloneDirectorySupported = () => false
  await f.wizard.diskActions.submit(operation)
  expect(f.submitDisk).not.toHaveBeenCalled()
  expect(f.wizard.source.value?.disk.path).toBe('/source')
  expect(f.wizard.targetId.value).toBeNull()
  f.wizard.dispose()
})
