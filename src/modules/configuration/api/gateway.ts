import type { components } from '../../../generated/api'
import type { Task } from '../../tasks'

export type ConfigVersion = components['schemas']['ConfigVersion']
export interface ConfigDocument {
  version: ConfigVersion
  json: string
}
export interface ConfigResult {
  task: Task | null
  version: ConfigVersion | null
}
export interface ConfigurationGateway {
  supported(): boolean
  defaultsSupported(): boolean
  defaults(signal: AbortSignal): Promise<string>
  read(signal: AbortSignal): Promise<ConfigDocument>
  stage(revision: string, json: string, signal: AbortSignal): Promise<string>
  abort(uploadId: string, signal: AbortSignal): Promise<void>
  commit(uploadId: string, requestId: string, signal: AbortSignal): Promise<Task>
  status(requestId: string, signal: AbortSignal): Promise<ConfigResult>
}
