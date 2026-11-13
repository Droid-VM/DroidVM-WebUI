import type { components } from '../../../generated/api'

export type LogList = components['schemas']['VmLogList']
export type LogRead = Omit<components['schemas']['VmLogReadRequest'], 'context'>
export type LogChunk = components['schemas']['VmLogChunk'] & { bytes: Uint8Array }
export type LogClear = Omit<components['schemas']['VmLogClearRequest'], 'context'>
export interface LogGateway {
  supported(): boolean
  list(vmId: string, signal: AbortSignal): Promise<LogList>
  read(request: LogRead, signal: AbortSignal): Promise<LogChunk>
  clearSupported?(): boolean
  clear?(request: LogClear, signal: AbortSignal): Promise<void>
}
