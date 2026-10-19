import type { components } from '../../../generated/api'
import type { ApiError } from '../../../shared/api/errors'

export type DisplayMetadata = components['schemas']['VmDisplayMetadata']
export interface DisplayObserver {
  ready(socket: WebSocket, password: string): void
  closed(cause: ApiError): void
}
export interface DisplayConnection {
  close(): void
}
export interface VmGraphicsGateway {
  supported(): boolean
  read(vmId: string, signal: AbortSignal): Promise<DisplayMetadata>
  connect(metadata: DisplayMetadata, screenId: string, observer: DisplayObserver): DisplayConnection
}
