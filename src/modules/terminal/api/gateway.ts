import type { components } from '../../../generated/api'
import type { ApiError } from '../../../shared/api/errors'

type Schemas = components['schemas']
export type TerminalMetadata = Schemas['VmTerminalMetadata']
export type TerminalCursor = Schemas['VmLogCursor']
export type TerminalMessage = Schemas['VmTerminalMessage']
export type TerminalOutput = Extract<TerminalMessage, { type: 'output' }> & { bytes: Uint8Array }
export interface TerminalConnection {
  input(sequence: string, bytes: Uint8Array): boolean
  acknowledge(cursor: TerminalCursor): boolean
  close(): void
}
export interface TerminalObserver {
  ready(): void
  output(value: TerminalOutput): void
  acknowledged(sequence: string, accepted: number): void
  closed(problem: ApiError): void
}
export interface VmTerminalGateway {
  supported(): boolean
  read(vmId: string, signal: AbortSignal): Promise<TerminalMetadata>
  connect(
    metadata: TerminalMetadata,
    stream: string,
    cursor: TerminalCursor | null,
    observer: TerminalObserver,
  ): TerminalConnection
}
