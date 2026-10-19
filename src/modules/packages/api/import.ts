import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient, ApiPath } from '../../../shared/api/httpClient'
import { checkTask, type OperationGateway, type OperationTracking } from '../../tasks'
import { validHostPath } from '../../../shared/lib/hostPath'
export type PackageImportPlan = components['schemas']['PackageImportPlan']
export type PackageImportPlanRequest = Omit<
  components['schemas']['PackageImportPlanRequest'],
  'context'
>
export type PackageImportRequest = Omit<components['schemas']['PackageImportRequest'], 'context'>
export type PackageImportOperation = PackageImportRequest['operation']
export type PackageImportNetworkChoice = components['schemas']['PackageImportNetworkChoice']
export interface PackageImportGateway extends OperationGateway<PackageImportRequest> {
  tracking?: OperationTracking<PackageImportRequest>
  preview: OperationGateway<PackageImportPlanRequest> & {
    tracking?: OperationTracking<PackageImportPlanRequest>
  }
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const requestValid =
  compileContract<components['schemas']['PackageImportRequest']>('PackageImportRequest')
const planRequestValid = compileContract<components['schemas']['PackageImportPlanRequest']>(
  'PackageImportPlanRequest',
)
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
const invalid = () => new ApiError('invalid-response', 'Invalid package import response')
const exactKeys = (value: unknown, keys: string): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === keys
export function validTrackedPackagePreview(request: unknown): request is PackageImportPlanRequest {
  if (!exactKeys(request, 'requestId,source')) return false
  const body = { ...request, context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) } }
  return planRequestValid(body) && validHostPath(body.source)
}
export function validTrackedPackageImport(request: unknown): request is PackageImportRequest {
  if (!exactKeys(request, 'operation,planRequestId,requestId')) return false
  const body = { ...request, context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) } }
  return (
    requestValid(body) &&
    validHostPath(body.operation.targetDirectory, true) &&
    new Set(body.operation.networks.map((row) => row.ref)).size === body.operation.networks.length
  )
}
export function createPackageImportGateway(
  client: HttpClient,
  access: () => Access | null,
): PackageImportGateway {
  const supported = () => {
    const current = access()
    return (
      !!current?.administrator &&
      current.manageTasks &&
      current.capabilities.includes('packages.import.v1')
    )
  }
  function scope() {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!supported()) throw new ApiError('unsupported', 'Package import unavailable')
    return current
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    current: Access,
    requestId: string,
    preview: boolean,
  ) {
    if (
      value.context.daemonEpoch !== current.context.daemonEpoch ||
      value.context.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Package import context changed')
    const task = value.task
    if (!task) return null
    checkTask(task)
    if (
      task.requestId !== requestId ||
      task.resource !== 'package' ||
      task.kind !== (preview ? 'package_import_plan' : 'vm_import')
    )
      throw invalid()
    if (preview) {
      const plan = task.packageImportPlan
      if (task.state === 'succeeded' && !plan) throw invalid()
      if (
        plan &&
        (new Set(plan.networks.map((row) => row.ref)).size !== plan.networks.length ||
          plan.networks.some(
            (row) =>
              new Set(row.candidates.map((candidate) => candidate.id)).size !==
              row.candidates.length,
          ) ||
          [...plan.disks, ...plan.boots].some(
            (row) => BigInt(row.sizeBytes) > 9223372036854775807n,
          ))
      )
        throw invalid()
    } else {
      const result = task.packageImport
      if (
        task.state === 'succeeded' &&
        (!result ||
          !result.registered ||
          !result.vmId ||
          result.registrationUncertain ||
          result.recoveryRequired ||
          !result.cleanupComplete ||
          result.done !== result.total)
      )
        throw invalid()
      if (
        result &&
        (result.done > result.total ||
          (result.registered && (!result.vmId || result.registrationUncertain)))
      )
        throw invalid()
    }
    return task
  }
  function gateway<R extends { requestId: string }>(
    path: ApiPath,
    preview: boolean,
    valid: (value: unknown) => value is R,
    namespace: string,
    key: string,
  ): OperationGateway<R> & { tracking: OperationTracking<R> } {
    return {
      tracking: { namespace, valid, key: () => key },
      supported,
      async submit(request, signal) {
        const current = scope(),
          body = { ...request, context: current.context }
        if (!valid(request)) throw new ApiError('conflict', 'Invalid package import request')
        const value = await client.postJson(path, body, signal, {
          csrf: current.csrfToken,
          status: 202,
        })
        if (!responseValid(value)) throw invalid()
        verify(value, current, request.requestId, preview)
        return value.task
      },
      async find(request, signal) {
        const current = scope()
        if (!valid(request)) throw new ApiError('conflict', 'Invalid package import request')
        const value = await client.getJson(
          `${path}/${encodeURIComponent(request.requestId)}`,
          signal,
        )
        if (!lookupValid(value)) throw invalid()
        return verify(value, current, request.requestId, preview)
      },
    }
  }
  return {
    ...gateway<PackageImportRequest>(
      '/api/v1/package-imports',
      false,
      validTrackedPackageImport,
      'package-import',
      'import',
    ),
    preview: gateway<PackageImportPlanRequest>(
      '/api/v1/package-import-plans',
      true,
      validTrackedPackagePreview,
      'package-import-preview',
      'preview',
    ),
  }
}
