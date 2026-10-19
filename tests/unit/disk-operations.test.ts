import { expect, it, vi } from 'vitest'
import {
  diskBytes,
  diskForm,
  buildDiskOperation,
  diskImpact,
} from '../../src/modules/resources/model/diskForm'
import {
  createDiskActionGateway,
  validDiskOperation,
  type DiskPreparation,
  type DiskRequest,
  type DiskRecoveryRequest,
} from '../../src/modules/resources/api/diskOperations'
import { createDiskActions } from '../../src/modules/resources/model/diskOperations'
import type { DiskDetail } from '../../src/modules/resources/api/gateway'
import type { Task } from '../../src/modules/tasks'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const disk = (id: string, parentId: string | null = null) => ({
  id,
  name: id,
  path: '/' + id,
  parentId,
  backing: false,
  selectable: true,
})
const detail: DiskDetail = {
  context,
  revision: 'disks',
  vmRevision: 'vms',
  disk: disk('base'),
  chain: [disk('base')],
  chainComplete: true,
  children: [disk('child', 'base')],
  attachments: [],
  readOnlyRequired: true,
  checkedAtMs: 1000,
  inspection: {
    state: 'ready',
    format: 'qcow2',
    virtualBytes: '8589934592',
    allocatedBytes: '0',
    clusterBytes: null,
    encrypted: false,
    dirty: false,
    compression: null,
  },
}
const prepared: DiskPreparation = {
  catalog: {
    context,
    revision: 'disks',
    vmRevision: 'vms',
    items: [disk('base'), disk('child', 'base'), disk('grandchild', 'child'), disk('other')],
  },
  detail,
  parent: null,
}
const request: DiskRequest = {
  requestId: 'operation-1',
  revision: 'disks',
  vmRevision: 'vms',
  operation: {
    action: 'create',
    folder: '/fixture',
    name: 'new.qcow2',
    format: 'qcow2',
    size: '9007199254740993',
  },
}
const done: Task = {
  id: 'task-1',
  requestId: request.requestId,
  kind: 'disk_operation',
  resource: 'disk:new',
  revision: '2',
  state: 'succeeded',
  cancellable: false,
  phase: '',
  unit: '',
  completed: '0',
  total: null,
  createdMs: '1',
  finishedMs: '2',
  resultAvailable: true,
  errorCode: null,
  diskId: 'new-disk',
}
const access = () => ({
  context,
  administrator: true,
  manageTasks: true,
  csrfToken: 'b'.repeat(64),
  capabilities: ['disks.operations.v1', 'disks.list.v1', 'disks.inspect.v1'],
})

it('requires the negotiated clone-directory capability and confines the option to clone', async () => {
  const client = { getJson: vi.fn(), postJson: vi.fn(), delete: vi.fn() }
  const clone: DiskRequest = {
    ...request,
    operation: {
      action: 'clone',
      diskId: 'base',
      folder: '/fixture/Linux',
      name: 'disk.qcow2',
      createFolder: true,
    },
  }
  const signal = new AbortController().signal
  const legacy = createDiskActionGateway(client, access)
  expect(legacy.cloneDirectorySupported?.()).toBe(false)
  await expect(legacy.submit(clone, signal)).rejects.toMatchObject({ code: 'unsupported' })
  expect(client.postJson).not.toHaveBeenCalled()
  expect(validDiskOperation({ ...request.operation, createFolder: false })).toBe(false)
  expect(validDiskOperation({ ...clone.operation, createFolder: 'true' })).toBe(false)
  const gateway = createDiskActionGateway(client, () => ({
    ...access(),
    capabilities: [...access().capabilities, 'disks.clone-directory.v1'],
  }))
  expect(gateway.cloneDirectorySupported?.()).toBe(true)
  client.postJson.mockResolvedValue({ context, task: { ...done, resource: 'disk:base' } })
  await gateway.submit(clone, signal)
  expect(client.postJson).toHaveBeenCalledWith(
    '/api/v1/disk-operations',
    { ...clone, context },
    signal,
    { csrf: access().csrfToken, status: 202 },
  )
})

it('snapshots shared CPU defaults once and preserves explicit retry parameters including an unbound choice', async () => {
  const defaults = vi.fn(async (): Promise<readonly number[]> => [2, 3])
  const gateway = {
    supported: () => true,
    prepare: vi.fn(async () => prepared),
    submit: vi.fn(async () => done),
    find: vi.fn(async () => null),
  }
  const model = createDiskActions(gateway, async () => true, undefined, undefined, defaults)
  await model.prepare(null, 'create')
  const form = diskForm('', model.initial.value, model.defaultCpus.value)
  expect(form.cpus).toBe('2-3')
  form.cpus = ''
  form.folder = '/fixture'
  form.name = 'explicit.qcow2'
  const previous = buildDiskOperation('create', null, form)!
  expect(previous).not.toHaveProperty('cpus')
  defaults.mockResolvedValue([6, 7])
  expect(form.cpus).toBe('')
  await model.prepare(null, 'create', previous)
  expect(defaults).toHaveBeenCalledTimes(1)
  expect(diskForm('', model.initial.value, model.defaultCpus.value).cpus).toBe('')
  await model.prepare(null, 'create', { ...previous, cpus: [1] })
  expect(diskForm('', model.initial.value, model.defaultCpus.value).cpus).toBe('1')
  expect(defaults).toHaveBeenCalledTimes(1)
  model.dispose()
})

