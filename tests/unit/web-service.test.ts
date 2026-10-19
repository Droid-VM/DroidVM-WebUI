import { expect, it, vi } from 'vitest'
import { createWebService } from '../../src/modules/webService/model/service'
import { parseWebSettings, webServiceDraft } from '../../src/modules/webService/lib/settings'
import type {
  WebServiceGateway,
  WebServiceRequest,
  WebServiceStatus,
} from '../../src/modules/webService/api/http'
import type { Task } from '../../src/modules/tasks'

const settings = { enabled: true, port: 8080, scope: 'lan' as const, publicOrigins: [] as string[] }
function status(overrides: Partial<WebServiceStatus> = {}): WebServiceStatus {
  return {
    context: { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) },
    settings: structuredClone(settings),
    running: true,
    state: 'running',
    error: null,
    addresses: ['http://127.0.0.1:8080'],
    applyPending: false,
    ...overrides,
  }
}
function done(request: WebServiceRequest): Task {
  return {
    id: 'service-task',
    requestId: request.requestId,
    kind: 'web_service',
    resource: 'webui',
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
    webService: { action: request.action, settings: request.settings, applyPending: true },
  }
}
function fixture() {
  const gateway = {
    supported: () => true,
    read: vi.fn(async () => status()),
    submit: vi.fn(async (request: WebServiceRequest) => done(request)),
    find: vi.fn(async (request: WebServiceRequest): Promise<Task | null> => done(request)),
  } satisfies WebServiceGateway
  const model = createWebService(gateway, () => 'service-request')
  return { model, gateway }
}
async function review(model: ReturnType<typeof createWebService>) {
  await model.read()
  model.draft.origins = 'http://example.test:80'
  model.reviewAction('configure')
  model.acknowledged.value = true
}

it('keeps exact origin values, duplicate entries and explicit ports while checking native boundaries', () => {
  const draft = webServiceDraft(settings)
  draft.origins = 'http://example.test:80\nhttp://example.test:80'
  expect(parseWebSettings(draft)?.publicOrigins).toEqual([
    'http://example.test:80',
    'http://example.test:80',
  ])
  for (const origin of [
    'https://example.test',
    'http://user@example.test',
    'http://example.test/path',
    'http://example.test?q=1',
    'http://例子.test',
    'http://example.test ',
  ])
    expect(parseWebSettings({ ...draft, origins: origin })).toBeNull()
  expect(parseWebSettings({ ...draft, port: '1023' })).toBeNull()
  expect(
    parseWebSettings({ ...draft, origins: Array(9).fill('http://example.test').join('\n') }),
  ).toBeNull()
})

it('does not call a queued task applied until status matches and the actual listener is healthy', async () => {
  const { model, gateway } = fixture()
  await review(model)
  const target = { ...settings, publicOrigins: ['http://example.test:80'] }
  gateway.read.mockResolvedValue(status({ settings: target, applyPending: true }))
  await model.submit()
  expect(model.applied.value).toBe(false)
  expect(model.editable.value).toBe(false)
  gateway.read.mockResolvedValue(
    status({ settings: target, state: 'local_only', error: 'discovery_failed' }),
  )
  await model.reconcile()
  expect(model.applied.value).toBe(false)
  gateway.read.mockResolvedValue(
    status({ settings: target, state: 'error', running: false, error: 'listen_failed' }),
  )
  await model.reconcile()
  expect(model.applied.value).toBe(false)
  gateway.read.mockResolvedValue(status({ settings: target }))
  await model.reconcile()
  expect(model.applied.value).toBe(true)
  expect(model.editable.value).toBe(true)
  expect(model.baseline.value?.publicOrigins).toEqual(target.publicOrigins)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
})

it('queries a lost receipt without replay and does not unlock an unknown write just because settings match', async () => {
  const { model, gateway } = fixture()
  await review(model)
  gateway.submit.mockRejectedValueOnce(new Error('receipt lost'))
  await model.submit()
  gateway.find.mockResolvedValueOnce(null)
  gateway.read.mockResolvedValue(
    status({ settings: { ...settings, publicOrigins: ['http://example.test:80'] } }),
  )
  await model.reconcile()
  expect(model.entry.value?.state).toBe('unknown')
  expect(model.applied.value).toBe(false)
  expect(model.editable.value).toBe(false)
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  await model.reconcile()
  expect(model.applied.value).toBe(true)
})

it('pins the read baseline, invalidates changed confirmation, and restarts only saved settings', async () => {
  const { model, gateway } = fixture()
  await review(model)
  model.draft.port = '9090'
  expect(model.review.value).toBeNull()
  expect(model.acknowledged.value).toBe(false)
  model.reviewAction('restart')
  expect(model.review.value?.settings).toEqual(settings)
  expect(model.review.value?.expected).toEqual(settings)
  model.acknowledged.value = true
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledWith(
    { action: 'restart', expected: settings, settings, requestId: 'service-request' },
    expect.any(AbortSignal),
  )
  model.bind('different-epoch:session')
  expect(model.baseline.value).toBeNull()
  expect(model.review.value).toBeNull()
  expect(model.applied.value).toBe(false)
})

it('blocks a new workflow while a settings write still requires host App recovery', async () => {
  const { model, gateway } = fixture()
  await review(model)
  gateway.submit.mockImplementationOnce(async (request) => {
    const task = done(request)
    delete task.webService
    return { ...task, state: 'failed' as const, errorCode: 'COMMIT_UNCERTAIN' }
  })
  gateway.read.mockResolvedValue(status({ error: 'configuration_write_failed' }))
  await model.submit()
  model.outcomeAcknowledged.value = true
  expect(model.canRestartWorkflow.value).toBe(false)
  model.restartWorkflow()
  expect(model.editable.value).toBe(false)
  gateway.read.mockResolvedValue(status())
  await model.reconcile()
  model.outcomeAcknowledged.value = true
  model.restartWorkflow()
  expect(model.editable.value).toBe(true)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
})
