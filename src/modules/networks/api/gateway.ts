import type { OperationGateway, OperationTracking } from '../../tasks'

export interface NetworkCommit {
  uploadId: string
  requestId: string
  networkId?: string
}
export interface NetworkConfigurationGateway extends OperationGateway<NetworkCommit> {
  tracking?: OperationTracking<NetworkCommit>
  read(signal: AbortSignal): Promise<string>
  stage(json: string, signal: AbortSignal): Promise<string>
  abort(uploadId: string, signal: AbortSignal): Promise<void>
}