it('does not open a prepared disk form when shared defaults cannot be read', async () => {
  const defaults = vi.fn(async (): Promise<readonly number[] | undefined> => {
    throw new Error('defaults unavailable')
  })
  const gateway = {
    supported: () => true,
    prepare: vi.fn(async () => prepared),
    submit: vi.fn(async () => done),
    find: vi.fn(async () => null),
  }
  const model = createDiskActions(gateway, async () => true, undefined, undefined, defaults)
  await model.prepare(null, 'create')
  expect(model.preparation.value).toBeNull()
  expect(model.problem.value).not.toBeNull()
  expect(gateway.submit).not.toHaveBeenCalled()
  defaults.mockResolvedValue(undefined)
  await model.prepare(null, 'create')
  expect(model.preparation.value).not.toBeNull()
  expect(diskForm('', null, model.defaultCpus.value).cpus).toBe('')
  model.dispose()
})

it('only releases an uncertain commit after a confirmed zero-record recovery and refresh', async () => {
  const recoveryTask = (request: DiskRecoveryRequest, pendingRecords: number): Task => ({
    ...done,
    diskId: undefined,
    id: 'recovery-task',
    requestId: request.requestId,
    kind: 'disk_recovery',
    resource: 'disks',
    pendingRecords,
  })
  const recovery = {
    supported: () => true,
    status: vi.fn().mockResolvedValue(0),
    submit: vi.fn(async (request: DiskRecoveryRequest) => recoveryTask(request, 1)),
    find: vi.fn<(request: DiskRecoveryRequest) => Promise<Task | null>>().mockResolvedValue(null),
  }
  const gateway = {
    recovery,
    supported: () => true,
    prepare: vi.fn().mockResolvedValue(prepared),
    submit: vi.fn().mockResolvedValue({
      ...done,
      diskId: undefined,
      state: 'failed',
      errorCode: 'COMMIT_UNCERTAIN',
    }),
    find: vi.fn(),
  }
  const actions = createDiskActions(
    gateway,
    async () => true,
    () => request.requestId,
  )
  actions.bind('first')
  await actions.prepare(null, 'create')
  await actions.submit(request.operation)
  await actions.recovery.readStatus()
  expect(actions.allowed.value).toBe(false) // A read-only count is not a recovery receipt.
  await actions.recovery.submit()
  expect(actions.allowed.value).toBe(false) // Remaining records require another explicit attempt.
  recovery.submit.mockRejectedValueOnce(new Error('lost'))
  await actions.recovery.submit()
  await actions.recovery.reconcile()
  expect(actions.recovery.settled.value).toBe(false)
  expect(actions.allowed.value).toBe(false)
  recovery.find.mockImplementation(async (request) => recoveryTask(request, 0))
  await actions.recovery.reconcile()
  expect(actions.allowed.value).toBe(true)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(recovery.submit).toHaveBeenCalledTimes(2)
  let finish!: (count: number) => void
  recovery.status.mockImplementationOnce(
    () =>
      new Promise<number>((resolve) => {
        finish = resolve
      }),
  )
  const late = actions.recovery.readStatus()
  actions.bind('second')
  finish(42)
  await late
  expect(actions.recovery.pending.value).toBeNull()
  expect(actions.recovery.recoveredRequest.value).toBeNull()
  await actions.recovery.readStatus()
  let complete!: () => void
  recovery.submit.mockImplementationOnce(
    (input) =>
      new Promise<Task>((resolve) => {
        complete = () => resolve(recoveryTask(input, 0))
      }),
  )
  const lateSubmit = actions.recovery.submit()
  actions.bind('third')
  const reads = recovery.status.mock.calls.length
  complete()
  await lateSubmit
  expect(recovery.status).toHaveBeenCalledTimes(reads)
  expect(actions.recovery.pending.value).toBeNull()
  actions.dispose()
})

