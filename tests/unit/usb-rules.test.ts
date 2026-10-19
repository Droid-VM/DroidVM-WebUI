import { expect, it, vi } from 'vitest'
import { createUsbRulesGateway } from '../../src/modules/usbRules/api/http'
import type {
  UsbRulesDocument,
  UsbRulesGateway,
  RulesSnapshot,
  UsbRulesPreview,
} from '../../src/modules/usbRules/api/gateway'
import { createUsbRulesEditor } from '../../src/modules/usbRules/model/editor'
import {
  documentIssues,
  normalizedRules,
  deviceSubject,
} from '../../src/modules/usbRules/model/document'
import type { Task } from '../../src/modules/tasks'
import { ApiError } from '../../src/shared/api/errors'

const empty = (): UsbRulesDocument => ({
  version: 1,
  enabled: false,
  exact: [],
  port: [],
  device: [],
  any: [],
})
const snapshot = (): RulesSnapshot => ({
  revision: 'initial',
  persistence: 'persisted',
  rules: empty(),
})
const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const access = () => ({
  context,
  csrfToken: 'b'.repeat(64),
  administrator: true,
  manageTasks: true,
  capabilities: ['usb.rules.v1'],
})
const task: Task = {
  id: 'task-1',
  requestId: 'request-1',
  kind: 'usb_rules',
  resource: 'usb-rules',
  revision: '1',
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
}
function gateway(): UsbRulesGateway {
  return {
    supported: () => true,
    previewSupported: () => true,
    preview: vi.fn(),
    read: vi.fn().mockResolvedValue(snapshot()),
    targets: vi.fn().mockResolvedValue([{ vmId: 'vm', vmName: 'VM', controllerId: 'xhci-0' }]),
    stage: vi.fn().mockResolvedValue('upload-1'),
    abort: vi.fn(),
    submit: vi.fn().mockRejectedValue(new ApiError('offline', 'lost receipt')),
    find: vi.fn().mockResolvedValue(null),
  }
}

it('uses native layer fields, exact serial case and Unicode decimal port semantics', () => {
  const rules = empty()
  rules.exact = [
    {
      id: 'ABCD:1234:Case:序列号',
      port: '١.２',
      target: 'vm',
      vm: 'old-vm',
      controller: 'old-controller',
    },
  ]
  rules.any = [{ target: 'host' }]
  expect(documentIssues(rules)).toEqual([])
  expect(normalizedRules(rules).exact[0]?.id).toBe('abcd:1234:Case:序列号')
  for (const invalid of ['1234:abcd\n', '1234:abcd:', '1234:abcd:serial\u0085']) {
    rules.exact[0]!.id = invalid
    expect(documentIssues(rules).some((issue) => issue.field === 'id')).toBe(true)
  }
  rules.exact[0]!.port = '1.2\n'
  rules.any[0]!.vm = 'wrong'
  expect(documentIssues(rules).map((issue) => issue.field)).toEqual(['id', 'port', 'target'])
  expect(
    deviceSubject({
      vendorId: 'ABCD',
      productId: '1234',
      serial: 'SERIAL',
      sysfs: '2-1.4',
    } as Parameters<typeof deviceSubject>[0]),
  ).toEqual({ id: 'abcd:1234:SERIAL', port: '1.4' })
})

