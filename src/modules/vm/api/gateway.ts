import { compileContract } from '../../../shared/api/contract'
import type { components } from '../../../generated/api'
import { ApiError } from '../../../shared/api/errors'
import type { DeepReadonly } from 'vue'

export type Vm = DeepReadonly<components['schemas']['Vm']>
export type VmSnapshot = components['schemas']['VmSnapshot']
export interface VmGateway {
  readonly mode: 'disconnected' | 'preview' | 'http'
  list(signal: AbortSignal): Promise<VmSnapshot>
}

const validate = compileContract<VmSnapshot>('VmSnapshot')

export function parseSnapshot(value: unknown): VmSnapshot {
  if (!validate(value) || new Set(value.items.map((vm) => vm.id)).size !== value.items.length) {
    throw new ApiError('invalid-response', '服务返回的数据不兼容，请检查前后端版本。')
  }
  return value
}

export const disconnectedGateway: VmGateway = {
  mode: 'disconnected',
  async list() {
    throw new ApiError('unavailable', '尚未连接管理服务，真实虚拟机数据暂不可用。')
  },
}
