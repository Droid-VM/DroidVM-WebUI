import type { components } from '../../../generated/api'

export type Task = components['schemas']['Task']
export type TaskSnapshot = components['schemas']['TaskSnapshot']
export interface OperationGateway<R> {
  supported(): boolean
  submit(request: R, signal: AbortSignal): Promise<Task>
  find(request: R, signal: AbortSignal): Promise<Task | null>
}
export interface TaskGateway {
  supported(): boolean
  canCancel(): boolean
  list(signal: AbortSignal): Promise<TaskSnapshot>
  cancel(id: string, signal: AbortSignal): Promise<Task>
}
