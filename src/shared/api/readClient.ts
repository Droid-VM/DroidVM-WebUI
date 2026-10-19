import { createHttpClient, type HttpClient, type HttpClientOptions } from './httpClient'
export type { ApiPath } from './httpClient'
export type ReadClient = Pick<HttpClient, 'getJson'>

// Keep read-only consumers unable to issue mutations through this interface.
export function createReadClient(options: HttpClientOptions = {}): ReadClient {
  const { getJson } = createHttpClient(options)
  return { getJson }
}
