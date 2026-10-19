import { expect, it, vi } from 'vitest'
import { createHugepageProcesses } from '../../src/modules/hugepage-processes/model/processes'
import type {
  HugepageProcessGateway,
  ProcessEntry,
  ProcessIdentity,
  ProcessObservation,
  ProcessRequest,
  ProcessStack,
} from '../../src/modules/hugepage-processes/api/http'
import type { Task } from '../../src/modules/tasks'

function row(): ProcessEntry {
  return {
    pid: 302,
    name: 'crosvm',
    source: 'ko',
    pages: null,
    bytes: null,
    state: 'D',
    alive: true,
    identityStatus: 'verified',
    attributionVerified: false,
    startTicks: '9007199254740993',
    vm: { id: 'vm-one', name: 'Guest', runtimeInstance: 'instance', runtimeRevision: '8' },
    expected: { pid: 302, startTicks: '9007199254740993', source: 'scan', membership: 'member-1' },
    canSignal: true,
    canStack: true,
    reason: 'legacy-owner',
  }
}
function snapshot(): ProcessObservation {
  return {
    context: { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) },
    requestedSource: 'auto',
    source: 'ko',
    available: true,
    partial: true,
    coverage: 'module-owners',
    fallbackReason: null,
    observedAtMs: '100',
    pageBytes: '2097152',
    totals: { pages: null, bytes: null, knownPages: '0', knownBytes: '0' },
    entries: [row()],
    issues: ['legacy-owner'],
  }
}
function done(request: ProcessRequest): Task {
  return {
    id: 'task',
    requestId: request.requestId,
    kind: 'hugepage_process_signal',
    resource: 'hugepage-processes',
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
    hugepageProcessResult: {
      signal: request.signal,
      expected: request.expected,
      sent: true,
      uncertain: false,
      exited: false,
    },
  }
}
function fixture() {
  const gateway = {
    readable: () => true,
    supported: () => true,
    read: vi.fn(async () => snapshot()),
    stack: vi.fn(
      async (expected: ProcessIdentity): Promise<ProcessStack> => ({
        context: snapshot().context,
        expected,
        text: 'kernel_wait\n',
        available: true,
        truncated: false,
        reason: null,
      }),
    ),
    submit: vi.fn(async (request: ProcessRequest) => done(request)),
    find: vi.fn(async (_request: ProcessRequest): Promise<Task | null> => {
      void _request
      return null
    }),
  } satisfies HugepageProcessGateway
  return { gateway, model: createHugepageProcesses(gateway, () => 'request') }
}

it('keeps unknown attribution distinct and requires an explicit signal confirmation for the current VM', async () => {
  const { gateway, model } = fixture()
  await model.refresh()
  expect(model.status.value?.entries[0]?.pages).toBeNull()
  expect(model.status.value?.totals.bytes).toBeNull()
  model.prepare(row(), 'term')
  expect(model.review.value?.controlsCurrentVm).toBe(true)
  await model.submit()
  expect(gateway.submit).not.toHaveBeenCalled()
  model.confirmSignal.value = true
  await model.submit()
  expect(gateway.submit).toHaveBeenCalledWith(
    { requestId: 'request', expected: row().expected, signal: 'term' },
    expect.any(AbortSignal),
  )
  expect(model.receipt.value?.sent).toBe(true)
  expect(model.receipt.value?.exited).toBe(false)
  expect(model.status.value?.entries[0]?.startTicks).toBe('9007199254740993')
  model.dispose()
})

it('cancels review on a changed birth identity and never trusts stale action flags', async () => {
  const { gateway, model } = fixture()
  await model.refresh()
  const previous = row()
  model.prepare(previous, 'kill')
  gateway.read.mockResolvedValueOnce({
    ...snapshot(),
    entries: [{ ...row(), canSignal: false, canStack: false }],
  })
  await model.refresh()
  expect(model.review.value).toBeNull()
  expect(model.canSignal(previous)).toBe(false)
  expect(model.canStack(previous)).toBe(false)
  gateway.read.mockResolvedValueOnce(snapshot())
  await model.refresh()
  model.prepare(previous, 'term')
  gateway.read.mockResolvedValueOnce({
    ...snapshot(),
    entries: [
      {
        ...row(),
        startTicks: '9007199254740994',
        expected: { ...row().expected!, startTicks: '9007199254740994', membership: 'member-2' },
      },
    ],
  })
  await model.refresh()
  expect(model.review.value).toBeNull()
  model.confirmSignal.value = true
  await model.submit()
  expect(gateway.submit).not.toHaveBeenCalled()
  model.dispose()
})

it('retains an unknown TERM across navigation and queries it without sending KILL', async () => {
  const { gateway, model } = fixture()
  await model.refresh()
  gateway.submit.mockRejectedValueOnce(new Error('lost reply'))
  model.prepare(row(), 'term')
  model.confirmSignal.value = true
  await model.submit()
  model.deactivate()
  await model.refresh()
  model.prepare(row(), 'kill')
  expect(model.review.value).toBeNull()
  await model.reconcile()
  expect(model.pending.value).toBe(true)
  expect(gateway.submit).toHaveBeenCalledTimes(1)
  expect(gateway.find).toHaveBeenCalledWith(
    { requestId: 'request', expected: row().expected, signal: 'term' },
    expect.any(AbortSignal),
  )
  model.dispose()
})

it('keeps failed observations stale and drops a late stack result when leaving', async () => {
  const { gateway, model } = fixture()
  await model.refresh()
  let finish!: (value: ProcessStack) => void
  gateway.stack.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const reading = model.openStack(row())
  model.deactivate()
  finish({
    context: snapshot().context,
    expected: row().expected!,
    text: 'late',
    available: true,
    truncated: false,
    reason: null,
  })
  await reading
  expect(model.stack.value).toBeNull()
  expect(model.stackTarget.value).toBeNull()
  gateway.read.mockRejectedValueOnce(new Error('read failed'))
  await model.refresh()
  expect(model.status.value?.entries[0]?.pages).toBeNull()
  expect(model.fresh.value).toBe(false)
  expect(model.canSignal(row())).toBe(false)
  model.dispose()
})
