import type { components } from '../../../generated/api'
import type { OperationGateway, OperationTracking } from '../../tasks'

type Schemas = components['schemas']
export type UsbRule = Schemas['UsbRule']
export type UsbRulesDocument = Schemas['UsbRulesDocument']
export type UsbRuleTarget = Schemas['UsbRuleTarget']
export type UsbRulesPreview = Schemas['UsbRulesPreview']
export interface RulesSnapshot {
  revision: string
  persistence: Schemas['UsbRulesPage']['persistence']
  rules: UsbRulesDocument
}
export interface RulesCommit {
  uploadId: string
  requestId: string
}
export interface UsbRulesGateway extends OperationGateway<RulesCommit> {
  tracking?: OperationTracking<RulesCommit>
  previewSupported(): boolean
  preview(revision: string, signal: AbortSignal): Promise<UsbRulesPreview>
  read(signal: AbortSignal): Promise<RulesSnapshot>
  targets(signal: AbortSignal): Promise<UsbRuleTarget[]>
  stage(revision: string, json: string, signal: AbortSignal): Promise<string>
  abort(uploadId: string, signal: AbortSignal): Promise<void>
}
