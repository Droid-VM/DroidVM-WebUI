import type { components } from '../../../generated/api'
import type { Task, OperationGateway } from '../../tasks'

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
export interface AgentRecoveryGateway extends OperationGateway<{ requestId: string }> {
  status(signal: AbortSignal): Promise<number>
}
export interface AgentGateway {
  supported(): boolean
  rescueSupported?(): boolean
  prepare(id: string, signal: AbortSignal): Promise<AgentPreparation>
  submit(request: AgentRequest, signal: AbortSignal): Promise<Task>
  find(reference: AgentReference, signal: AbortSignal): Promise<Task | null>
  recovery: AgentRecoveryGateway
}
// Same ASCII allowlist and length as the shared native rescue plan.
export const validAgentPassword = (value: string) =>
  /^[A-Za-z0-9!@#%^*+\-=_.,:?]{1,128}$/.test(value)
export function clearAgentPassword(operation: AgentOperation) {
  if (operation.action === 'chpasswd') operation.password = ''
}
