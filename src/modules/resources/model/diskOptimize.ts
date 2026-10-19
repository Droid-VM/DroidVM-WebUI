import type { DeepReadonly } from 'vue'
import type { ApiProblem } from '../../../shared/api/errors'
import type { DiskOperation, DiskPreparation } from '../api/diskOperations'

export type DiskOptimizationOrigin = 'manual' | 'import'
export interface DiskOptimizationDefaults {
  expected: { revision: string } | null
  compression: 'ask' | 'none'
  cpus: readonly number[] | undefined
  canRemember: boolean
}
export interface OptimizationRememberState {
  state: 'idle' | 'posting' | 'waiting' | 'unknown' | 'saved' | 'failed'
  expected: { revision: string } | null
  requestId: string | null
  problem: ApiProblem | null
}
export interface DiskOptimizationPreferences {
  read(signal: AbortSignal): Promise<DiskOptimizationDefaults>
  remember(expected: { revision: string }): Promise<void>
  reconcile(): Promise<void>
  state(): OptimizationRememberState
}
export type DiskOptimizationCheck = 'ready' | 'overlay' | 'uncompressed' | 'unknown'
export function optimizationAllowed(value: DeepReadonly<DiskPreparation>) {
  const detail = value.detail
  return (
    !!detail &&
    detail.disk.selectable &&
    detail.chainComplete &&
    !detail.readOnlyRequired &&
    !detail.children.length &&
    detail.inspection.state === 'ready' &&
    ['raw', 'qcow2'].includes(detail.inspection.format ?? '')
  )
}
export function optimizationOperation(
  value: DeepReadonly<DiskPreparation>,
  cpus?: readonly number[],
): DiskOperation | null {
  if (!optimizationAllowed(value)) return null
  return {
    action: 'convert',
    diskId: value.detail!.disk.id,
    format: value.detail!.inspection.format as 'raw' | 'qcow2',
    compress: 'none',
    preallocate: false,
    ...(cpus?.length ? { cpus: [...cpus] } : {}),
  }
}
export function isOptimizationOperation(
  operation: DeepReadonly<DiskOperation>,
  value: DeepReadonly<DiskPreparation>,
) {
  return (
    optimizationAllowed(value) &&
    operation.action === 'convert' &&
    operation.diskId === value.detail!.disk.id &&
    operation.format === value.detail!.inspection.format &&
    operation.compress === 'none' &&
    operation.preallocate === false &&
    !('folder' in operation) &&
    !('name' in operation) &&
    !('path' in operation)
  )
}
