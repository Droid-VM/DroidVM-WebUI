import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { checkTask, type OperationGateway, type OperationTracking } from '../../tasks'
import { validHostPath } from '../../../shared/lib/hostPath'

export type PackageExportPlan = components['schemas']['PackageExportPlan']
export type PackageExportRequest = Omit<components['schemas']['PackageExportRequest'], 'context'>
export type PackageExportOperation = PackageExportRequest['operation']
export interface PackageExportGateway extends OperationGateway<PackageExportRequest> {
  tracking?: OperationTracking<PackageExportRequest>
  plan(vmId: string, signal: AbortSignal): Promise<PackageExportPlan>
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  csrfToken: string
  administrator: boolean
  manageTasks: boolean
}
const planValid = compileContract<PackageExportPlan>('PackageExportPlan')
const requestValid =
  compileContract<components['schemas']['PackageExportRequest']>('PackageExportRequest')
const responseValid = compileContract<components['schemas']['TaskResponse']>('TaskResponse')
const lookupValid = compileContract<components['schemas']['VmOperationLookup']>('VmOperationLookup')
const invalid = () => new ApiError('invalid-response', 'Invalid package export response')
export function validTrackedPackageExport(request: unknown): request is PackageExportRequest {
  if (
    !request ||
    typeof request !== 'object' ||
    Array.isArray(request) ||
    Object.keys(request).sort().join(',') !==
      'diskRevision,networkRevision,operation,requestId,vmId,vmRevision'
  )
    return false
  const body = { ...request, context: { daemonEpoch: 'tracking', sessionId: '0'.repeat(64) } }
  if (!requestValid(body) || !validHostPath(body.operation.destination)) return false
  const volume = BigInt(body.operation.volumeBytes)
  return volume === 0n || (volume >= 16777216n && volume <= 9223372036854775807n)
}
export function createPackageExportGateway(
  client: HttpClient,
  access: () => Access | null,
): PackageExportGateway {
  const supported = () => {
    const current = access()
    return (
      !!current?.administrator &&
      current.manageTasks &&
      current.capabilities.includes('packages.export.v1')
    )
  }
  function scope() {
    const current = access()
    if (!current) throw new ApiError('unauthenticated', 'Session required')
    if (!supported()) throw new ApiError('unsupported', 'Package export unavailable')
    return current
  }
  function context(actual: Access['context'], current: Access) {
    if (
      actual.daemonEpoch !== current.context.daemonEpoch ||
      actual.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'Package export context changed')
  }
  function verify(
    value: components['schemas']['VmOperationLookup'],
    current: Access,
    request: PackageExportRequest,
  ) {
    context(value.context, current)
    const task = value.task
    if (!task) return null
    checkTask(task)
    if (
      task.requestId !== request.requestId ||
      task.kind !== 'vm_export' ||
      task.resource !== 'package' ||
      (task.state === 'succeeded' && !task.packageExport)
    )
      throw invalid()
    return task
  }
  return {
    tracking: {
      namespace: 'package-export',
      valid: validTrackedPackageExport,
      key: () => 'export',
    },
    supported,
    async plan(vmId, signal) {
      const current = scope()
      const value = await client.getJson(
        `/api/v1/package-export-plans/${encodeURIComponent(vmId)}`,
        signal,
      )
      if (
        !planValid(value) ||
        value.vmId !== vmId ||
        value.minVolumeBytes !== '16777216' ||
        new Set(value.disks.map((row) => row.index)).size !== value.disks.length ||
        new Set(value.compressions).size !== value.compressions.length
      )
        throw invalid()
      context(value.context, current)
      return value
    },
    async submit(request, signal) {
      const current = scope(),
        body = { ...request, context: current.context }
      if (!validTrackedPackageExport(request))
        throw new ApiError('conflict', 'Invalid package export request')
      const value = await client.postJson('/api/v1/package-exports', body, signal, {
        csrf: current.csrfToken,
        status: 202,
      })
      if (!responseValid(value)) throw invalid()
      verify(value, current, request)
      return value.task
    },
    async find(request, signal) {
      const current = scope()
      if (!validTrackedPackageExport(request))
        throw new ApiError('conflict', 'Invalid package export request')
      const value = await client.getJson(
        `/api/v1/package-exports/${encodeURIComponent(request.requestId)}`,
        signal,
      )
      if (!lookupValid(value)) throw invalid()
      return verify(value, current, request)
    },
  }
}
