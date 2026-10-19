import type { components, paths } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'

export type BrowserSession = components['schemas']['BrowserSession']
export interface SessionGateway {
  current(signal: AbortSignal): Promise<BrowserSession>
  exchange(pairingToken: string, signal: AbortSignal): Promise<BrowserSession>
  logout(csrf: string, signal: AbortSignal): Promise<void>
}
const path = '/api/v1/session' satisfies keyof paths
const validate = compileContract<BrowserSession>('BrowserSession')
function parse(value: unknown): BrowserSession {
  if (!validate(value)) throw new ApiError('invalid-response', 'Invalid session response')
  if (value.server.apiMajor !== 1 || !value.server.capabilities.includes('session.v1'))
    throw new ApiError('incompatible', 'Unsupported WebUI protocol')
  return value
}
export function createSessionGateway(client: HttpClient): SessionGateway {
  return {
    async current(signal) {
      return parse(await client.getJson(path, signal))
    },
    async exchange(pairingToken, signal) {
      if (!/^[0-9a-f]{64}$/.test(pairingToken)) throw new TypeError('Invalid pairing token')
      const body: components['schemas']['PairingRequest'] = { pairingToken }
      return parse(await client.postJson(path, body, signal))
    },
    logout: (csrf, signal) => client.delete(path, csrf, signal),
  }
}
