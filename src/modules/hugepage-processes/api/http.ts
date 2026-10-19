import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type OperationGateway, type OperationTracking } from '../../tasks'

export type ProcessSource = 'auto' | 'ko' | 'scan'
export type ProcessObservation = components['schemas']['HugepageProcessObservation']
export type ProcessEntry = components['schemas']['HugepageProcessEntry']
export type ProcessIdentity = components['schemas']['HugepageProcessExpected']
export type ProcessStack = components['schemas']['HugepageProcessStackResponse']
export type ProcessRequest = Omit<
  components['schemas']['HugepageProcessOperationRequest'],
  'context'
>
export interface HugepageProcessGateway extends OperationGateway<ProcessRequest> {
  tracking?: OperationTracking<ProcessRequest>
  readable(): boolean
  read(source: ProcessSource, signal: AbortSignal): Promise<ProcessObservation>
  stack(expected: ProcessIdentity, signal: AbortSignal): Promise<ProcessStack>
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  administrator: boolean
  manageTasks: boolean
  csrfToken: string
}
const observationValid = compileContract<ProcessObservation>('HugepageProcessObservation')
const stackValid = compileContract<ProcessStack>('HugepageProcessStackResponse')
const requestValid = compileContract<components['schemas']['HugepageProcessOperationRequest']>(
  'HugepageProcessOperationRequest',
)
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
const path = '/api/v1/hugepage-process-operations'
export function validTrackedProcessRequest(request: unknown): request is ProcessRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request) || 'context' in request)
    return false
  const body = { ...request, context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) } }
  return requestValid(body) && BigInt(body.expected.startTicks) <= 18446744073709551615n
}
export function sameProcess(
  a: ProcessIdentity | null | undefined,
  b: ProcessIdentity | null | undefined,
) {
  return (
    !!a &&
    !!b &&
    a.pid === b.pid &&
    a.startTicks === b.startTicks &&
    a.source === b.source &&
    a.membership === b.membership
  )
}
function quantity(value: string | null | undefined) {
  if (value != null && BigInt(value) > 18446744073709551615n)
    throw new ApiError('invalid-response', 'Hugepage process quantity overflow')
}
export function createHugepageProcessGateway(
  client: HttpClient,
  access: () => Access | null,
): HugepageProcessGateway {
  const readable = () =>
    !!access()?.administrator && !!access()?.capabilities.includes('host.hugepages.processes.v1')
  const supported = () => readable() && !!access()?.manageTasks
  function requireAccess(write: boolean) {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!(write ? supported() : readable()))
      throw new ApiError('unsupported', 'Hugepage processes unavailable')
    return current
  }
  function context(value: components['schemas']['ServerContext'], current: Access) {
    if (
      value.daemonEpoch !== current.context.daemonEpoch ||
      value.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Hugepage process session changed')
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    current: Access,
    request: ProcessRequest,
  ) {
    context(value.context, current)
    if (!value.task) return null
    const task = value.task
    checkTask(task)
    if (
      task.kind !== 'hugepage_process_signal' ||
      task.resource !== 'hugepage-processes' ||
      task.requestId !== request.requestId
    )
      throw new ApiError('invalid-response', 'Unexpected hugepage process task')
    const receipt = task.hugepageProcessResult
    const cancelledBeforeExecution =
      task.state === 'cancelled' &&
      receipt?.expected === null &&
      receipt.signal === null &&
      receipt.sent === false &&
      receipt.uncertain === false &&
      receipt.exited === false
    if (
      receipt &&
      !cancelledBeforeExecution &&
      (!sameProcess(receipt.expected, request.expected) || receipt.signal !== request.signal)
    )
      throw new ApiError('invalid-response', 'Hugepage process receipt identity changed')
    if (['succeeded', 'failed', 'cancelled'].includes(task.state) && !receipt)
      throw new ApiError('invalid-response', 'Missing hugepage process receipt')
    return task
  }
  return {
    tracking: {
      namespace: 'hugepage-processes',
      valid: validTrackedProcessRequest,
      key: () => 'hugepage-processes',
    },
    readable,
    supported,
    async read(source, signal) {
      const current = requireAccess(false)
      const value = await client.getJson(`/api/v1/host/hugepage-processes/${source}`, signal)
      if (!observationValid(value))
        throw new ApiError('invalid-response', 'Invalid hugepage process observation')
      context(value.context, current)
      if (value.requestedSource !== source)
        throw new ApiError('invalid-response', 'Unexpected hugepage process source')
      if (source !== 'auto' && value.source !== source)
        throw new ApiError('invalid-response', 'Explicit hugepage process source changed')
      for (const count of Object.values(value.totals)) quantity(count)
      for (const row of value.entries) {
        quantity(row.pages)
        quantity(row.bytes)
        quantity(row.startTicks)
        if (row.vm) quantity(row.vm.runtimeRevision)
        if (
          row.expected &&
          (row.expected.pid !== row.pid || row.expected.startTicks !== row.startTicks)
        )
          throw new ApiError('invalid-response', 'Hugepage process entry identity differs')
      }
      return value
    },
    async stack(expected, signal) {
      const current = requireAccess(false)
      const value = await client.postJson(
        '/api/v1/hugepage-process-stack',
        { context: current.context, expected },
        signal,
        { csrf: current.csrfToken, status: 200 },
      )
      if (!stackValid(value)) throw new ApiError('invalid-response', 'Invalid process stack')
      context(value.context, current)
      if (!sameProcess(value.expected, expected))
        throw new ApiError('invalid-response', 'Process stack identity changed')
      return value
    },
    async submit(request, signal) {
      const current = requireAccess(true),
        body = { ...request, context: current.context }
      if (!requestValid(body)) throw new ApiError('conflict', 'Invalid process signal request')
      const value = await client.postJson(path, body, signal, {
        csrf: current.csrfToken,
        status: 202,
      })
      if (!responseValid(value))
        throw new ApiError('invalid-response', 'Invalid process signal task')
      const task = verify(value, current, request)
      if (!task) throw new ApiError('invalid-response', 'Missing process signal task')
      return task
    },
    async find(request, signal) {
      const current = requireAccess(true)
      const value = await client.getJson(`${path}/${encodeURIComponent(request.requestId)}`, signal)
      if (!lookupValid(value))
        throw new ApiError('invalid-response', 'Invalid process signal lookup')
      return verify(value, current, request)
    },
  }
}
