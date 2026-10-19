import type { components } from '../../../generated/api'
import type { Task, OperationGateway, OperationTracking } from '../../tasks'

export type AgentResult = components['schemas']['AgentResult']
export type AgentOperation = components['schemas']['AgentOperation']
export type AgentAction = AgentOperation['action']
export type AgentRequest = Omit<
  components['schemas']['AgentOperationRequest'],
  'context' | 'rescue'
> & {
  rescue?: boolean
}
export interface AgentReference {
  requestId: string
  diskId: string
  action: AgentAction
  rescue?: boolean
}
export interface AgentPreparation {
  catalog: components['schemas']['DiskCatalog']
  detail: components['schemas']['DiskDetail']
}
export interface AgentRecoveryReference {
  requestId: string
  agentRequestId?: string | null
}
export interface AgentRecoveryGateway extends OperationGateway<AgentRecoveryReference> {
  tracking?: OperationTracking<AgentRecoveryReference>
  status(signal: AbortSignal): Promise<number>
}
export interface AgentGateway {
  tracking?: OperationTracking<AgentReference>
  supported(): boolean
  rescueSupported?(): boolean
  prepare(id: string, signal: AbortSignal): Promise<AgentPreparation>
  submit(request: AgentRequest, signal: AbortSignal): Promise<Task>
  find(reference: AgentReference, signal: AbortSignal): Promise<Task | null>
  recovery: AgentRecoveryGateway
}
const validId = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
export function validAgentReference(value: unknown): value is AgentReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return (
    ['action,diskId,requestId', 'action,diskId,requestId,rescue'].includes(
      Object.keys(row).sort().join(','),
    ) &&
    validId(row.requestId) &&
    validId(row.diskId) &&
    (row.action === 'chpasswd' || row.action === 'autogrow') &&
    (row.rescue === undefined || typeof row.rescue === 'boolean')
  )
}
export function validAgentRecoveryReference(value: unknown): value is AgentRecoveryReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return (
    ['requestId', 'agentRequestId,requestId'].includes(Object.keys(row).sort().join(',')) &&
    validId(row.requestId) &&
    (row.agentRequestId === undefined || row.agentRequestId === null || validId(row.agentRequestId))
  )
}
// Same ASCII allowlist and length as the shared native rescue plan.
export const validAgentPassword = (value: string) =>
  /^[A-Za-z0-9!@#%^*+\-=_.,:?]{1,128}$/.test(value)
export function clearAgentPassword(operation: AgentOperation) {
  if (operation.action === 'chpasswd') operation.password = ''
}
