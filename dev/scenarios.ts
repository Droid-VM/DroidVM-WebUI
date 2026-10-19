import { ApiError, type ApiErrorCode } from '../src/shared/api/errors'
import { parseSnapshot, type VmGateway } from '../src/modules/vm'
import sample from './vms.json'

export const scenarios = [
  'default',
  'empty',
  'loading',
  'long-name',
  'unauthenticated',
  'permission-denied',
  'unsupported',
  'offline',
  'unavailable',
  'timeout',
  'invalid-response',
  'commit-uncertain',
] as const
export type Scenario = (typeof scenarios)[number]

export function createPreviewGateway(scenario: Scenario): VmGateway {
  let calls = 0
  return {
    mode: 'preview',
    async list(signal) {
      signal.throwIfAborted()
      calls++
      if (scenario === 'loading') {
        await new Promise<void>((resolve, reject) => {
          const cancelled = () => {
            clearTimeout(timer)
            reject(signal.reason)
          }
          const timer = setTimeout(() => {
            signal.removeEventListener('abort', cancelled)
            resolve()
          }, 2000)
          signal.addEventListener('abort', cancelled, { once: true })
        })
      }
      if (scenario === 'empty') return { items: [] }
      if (!['default', 'empty', 'loading', 'long-name'].includes(scenario)) {
        // Reconciliation demonstrates a read, never repeats any write operation.
        if (!(scenario === 'commit-uncertain' && calls > 1))
          throw new ApiError(scenario as ApiErrorCode, '开发场景')
      }
      const data = structuredClone(sample)
      if (scenario === 'long-name' && data.items[0])
        data.items[0].name = '用于检查长名称换行的虚拟机_' + '很长的名称'.repeat(18)
      return parseSnapshot(data)
    },
  }
}
