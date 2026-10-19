import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { ReadClient } from '../../../shared/api/readClient'

export type HostOverview = components['schemas']['HostOverview']
export interface HostOverviewGateway {
  supported(): boolean
  read(signal: AbortSignal): Promise<HostOverview>
}
interface Access {
  context: components['schemas']['ServerContext']
  capabilities: readonly string[]
  administrator: boolean
}
const validate = compileContract<HostOverview>('HostOverview')
const invalid = () => new ApiError('invalid-response', 'Invalid host overview')
const maximum = 18446744073709551615n
export function createHostOverviewGateway(
  client: ReadClient,
  access: () => Access | null,
): HostOverviewGateway {
  const supported = () => {
    const current = access()
    return !!current?.administrator && current.capabilities.includes('host.overview.v1')
  }
  return {
    supported,
    async read(signal) {
      const current = access()
      if (!current) throw new ApiError('unauthenticated', 'Session required')
      if (!supported()) throw new ApiError('unsupported', 'Host overview unavailable')
      const value = await client.getJson('/api/v1/host/overview', signal)
      if (!validate(value)) throw invalid()
      if ((value.cpu.usagePercent === null) !== (value.cpu.sampleWindowMs === null)) throw invalid()
      if (
        value.context.daemonEpoch !== current.context.daemonEpoch ||
        value.context.sessionId !== current.context.sessionId
      )
        throw new ApiError('context-changed', 'Host identity changed')
      const quantities = [
        value.memory.totalBytes,
        value.memory.availableBytes,
        value.storage.totalBytes,
        value.storage.freeBytes,
        value.storage.availableBytes,
        value.inventory.diskVirtualBytes,
      ]
      if (
        quantities.some((item) => item !== null && BigInt(item) > maximum) ||
        BigInt(value.observedAtMs) > 8640000000000000n
      )
        throw invalid()
      for (const [part, total] of [
        [value.memory.availableBytes, value.memory.totalBytes],
        [value.storage.freeBytes, value.storage.totalBytes],
        [value.storage.availableBytes, value.storage.freeBytes],
      ] as const) {
        if (part !== null && total !== null && BigInt(part) > BigInt(total)) throw invalid()
      }
      if (
        (value.inventory.vmCount !== null &&
          value.inventory.runningVmCount !== null &&
          value.inventory.runningVmCount > value.inventory.vmCount) ||
        (value.inventory.networkCount !== null &&
          value.inventory.runningNetworkCount !== null &&
          value.inventory.runningNetworkCount > value.inventory.networkCount)
      )
        throw invalid()
      return value
    },
  }
}