it('rejects mixed pages, corrupt bytes, wrong task identities and cleans up incomplete uploads', async () => {
  const rules = {
    ...empty(),
    device: Array.from({ length: 1200 }, (_, i) => ({
      id: `1234:abcd:序列号-${i}`,
      target: 'sink',
    })),
  }
  const bytes = new TextEncoder().encode(JSON.stringify(rules)),
    chunk = 48 * 1024
  const page = (offset: number) => ({
    context,
    revision: 'initial',
    persistence: 'persisted',
    offset,
    total: bytes.length,
    next: offset + chunk < bytes.length ? offset + chunk : null,
    data: btoa(String.fromCharCode(...bytes.subarray(offset, offset + chunk))),
  })
  expect(bytes.length).toBeGreaterThan(chunk)
  const client = { getJson: vi.fn(), postJson: vi.fn(), delete: vi.fn() },
    signal = new AbortController().signal
  const api = createUsbRulesGateway(client, access)
  client.postJson.mockResolvedValueOnce(page(0)).mockResolvedValueOnce(page(chunk))
  expect((await api.read(signal)).rules).toEqual(rules)
  for (const bad of [
    { ...page(chunk), revision: 'other' },
    { ...page(chunk), offset: 0 },
    { ...page(chunk), next: chunk },
    { ...page(chunk), persistence: 'uncertain' },
    { ...page(chunk), data: '!!!!' },
  ]) {
    client.postJson.mockResolvedValueOnce(page(0)).mockResolvedValueOnce(bad)
    await expect(api.read(signal)).rejects.toMatchObject({ code: 'invalid-response' })
  }
  client.postJson.mockResolvedValueOnce({ ...page(0), total: 8388609 })
  await expect(api.read(signal)).rejects.toMatchObject({ code: 'invalid-response' })
  client.postJson.mockResolvedValueOnce({
    ...page(0),
    context: { ...context, daemonEpoch: 'other' },
  })
  await expect(api.read(signal)).rejects.toMatchObject({ code: 'context-changed' })
  client.postJson.mockResolvedValueOnce({
    context,
    task: { ...task, resource: 'wrong' },
    version: { revision: 'saved', persistence: 'persisted', applied: 0 },
  })
  await expect(
    api.find({ uploadId: 'upload-1', requestId: 'request-1' }, signal),
  ).rejects.toMatchObject({ code: 'invalid-response' })
  client.postJson
    .mockResolvedValueOnce({ context, uploadId: 'upload-1' })
    .mockResolvedValueOnce({ context, received: 1 })
    .mockResolvedValueOnce({ context })
  await expect(api.stage('initial', '{}', signal)).rejects.toMatchObject({
    code: 'invalid-response',
  })
  expect(client.postJson).toHaveBeenLastCalledWith(
    '/api/v1/usb-rules/abort',
    { context, uploadId: 'upload-1' },
    expect.any(AbortSignal),
    { csrf: access().csrfToken, status: 200 },
  )
})

it('retains drafts and old references across catalog errors, lost receipts and same-session suspension', async () => {
  const api = gateway(),
    editor = createUsbRulesEditor(api, () => 'request-1')
  editor.bind('session')
  await editor.open()
  editor.add('device')
  editor.update('device', 0, {
    id: '1234:ABCD:Case',
    target: 'vm',
    vm: 'old-vm',
    controller: 'old-controller',
  })
  vi.mocked(api.targets).mockRejectedValue(new ApiError('offline', 'offline'))
  await editor.refreshTargets()
  expect(editor.targets.value).toHaveLength(1)
  expect(editor.draft.value?.device[0]?.vm).toBe('old-vm')
  await editor.save()
  expect(editor.entry.value?.state).toBe('unknown')
  editor.pause()
  editor.bind('session')
  await editor.reconcile()
  await editor.save()
  expect(await editor.reload()).toBe(false)
  expect(api.submit).toHaveBeenCalledTimes(1)
  const changed = {
    ...snapshot(),
    revision: 'new',
    persistence: 'uncertain' as const,
    rules: { ...empty(), enabled: true },
  }
  vi.mocked(api.find).mockResolvedValue({
    ...task,
    state: 'failed',
    errorCode: 'COMMIT_UNCERTAIN',
    resultAvailable: false,
  })
  vi.mocked(api.read).mockResolvedValue(changed)
  await editor.reconcile()
  expect(editor.blocked.value).toBe(true)
  expect(editor.observed.value?.persistence).toBe('uncertain')
  expect(editor.draft.value?.device[0]?.id).toBe('1234:ABCD:Case')
  expect(editor.canSave.value).toBe(false)
  await editor.reload()
  expect(editor.draft.value?.enabled).toBe(true)
  expect(editor.canSave.value).toBe(true)
  editor.bind('different-session')
  expect(editor.draft.value).toBeNull()
  expect(editor.entry.value).toBeNull()
})

