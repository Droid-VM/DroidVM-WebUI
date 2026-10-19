import { expect, it, vi } from 'vitest'
import { createDiskActions } from '../../src/modules/resources/model/diskOperations'
import type { DiskPreparation } from '../../src/modules/resources/api/diskOperations'
import { createAgentOperations } from '../../src/modules/agent/model/operations'
import type { Task } from '../../src/modules/tasks'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const disk = {
  id: 'disk',
  name: 'Disk',
  path: '/disk.qcow2',
  parentId: null,
  backing: false,
  selectable: true,
}
const baseline: DiskPreparation = {
  catalog: { context, revision: 'disks', vmRevision: 'vms', items: [disk] },
  parent: null,
  detail: {
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
      format: 'qcow2',
      virtualBytes: '1024',
      allocatedBytes: '0',
      clusterBytes: null,
      encrypted: false,
      dirty: false,
      compression: null,
    },
  },
}
const resized = {
  catalog: baseline.catalog,
  detail: {
    ...baseline.detail!,
    inspection: { ...baseline.detail!.inspection, virtualBytes: '2048' },
  },
}
const operation = { action: 'resize' as const, diskId: 'disk', size: '2048' }
const task = (state: Task['state'] = 'succeeded'): Task => ({
  id: 'resize-task',
  requestId: 'resize-request',
  kind: 'disk_operation',
  resource: 'disk:disk',
  revision: '2',
  state,
  cancellable: false,
  phase: '',
  unit: '',
  completed: '0',
  total: null,
  createdMs: '1',
  finishedMs: state === 'running' ? null : '2',
  resultAvailable: state !== 'running',
  errorCode: null,
  diskId: 'disk',
})
function fixture() {
  const diskGateway = {
    supported: () => true,
    prepare: vi.fn().mockResolvedValue(baseline),
    submit: vi.fn().mockResolvedValue(task('running')),
    find: vi.fn().mockResolvedValue(task()),
  }
  const agentGateway = {
    supported: () => true,
    prepare: vi.fn().mockResolvedValue(resized),
    submit: vi.fn().mockRejectedValue(new Error('lost Agent receipt')),
    find: vi.fn().mockResolvedValue(null),
    recovery: { supported: () => false, status: vi.fn(), submit: vi.fn(), find: vi.fn() },
  }
  const agent = createAgentOperations(
    agentGateway,
    async () => true,
    () => 'grow-request',
  )
  const actions = createDiskActions(
    diskGateway,
    async () => true,
    () => 'resize-request',
    {
      available: () => agent.allowed.value && !agent.open.value,
      start: agent.submitAutoGrow,
    },
  )
  return { diskGateway, agentGateway, actions, agent }
}

it('serializes resize, fresh observations and one Agent POST, then only queries lost receipts', async () => {
  const { actions, agent, diskGateway, agentGateway } = fixture()
  let finish!: (value: typeof resized) => void
  agentGateway.prepare.mockImplementationOnce(
    () =>
      new Promise<typeof resized>((resolve) => {
        finish = resolve
      }),
  )
  await actions.prepare('disk', 'resize')
  await actions.submit(operation, true)
  expect(agentGateway.prepare).not.toHaveBeenCalled()
  const checking = actions.reconcile()
  await vi.waitFor(() => expect(agentGateway.prepare).toHaveBeenCalledTimes(1))
  expect(agentGateway.submit).not.toHaveBeenCalled()
  await actions.reconcile()
  finish(resized)
  await checking
  expect(actions.resizeGrow.sequence.value?.state).toBe('submitted')
  expect(agent.entry.value?.state).toBe('unknown')
  expect(agentGateway.submit.mock.calls[0]?.[0]).toEqual({
    requestId: 'grow-request',
    revision: 'disks',
    vmRevision: 'vms',
    operation: { action: 'autogrow', diskId: 'disk' },
  })
  await actions.reconcile()
  await agent.reconcile()
  await agent.reconcile()
  expect(diskGateway.submit).toHaveBeenCalledTimes(1)
  expect(agentGateway.submit).toHaveBeenCalledTimes(1)
  expect(agentGateway.find).toHaveBeenCalledTimes(2)
  actions.dispose()
  agent.dispose()
})

it('never advances failed, cancelled or lost resize receipts even after later successful lookup', async () => {
  for (const result of ['failed', 'cancelled', 'lost'] as const) {
    const { actions, agent, diskGateway, agentGateway } = fixture()
    if (result === 'lost')
      diskGateway.submit.mockRejectedValueOnce(new Error('lost resize receipt'))
    else diskGateway.submit.mockResolvedValueOnce(task(result))
    await actions.prepare('disk', 'resize')
    await actions.submit(operation, true)
    await actions.reconcile()
    expect(actions.resizeGrow.sequence.value?.state).toBe('stopped')
    expect(agentGateway.prepare).not.toHaveBeenCalled()
    expect(agentGateway.submit).not.toHaveBeenCalled()
    expect(diskGateway.submit).toHaveBeenCalledTimes(1)
    actions.dispose()
    agent.dispose()
  }
})

it('requires the confirmed disk and VM revisions and exact resized capacity without rebasing', async () => {
  for (const observed of [
    { ...resized, catalog: { ...resized.catalog, revision: 'changed' } },
    { ...resized, catalog: { ...resized.catalog, vmRevision: 'changed' } },
    { ...resized, detail: baseline.detail! },
  ]) {
    const { actions, agent, diskGateway, agentGateway } = fixture()
    diskGateway.submit.mockResolvedValueOnce(task())
    agentGateway.prepare.mockResolvedValueOnce(observed)
    await actions.prepare('disk', 'resize')
    await actions.submit(operation, true)
    expect(actions.resizeGrow.sequence.value?.state).toBe('stopped')
    expect(actions.resizeGrow.sequence.value?.problem?.code).toBe('conflict')
    await actions.reconcile()
    expect(agentGateway.submit).not.toHaveBeenCalled()
    actions.dispose()
    agent.dispose()
  }
})

it('cancels automatic continuation on route or session departure and excludes shrinking or unchanged size', async () => {
  for (const departure of ['route', 'session'] as const) {
    const { actions, agent, diskGateway, agentGateway } = fixture()
    await actions.prepare('disk', 'resize')
    expect(actions.canGrow({ ...operation, size: '1024' })).toBe(false)
    expect(actions.canGrow({ ...operation, size: '512', shrink: true })).toBe(false)
    expect(actions.canGrow({ ...operation, shrink: true })).toBe(false)
    let finish!: (value: typeof resized) => void
    agentGateway.prepare.mockImplementationOnce(
      () =>
        new Promise<typeof resized>((resolve) => {
          finish = resolve
        }),
    )
    diskGateway.submit.mockResolvedValueOnce(task())
    const pending = actions.submit(operation, true)
    await vi.waitFor(() => expect(agentGateway.prepare).toHaveBeenCalledTimes(1))
    if (departure === 'route') actions.resizeGrow.stop()
    else {
      actions.pause()
      agent.pause()
    }
    finish(resized)
    await pending
    await actions.reconcile()
    expect(actions.resizeGrow.sequence.value?.state).toBe('stopped')
    expect(agentGateway.submit).not.toHaveBeenCalled()
    actions.dispose()
    agent.dispose()
  }
})
