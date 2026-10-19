import type { components, paths } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { ReadClient } from '../../../shared/api/readClient'
import { parseSnapshot, type VmGateway } from './gateway'

const listPath = '/api/v1/vms' satisfies keyof paths
type HttpVmSnapshot = components['schemas']['HttpVmSnapshot']
interface VmAccess {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
}
const validate = compileContract<HttpVmSnapshot>('HttpVmSnapshot')

// An explicit null is reserved for independent development adapter scenarios.
// The production composition root always supplies the authenticated session binding.
export function createHttpVmGateway(
  client: ReadClient,
  access: (() => VmAccess | null) | null,
): VmGateway {
  return {
    mode: 'http',
    async list(signal) {
      const expected = access?.()
      if (access && !expected) throw new ApiError('unauthenticated', 'Session required')
      if (expected && !expected.capabilities.includes('vm.list.v1'))
        throw new ApiError('unsupported', 'VM list is not supported')
      const value = await client.getJson(listPath, signal)
      if (expected) {
        if (!validate(value)) throw new ApiError('invalid-response', 'Missing server context')
        if (
          value.context.daemonEpoch !== expected.context.daemonEpoch ||
          value.context.sessionId !== expected.context.sessionId
        )
          throw new ApiError('context-changed', 'Server or browser session changed')
      }
      return parseSnapshot(value)
    },
  }
}
