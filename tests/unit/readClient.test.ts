import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReadClient, type ApiPath } from '../../src/shared/api/readClient'
import { createHttpVmGateway } from '../../src/modules/vm/api/http'
import { createInventory } from '../../src/modules/vm/model/inventory'
import { createApiProxy } from '../../dev/proxy'
import sample from '../../dev/vms.json'

const path = '/api/v1/vms'
const signal = () => new AbortController().signal
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
afterEach(() => vi.useRealTimers())

describe('read transport boundaries', () => {
  it('uses only same-origin GET with cookies, no cache, no redirects and no client credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ items: [] }))
    const client = createReadClient({ fetch })
    await expect(client.getJson(path, signal())).resolves.toEqual({ items: [] })
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      path,
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        mode: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: { Accept: 'application/json' },
      }),
    )
  })
  it('rejects external and escaped API paths before sending any request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = createReadClient({ fetch })
    for (const candidate of [
      'https://other.invalid/api/v1/vms',
      '//other.invalid/api/v1/vms',
      '/api/v1/../../private',
      '/api/v1/%2e%2e/%2e%2e/private',
      '/api/v1/\\private',
      '/api/v1/vms#fragment',
    ]) {
      await expect(client.getJson(candidate as ApiPath, signal())).rejects.toBeInstanceOf(TypeError)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    [401, 'unauthenticated'],
    [403, 'permission-denied'],
    [404, 'unavailable'],
    [405, 'unsupported'],
    [408, 'timeout'],
    [429, 'rate-limited'],
    [500, 'unavailable'],
    [501, 'unsupported'],
    [503, 'unavailable'],
    [504, 'timeout'],
    [204, 'invalid-response'],
  ])('maps HTTP %s without exposing its body or retrying', async (status, code) => {
    vi.useFakeTimers()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(status === 204 ? null : 'private upstream details', {
        status: status as number,
      }),
    )
    const result = createReadClient({ fetch }).getJson(path, signal())
    await expect(result).rejects.toMatchObject({ code })
    await expect(result).rejects.not.toHaveProperty('message', expect.stringContaining('private'))
    await vi.runAllTimersAsync()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('rejects HTML fallbacks, malformed JSON and invalid UTF-8', async () => {
    for (const response of [
      new Response('<html>fallback</html>', { headers: { 'Content-Type': 'text/html' } }),
      new Response('{"items":', { headers: { 'Content-Type': 'application/json' } }),
      new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } }),
    ]) {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response)
      await expect(createReadClient({ fetch }).getJson(path, signal())).rejects.toMatchObject({
        code: 'invalid-response',
      })
    }
  })
  it('enforces limits on both Content-Length and actual streamed bytes', async () => {
    const cases: HeadersInit[] = [
      { 'Content-Type': 'application/json', 'Content-Length': '100' },
      { 'Content-Type': 'application/json' },
    ]
    for (const headers of cases) {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ value: 'x'.repeat(100) }), { headers }))
      await expect(
        createReadClient({ fetch, maxResponseBytes: 32 }).getJson(path, signal()),
      ).rejects.toMatchObject({ code: 'invalid-response' })
    }
  })
  it('decodes multibyte user names split across response chunks', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ name: '繁體中文🙂' }))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
        controller.close()
      },
    })
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'application/json' } }))
    await expect(createReadClient({ fetch }).getJson(path, signal())).resolves.toEqual({
      name: '繁體中文🙂',
    })
  })
  it('reports network failures before and during body reading without internal details', async () => {
    const failedBody = new ReadableStream({
      start(controller) {
        controller.error(new TypeError('private socket details'))
      },
    })
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('private connection details'))
      .mockResolvedValueOnce(
        new Response(failedBody, { headers: { 'Content-Type': 'application/json' } }),
      )
    const client = createReadClient({ fetch })
    for (let i = 0; i < 2; i++) {
      const result = client.getJson(path, signal())
      await expect(result).rejects.toMatchObject({ code: 'offline' })
      await expect(result).rejects.not.toHaveProperty('message', expect.stringContaining('private'))
    }
  })
})

describe('request lifetime', () => {
  it('does not send an already-cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn<typeof globalThis.fetch>()
    await expect(createReadClient({ fetch }).getJson(path, controller.signal)).rejects.toBe(
      controller.signal.reason,
    )
    expect(fetch).not.toHaveBeenCalled()
  })
  for (const phase of ['headers', 'body']) {
    it(`distinguishes timeout and caller cancellation during ${phase}, releasing timers`, async () => {
      vi.useFakeTimers()
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_input, init) => {
        const requestSignal = init!.signal!
        if (phase === 'headers')
          return new Promise((_resolve, reject) =>
            requestSignal.addEventListener('abort', () => reject(requestSignal.reason), {
              once: true,
            }),
          )
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                requestSignal.addEventListener(
                  'abort',
                  () => controller.error(requestSignal.reason),
                  { once: true },
                )
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        )
      })
      const client = createReadClient({ fetch, timeoutMs: 100 })
      const timed = expect(client.getJson(path, signal())).rejects.toMatchObject({
        code: 'timeout',
      })
      await vi.advanceTimersByTimeAsync(100)
      await timed
      const cancelled = new AbortController()
      const waiting = client.getJson(path, cancelled.signal)
      const cancellation = expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
      cancelled.abort()
      await cancellation
      expect(vi.getTimerCount()).toBe(0)
    })
  }
  it('a later authorization failure clears previously read VM data', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(sample))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    const inventory = createInventory(createHttpVmGateway(createReadClient({ fetch }), null))
    await inventory.reload()
    expect(inventory.items.value.length).toBeGreaterThan(0)
    await inventory.reload()
    expect(inventory.items.value).toEqual([])
    expect(inventory.problem.value?.code).toBe('unauthenticated')
    expect(fetch).toHaveBeenCalledTimes(2)
    inventory.dispose()
  })
  it('the HTTP adapter validates the VM schema instead of returning arbitrary JSON', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ items: [{ id: 42 }] }))
    await expect(
      createHttpVmGateway(createReadClient({ fetch }), null).list(signal()),
    ).rejects.toMatchObject({ code: 'invalid-response' })
  })
})

describe('development proxy configuration', () => {
  it('accepts HTTP and HTTPS origins without credentials or path rewrites', () => {
    for (const target of [
      'http://user:secret@192.168.1.20:8080',
      'http://192.168.1.20:8080/api',
      'https://user:secret@device.example',
      'https://device.example/path',
      'https://device.example?token=secret',
      'https://device.example#part',
      'file:///tmp/',
    ]) {
      expect(() => createApiProxy(target)).toThrow()
    }
    expect(createApiProxy(undefined)).toBeUndefined()
    expect(createApiProxy('http://127.0.0.1:5189')?.['^/api(?:[/?]|$)']).toMatchObject({
      ws: true,
      secure: true,
      changeOrigin: false,
    })
    expect(createApiProxy('https://device.example')?.['^/api(?:[/?]|$)']?.target).toBe(
      'https://device.example',
    )
    for (const target of [
      'http://192.168.1.20:8080',
      'http://device.example:8080',
      'http://[fd00::20]:8080',
      'http://203.0.113.20:8080',
    ]) {
      expect(createApiProxy(target)?.['^/api(?:[/?]|$)']).toMatchObject({
        target,
        ws: true,
        changeOrigin: false,
      })
    }
  })
})
