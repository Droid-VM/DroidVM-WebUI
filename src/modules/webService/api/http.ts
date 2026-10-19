import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type OperationGateway } from '../../tasks'
import { sameWebSettings, validWebOrigin } from '../lib/settings'

type Schemas = components['schemas']
export type WebServiceStatus = Schemas['WebServiceStatus']
export type WebServiceRequest = Omit<Schemas['WebServiceOperationRequest'], 'context'>
export interface WebServiceGateway extends OperationGateway<WebServiceRequest> {
  read(signal: AbortSignal): Promise<WebServiceStatus>
}
interface Access {
  context: Schemas['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const validStatus = compileContract<WebServiceStatus>('WebServiceStatus')
const validRequest = compileContract<Schemas['WebServiceOperationRequest']>(
  'WebServiceOperationRequest',
)
const validTask = compileContract<Schemas['TaskResponse']>('TaskResponse')
const validLookup = compileContract<Schemas['VmOperationLookup']>('VmOperationLookup')
const invalid = () => new ApiError('invalid-response', 'Invalid Web service response')
export function createWebServiceGateway(
  client: HttpClient,
  access: () => Access | null,
): WebServiceGateway {
  const supported = () => {
    const value = access()
    return (
      !!value?.administrator && value.manageTasks && value.capabilities.includes('web.service.v1')
    )
  }
  function scope() {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!supported()) throw new ApiError('unsupported', 'Web service management unavailable')
    return current
  }
  function context(actual: Access['context'], current: Access) {
    if (
      actual.daemonEpoch !== current.context.daemonEpoch ||
      actual.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Web service context changed')
  }
  function verify(task: Schemas['Task'] | null, request: WebServiceRequest) {
    if (!task) return null
    checkTask(task)
    if (
      task.requestId !== request.requestId ||
      task.kind !== 'web_service' ||
      task.resource !== 'webui' ||
      (task.state === 'succeeded' && !task.webService)
    )
      throw invalid()
    if (
      task.webService &&
      (task.webService.action !== request.action ||
        !sameWebSettings(task.webService.settings, request.settings))
    )
      throw invalid()
    return task
  }
  return {
    supported,
    async read(signal) {
      const current = scope(),
        value = await client.getJson('/api/v1/web-service', signal)
      if (
        !validStatus(value) ||
        value.settings.publicOrigins.some((origin) => !validWebOrigin(origin)) ||
        value.addresses.some((origin) => !validWebOrigin(origin))
      )
        throw invalid()
      context(value.context, current)
      return value
    },
    async submit(request, signal) {
      const current = scope(),
        body = { ...request, context: current.context }
      if (
        !validRequest(body) ||
        request.settings.publicOrigins.some((origin) => !validWebOrigin(origin)) ||
        (request.action === 'restart' && !sameWebSettings(request.expected, request.settings))
      )
        throw new ApiError('conflict', 'Invalid Web service operation')
      const value = await client.postJson('/api/v1/web-service/operations', body, signal, {
        csrf: current.csrfToken,
        status: 202,
      })
      if (!validTask(value)) throw invalid()
      context(value.context, current)
      verify(value.task, request)
      return value.task
    },
    async find(request, signal) {
      const current = scope()
      const value = await client.getJson(
        `/api/v1/web-service/operations/${encodeURIComponent(request.requestId)}`,
        signal,
      )
      if (!validLookup(value)) throw invalid()
      context(value.context, current)
      return verify(value.task, request)
    },
  }
}
