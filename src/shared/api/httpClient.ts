import { ApiError, type ApiErrorCode } from './errors'

export type ApiPath = `/api/v1/${string}`
export interface PostOptions {
  csrf: string
  status: 200 | 202
}
export interface HttpClient {
  getJson(path: ApiPath, signal: AbortSignal, headers?: Record<string, string>): Promise<unknown>
  postJson(
    path: ApiPath,
    body: unknown,
    signal: AbortSignal,
    options?: PostOptions,
  ): Promise<unknown>
  delete(path: ApiPath, csrf: string, signal: AbortSignal): Promise<void>
}

export interface HttpClientOptions {
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
  maxResponseBytes?: number
}

function responseError(status: number): ApiError {
  const codes: Partial<Record<number, ApiErrorCode>> = {
    401: 'unauthenticated',
    403: 'permission-denied',
    404: 'unavailable',
    405: 'unsupported',
    408: 'timeout',
    429: 'rate-limited',
    501: 'unsupported',
    504: 'timeout',
  }
  return new ApiError(
    codes[status] ?? (status >= 500 ? 'unavailable' : 'invalid-response'),
    `HTTP ${status}`,
  )
}

function validatePath(path: string) {
  const base = 'https://webui.invalid'
  const url = new URL(path, base)
  if (
    !path.startsWith('/api/v1/') ||
    path.includes('\\') ||
    url.origin !== base ||
    !url.pathname.startsWith('/api/v1/') ||
    url.hash
  )
    throw new TypeError('Only same-origin versioned API paths are accepted')
}

async function readJson(response: Response, limit: number, signal: AbortSignal): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (contentType !== 'application/json' || !response.body) {
    throw new ApiError('invalid-response', 'Expected a JSON response body')
  }
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > limit) {
    throw new ApiError('invalid-response', 'Response exceeds the configured limit')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const decode = (value?: Uint8Array) => {
    try {
      return decoder.decode(value, { stream: value !== undefined })
    } catch {
      throw new ApiError('invalid-response', 'Response body is not UTF-8')
    }
  }
  let bytes = 0
  let content = ''
  try {
    while (true) {
      signal.throwIfAborted()
      const result = await reader.read()
      if (result.done) break
      bytes += result.value.byteLength
      if (bytes > limit)
        throw new ApiError('invalid-response', 'Response exceeds the configured limit')
      content += decode(result.value)
    }
    signal.throwIfAborted()
    content += decode()
    return JSON.parse(content) as unknown
  } catch (cause) {
    if (signal.aborted) throw signal.reason
    if (cause instanceof ApiError) throw cause
    if (cause instanceof SyntaxError) {
      throw new ApiError('invalid-response', 'Response body could not be decoded')
    }
    throw cause
  } finally {
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

// Shared bounded transport. Session orchestration stays in its domain module.
// Never retry mutations: a lost response may have already changed server state.
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  const timeoutMs = options.timeoutMs ?? 15_000
  const maxResponseBytes = options.maxResponseBytes ?? 4 * 1024 * 1024
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2_147_483_647 ||
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes <= 0
  ) {
    throw new TypeError('Request timeout and response limit must be positive safe integers')
  }
  async function send(
    path: ApiPath,
    signal: AbortSignal,
    method: 'GET' | 'POST' | 'DELETE',
    body?: unknown,
    csrf?: string,
    postStatus = 201,
    headers?: Record<string, string>,
  ): Promise<unknown> {
    validatePath(path)
    signal.throwIfAborted()
    const request = new AbortController()
    const cancel = () => request.abort(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    const timer = setTimeout(
      () => request.abort(new ApiError('timeout', 'Request deadline exceeded')),
      timeoutMs,
    )
    try {
      const response = await fetch(path, {
        method,
        credentials: 'same-origin',
        mode: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          ...headers,
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          ...(csrf !== undefined ? { 'X-DroidVM-CSRF': csrf } : {}),
        },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
        signal: request.signal,
      })
      const expected = method === 'GET' ? 200 : method === 'POST' ? postStatus : 204
      if (response.status !== expected) {
        if (response.status === 409) {
          const problem = await readJson(response, Math.min(maxResponseBytes, 4096), request.signal)
          if (
            typeof problem === 'object' &&
            problem &&
            'error' in problem &&
            typeof problem.error === 'object' &&
            problem.error &&
            'code' in problem.error &&
            problem.error.code === 'context_changed'
          )
            throw new ApiError('context-changed', 'Server or browser session changed')
          throw new ApiError('conflict', 'Operation no longer available')
        }
        throw responseError(response.status)
      }
      if (method === 'DELETE') return undefined
      return await readJson(response, maxResponseBytes, request.signal)
    } catch (cause) {
      if (request.signal.aborted) throw request.signal.reason
      if (cause instanceof ApiError) throw cause
      throw new ApiError('offline', 'The request failed')
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      // Also release bodies rejected before parsing (HTTP errors, wrong MIME,
      // oversized Content-Length); never leave a response downloading.
      request.abort()
    }
  }
  return {
    getJson: (path, signal, headers) =>
      send(path, signal, 'GET', undefined, undefined, 201, headers),
    postJson: (path, body, signal, options) =>
      send(path, signal, 'POST', body, options?.csrf, options?.status),
    async delete(path, csrf, signal) {
      await send(path, signal, 'DELETE', undefined, csrf)
    },
  }
}
