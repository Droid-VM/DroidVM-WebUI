import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { ReadClient } from '../../../shared/api/readClient'

type Schemas = components['schemas']
export type HostNetworkObservation = Omit<Schemas['HostNetworkCatalog'], 'context'>
export interface HostNetworkGateway {
  supported(): boolean
  read(signal: AbortSignal): Promise<HostNetworkObservation>
}
interface Access {
  context: Schemas['ServerContext']
  capabilities: readonly string[]
  administrator: boolean
}
const valid = compileContract<Schemas['HostNetworkCatalog']>('HostNetworkCatalog')
const invalid = () => new ApiError('invalid-response', 'Invalid host network observation')
export function createHostNetworkGateway(
  client: ReadClient,
  access: () => Access | null,
): HostNetworkGateway {
  const permitted = (value: Access | null) =>
    !!value?.administrator && value.capabilities.includes('host.network.v1')
  return {
    supported: () => permitted(access()),
    async read(signal) {
      const current = access()
      if (!current) throw new ApiError('unauthenticated', 'Session required')
      if (!permitted(current)) throw new ApiError('unsupported', 'Host network unavailable')
      const result = await client.getJson('/api/v1/host/network', signal)
      if (!valid(result)) throw invalid()
      if (
        result.context.daemonEpoch !== current.context.daemonEpoch ||
        result.context.sessionId !== current.context.sessionId
      )
        throw new ApiError('context-changed', 'Host network identity changed')
      for (const values of [
        result.interfaces.map((item) => item.name),
        result.uplinks.identifiers.map((item) => item.id),
        result.uplinks.devices.map((item) => item.name),
        result.addresses.map((item) => `${item.interfaceName}:${item.family}:${item.address}`),
      ])
        if (new Set(values).size !== values.length) throw invalid()
      return {
        interfaces: result.interfaces,
        uplinks: result.uplinks,
        addresses: result.addresses,
      }
    },
  }
}
