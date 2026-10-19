import { expect, it, vi } from 'vitest'
import {
  createPackageExportGateway,
  type PackageExportPlan,
  type PackageExportRequest,
} from '../../src/modules/packages/api/export'
import { createPackageExport } from '../../src/modules/packages/model/export'
import {
  exportDraft,
  exportOperation,
  exportVolume,
} from '../../src/modules/packages/model/exportForm'
import { ApiError } from '../../src/shared/api/errors'
import type { Task } from '../../src/modules/tasks'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const plan: PackageExportPlan = {
  context,
  vmId: 'vm',
  vmName: 'Example',
  vmRevision: 'vms',
  diskRevision: 'disks',
  networkRevision: 'networks',
  disks: [
    { index: 0, path: '/first.qcow2', readonly: false },
    { index: 2, path: '/second.qcow2', readonly: true },
  ],
  compressions: ['NONE', 'GZIP', 'XZ', 'ZSTD'],
  minVolumeBytes: '16777216',
}
const request: PackageExportRequest = {
  requestId: 'export-request',
  vmId: plan.vmId,
  vmRevision: plan.vmRevision,
  diskRevision: plan.diskRevision,
  networkRevision: plan.networkRevision,
  operation: {
    destination: '/export.pkg',
    compression: 'NONE',
    volumeBytes: '0',
    disks: [],
    overwriteConfirmed: true,
  },
}
const done: Task = {
  id: 'export-task',
  requestId: request.requestId,
  kind: 'vm_export',
  resource: 'package',
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
  packageExport: { volumeCount: 0 },
}
function fixture() {
  const gateway = {
    supported: () => true,
    plan: vi.fn().mockResolvedValue(plan),
    submit: vi.fn().mockResolvedValue(done),
    find: vi.fn().mockResolvedValue(null),
  }
  const model = createPackageExport(
    gateway,
    async () => true,
    () => request.requestId,
  )
  model.bind('session')
  return { gateway, model }
}
it('preserves exact int64 volume bytes and explicit no-disk export with actual VM indexes', () => {
  for (const value of ['0', '16777216', '9007199254740993', '9223372036854775807'])
    expect(exportVolume(value)).toBe(value)
  for (const value of ['1', '16777215', '9223372036854775808', '01', '1e9', '-1', '16.5'])
    expect(exportVolume(value)).toBeNull()
  const draft = { ...exportDraft(), destination: '/export.pkg' }
  expect(exportOperation(draft, plan)?.disks).toEqual([])
  expect(exportOperation({ ...draft, disks: [2, 0] }, plan)?.disks).toEqual([0, 2])
  expect(exportOperation({ ...draft, disks: [1] }, plan)).toBeNull()
  expect(exportOperation({ ...draft, destination: 'C:\\Downloads\\export.pkg' }, plan)).toBeNull()
  expect(exportOperation({ ...draft, destination: '/folder/' }, plan)).toBeNull()
})

it('validates plan identity and success volume results before exposing a host export', async () => {
  const client = {
    getJson: vi.fn().mockResolvedValue(plan),
    postJson: vi.fn().mockResolvedValue({ context, task: done }),
    delete: vi.fn(),
  }
  const access = () => ({
    context,
    csrfToken: 'b'.repeat(64),
    capabilities: ['packages.export.v1'],
    administrator: true,
    manageTasks: true,
  })
  const gateway = createPackageExportGateway(client, access),
    signal = new AbortController().signal
  expect(await gateway.plan('vm', signal)).toEqual(plan)
  client.getJson.mockResolvedValueOnce({ ...plan, disks: [plan.disks[0], plan.disks[0]] })
  await expect(gateway.plan('vm', signal)).rejects.toMatchObject({ code: 'invalid-response' })
  expect((await gateway.submit(request, signal)).packageExport?.volumeCount).toBe(0)
  expect(client.postJson).toHaveBeenCalledWith(
    '/api/v1/package-exports',
    { ...request, context },
    signal,
    { csrf: access().csrfToken, status: 202 },
  )
  client.getJson.mockResolvedValueOnce({ context, task: { ...done, packageExport: undefined } })
  await expect(gateway.find(request, signal)).rejects.toMatchObject({ code: 'invalid-response' })
  client.getJson.mockResolvedValueOnce({
    context,
    task: { ...done, packageExport: { volumeCount: 1000 } },
  })
  await expect(gateway.find(request, signal)).rejects.toMatchObject({ code: 'invalid-response' })
  await expect(
    gateway.submit({ ...request, operation: { ...request.operation, volumeBytes: '1' } }, signal),
  ).rejects.toMatchObject({ code: 'conflict' })
  expect(client.postJson).toHaveBeenCalledTimes(1)
})

it('retains an unknown export across page departure and only queries its original request', async () => {
  const { model, gateway } = fixture()
  gateway.submit.mockRejectedValueOnce(new Error('lost receipt'))
  await model.prepare('vm')
  model.draft.destination = '/export.pkg'
  model.draft.disks = []
  model.reviewDraft()
  await model.submit()
  expect(gateway.submit).not.toHaveBeenCalled()
  model.acknowledged.value = true
  await model.submit()
  model.leave()
  await model.prepare('vm')
  await model.submit()
  await model.reconcile()
  expect(model.entry.value?.state).toBe('unknown')
  expect(model.entry.value?.request).toEqual(request)
  expect(model.draft.disks).toEqual([])
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.plan).toHaveBeenCalledTimes(1)
  gateway.find.mockResolvedValueOnce(done)
  await model.reconcile()
  await model.submit()
  expect(model.entry.value?.state).toBe('done')
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  model.dispose()
})

it('keeps conflict drafts but requires a fresh plan and new confirmation, dropping late session reads', async () => {
  const { model, gateway } = fixture()
  gateway.submit.mockRejectedValueOnce(new ApiError('conflict', 'Version changed'))
  await model.prepare('vm')
  model.draft.destination = '/chosen.pkg'
  model.draft.compression = 'XZ'
  model.draft.volumeBytes = '9007199254740993'
  model.draft.disks = [2]
  model.reviewDraft()
  model.acknowledged.value = true
  await model.submit()
  expect(model.entry.value?.state).toBe('done')
  expect(model.plan.value).toBeNull()
  model.reviewDraft()
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  gateway.plan.mockResolvedValueOnce({ ...plan, vmRevision: 'new-vms' })
  await model.prepare()
  expect(model.draft).toMatchObject({
    destination: '/chosen.pkg',
    compression: 'XZ',
    volumeBytes: '9007199254740993',
    disks: [2],
  })
  model.reviewDraft()
  expect(model.review.value?.vmRevision).toBe('new-vms')
  expect(model.acknowledged.value).toBe(false)
  model.draft.destination = '/changed.pkg'
  expect(model.review.value).toBeNull()
  let finish!: (value: PackageExportPlan) => void
  gateway.plan.mockImplementationOnce(
    () =>
      new Promise<PackageExportPlan>((resolve) => {
        finish = resolve
      }),
  )
  const late = model.prepare()
  model.bind('another-session')
  finish(plan)
  await late
  expect(model.plan.value).toBeNull()
  expect(model.target.value).toBeNull()
  model.dispose()
})