it('waits for a successful readback after task completion and ignores late reads from an old session', async () => {
  const api = gateway(),
    editor = createUsbRulesEditor(api, () => 'request-1')
  editor.bind('session')
  await editor.open()
  editor.add('any')
  vi.mocked(api.submit).mockResolvedValue(task)
  vi.mocked(api.read).mockRejectedValueOnce(new ApiError('offline', 'offline'))
  await editor.save()
  expect(editor.saved.value).toBe(false)
  expect(editor.pending.value).toBe(true)
  expect(editor.draft.value?.any).toHaveLength(1)
  vi.mocked(api.find).mockResolvedValue(task)
  vi.mocked(api.read).mockResolvedValue({
    ...snapshot(),
    revision: 'saved',
    rules: { ...empty(), any: [{ target: 'sink' }] },
  })
  await editor.reconcile()
  expect(editor.saved.value).toBe(true)
  expect(editor.dirty.value).toBe(false)
  expect(editor.pending.value).toBe(false)
  let finish!: (value: RulesSnapshot) => void
  vi.mocked(api.read).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const reload = editor.reload()
  editor.bind('other-session')
  finish(snapshot())
  await reload
  expect(editor.draft.value).toBeNull()
})

const preview: UsbRulesPreview = {
  context,
  revision: 'initial',
  persistence: 'persisted',
  enabled: true,
  items: [
    {
      device: {
        id: '1-1.2#3',
        sysfs: '1-1.2',
        busNumber: 1,
        deviceNumber: 3,
        vendorId: '1234',
        productId: 'abcd',
        manufacturer: '',
        product: '',
        serial: '',
        speed: '',
        state: 'host',
        locked: false,
        owner: null,
      },
      eligible: true,
      match: { layer: 'any', index: 0, target: 'sink', vmId: null, controllerId: null },
    },
  ],
}
it('gates preview capability and rejects mismatched versions, identities and eligibility', async () => {
  const client = { getJson: vi.fn(), postJson: vi.fn().mockResolvedValue(preview), delete: vi.fn() }
  const signal = new AbortController().signal
  const old = createUsbRulesGateway(client, access)
  expect(old.previewSupported()).toBe(false)
  await expect(old.preview('initial', signal)).rejects.toMatchObject({ code: 'unsupported' })
  expect(client.postJson).not.toHaveBeenCalled()
  const api = createUsbRulesGateway(client, () => ({
    ...access(),
    capabilities: [...access().capabilities, 'usb.rules.preview.v1'],
  }))
  expect(await api.preview('initial', signal)).toEqual(preview)
  const item = preview.items[0]!
  for (const value of [
    { ...preview, revision: 'other' },
    { ...preview, items: [item, item] },
    { ...preview, items: [{ ...item, eligible: false }] },
    { ...preview, items: [{ ...item, device: { ...item.device, locked: true } }] },
    { ...preview, items: [{ ...item, device: { ...item.device, deviceNumber: 4 } }] },
    { ...preview, items: [{ ...item, match: { ...item.match, layer: null } }] },
    { ...preview, enabled: false },
  ]) {
    client.postJson.mockResolvedValueOnce(value)
    await expect(api.preview('initial', signal)).rejects.toMatchObject({ code: 'invalid-response' })
  }
})
it('invalidates preview on draft edits and ignores late results without changing saved or draft rules', async () => {
  const api = gateway(),
    editor = createUsbRulesEditor(api)
  const base = {
    ...snapshot(),
    rules: { ...empty(), enabled: true, any: [{ target: 'sink' as const }] },
  }
  vi.mocked(api.read).mockResolvedValue(base)
  vi.mocked(api.preview).mockResolvedValue(preview)
  await editor.open()
  await editor.preview()
  expect(editor.previewData.value?.items[0]?.match?.layer).toBe('any')
  expect(editor.dirty.value).toBe(false)
  expect(api.submit).not.toHaveBeenCalled()
  let resolve!: (result: UsbRulesPreview) => void
  vi.mocked(api.preview).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const pending = editor.preview()
  editor.enabled(false)
  expect(editor.canPreview.value).toBe(false)
  resolve(preview)
  await pending
  expect(editor.previewData.value).toBeNull()
  expect(editor.draft.value?.enabled).toBe(false)
  await editor.reload()
  vi.mocked(api.preview).mockResolvedValueOnce({
    ...preview,
    items: [{ ...preview.items[0]!, match: { ...preview.items[0]!.match!, index: 99 } }],
  })
  await editor.preview()
  expect(editor.previewProblem.value?.code).toBe('invalid-response')
  expect(editor.previewData.value).toBeNull()
  vi.mocked(api.preview).mockRejectedValueOnce(new ApiError('conflict', 'rules changed'))
  await editor.preview()
  expect(editor.previewProblem.value?.code).toBe('conflict')
  expect(JSON.parse(editor.exportJson())).toEqual(base.rules)
})