it('validates recovery capability, scope, task identity and a bounded successful result', async () => {
  const client = { getJson: vi.fn(), postJson: vi.fn(), delete: vi.fn() }
  const denied = createDiskActionGateway(client, access).recovery!
  expect(denied.supported()).toBe(false)
  const gateway = createDiskActionGateway(client, () => ({
    ...access(),
    capabilities: [...access().capabilities, 'disks.recovery.v1'],
  })).recovery!
  const signal = new AbortController().signal,
    input = { requestId: 'recovery' }
  client.getJson.mockResolvedValue({ context, pendingRecords: 2 })
  expect(await gateway.status(signal)).toBe(2)
  const task = {
    ...done,
    diskId: undefined,
    requestId: input.requestId,
    kind: 'disk_recovery',
    resource: 'disks',
    pendingRecords: 0,
  }
  client.postJson.mockResolvedValue({ context, task })
  expect((await gateway.submit(input, signal)).pendingRecords).toBe(0)
  for (const invalid of [
    { ...task, pendingRecords: undefined },
    { ...task, pendingRecords: 65 },
    { ...task, resource: 'other' },
  ]) {
    client.getJson.mockResolvedValue({ context, task: invalid })
    await expect(gateway.find(input, signal)).rejects.toMatchObject({ code: 'invalid-response' })
  }
  client.getJson.mockResolvedValue({
    context: { ...context, daemonEpoch: 'other' },
    pendingRecords: 0,
  })
  await expect(gateway.status(signal)).rejects.toMatchObject({ code: 'context-changed' })
})

it('keeps exact capacities and retry options while rejecting oversized CPUs and unsupported compression', () => {
  expect(diskBytes('9007199254740993', 'B')).toBe('9007199254740993')
  expect(diskBytes('1.5', 'GiB')).toBe('1610612736')
  expect(diskBytes('0.1', 'B')).toBeNull()
  expect(diskBytes('9223372036854775808', 'B')).toBeNull()
  const form = diskForm('', { ...request.operation, cpus: [0, 1, 7] })
  expect(buildDiskOperation('create', null, form)).toMatchObject({
    ...request.operation,
    cpus: [0, 1, 7],
  })
  form.cpus = '0-4294967295'
  expect(buildDiskOperation('create', null, form)).toBeNull()
  form.cpus = ''
  form.format = 'raw'
  form.compression = 'zstd'
  expect(buildDiskOperation('create', null, form)).toBeNull()
  form.compression = 'none'
  expect(buildDiskOperation('delete', 'base', form)).toEqual({
    action: 'delete',
    diskId: 'base',
    deleteFiles: false,
  })
})

it('includes the complete deletion subtree and the merge parent and children', () => {
  expect(diskImpact(prepared, 'delete').disks.map((disk) => disk.id)).toEqual([
    'base',
    'child',
    'grandchild',
  ])
  const child = { ...detail, disk: disk('child', 'base'), children: [disk('grandchild', 'child')] }
  expect(
    diskImpact({ ...prepared, detail: child, parent: detail }, 'commit').disks.map(
      (disk) => disk.id,
    ),
  ).toEqual(['base', 'child', 'grandchild'])
  expect(diskImpact(prepared, 'clone').disks.map((disk) => disk.id)).toEqual(['base'])
})

it('requires matching disk and VM observations and verifies the result task identity', async () => {
  const client = {
    getJson: vi
      .fn()
      .mockResolvedValueOnce(prepared.catalog)
      .mockResolvedValueOnce({ ...detail, vmRevision: 'changed' }),
    postJson: vi.fn().mockResolvedValue({ context, task: done }),
    delete: vi.fn(),
  }
  const gateway = createDiskActionGateway(client, access),
    signal = new AbortController().signal
  await expect(gateway.prepare('base', 'resize', signal)).rejects.toMatchObject({
    code: 'conflict',
  })
  expect((await gateway.submit(request, signal)).diskId).toBe('new-disk')
  expect(client.postJson).toHaveBeenCalledExactlyOnceWith(
    '/api/v1/disk-operations',
    { ...request, context },
    signal,
    { csrf: access().csrfToken, status: 202 },
  )
  client.getJson.mockResolvedValue({ context, task: { ...done, resource: 'disk:other' } })
  await expect(gateway.find(request, signal)).rejects.toMatchObject({ code: 'invalid-response' })
})

it('drops closed preparation responses and queries unknown writes without resubmission', async () => {
  let finish!: (value: DiskPreparation) => void
  const gateway = {
    supported: () => true,
    prepare: vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<DiskPreparation>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValue(prepared),
    submit: vi.fn().mockRejectedValue(new Error('receipt lost')),
    find: vi.fn().mockResolvedValue(null),
  }
  const actions = createDiskActions(
    gateway,
    async () => true,
    () => request.requestId,
  )
  const late = actions.prepare(null, 'create')
  actions.close()
  finish(prepared)
  await late
  expect(actions.preparation.value).toBeNull()
  await actions.prepare(null, 'create')
  await actions.submit(request.operation)
  await actions.reconcile()
  expect(actions.allowed.value).toBe(false)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  gateway.find.mockResolvedValue(done)
  await actions.reconcile()
  expect(actions.entries.value.disk?.task?.diskId).toBe('new-disk')
  expect(actions.allowed.value).toBe(true)
  actions.dispose()
})
