import { describe, expect, it, vi } from 'vitest'
import {
  createSessionGateway,
  type BrowserSession,
  type SessionGateway,
} from '../../src/modules/session/api/gateway'
import { createSession } from '../../src/modules/session/model/session'
import { ApiError } from '../../src/shared/api/errors'
import { createHttpClient } from '../../src/shared/api/httpClient'
import { createInventory } from '../../src/modules/vm/model/inventory'
import { watch } from 'vue'

const view = (id = 'a'): BrowserSession => ({
  id: id.repeat(64),
  csrfToken: 'b'.repeat(64),
  permissions: { administrator: true, manageTasks: true },
  server: {
    apiMajor: 1,
    apiMinor: 0,
    daemonEpoch: 'fixture-epoch',
    version: 'fixture',
    versionCode: '9007199254740993',
    capabilities: ['session.v1', 'vm.list.v1'],
  },
})
function gateway(): SessionGateway {
  return {
    current: vi.fn().mockResolvedValue(view()),
    exchange: vi.fn().mockResolvedValue(view()),
    logout: vi.fn().mockResolvedValue(undefined),
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const signal = () => new AbortController().signal

describe('session HTTP contract', () => {
  it('negotiates the major version and required session capability before returning a session', async () => {
    for (const server of [
      { ...view().server, apiMajor: 2 },
      { ...view().server, capabilities: ['vm.list.v1'] },
    ]) {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ ...view(), server }))
      await expect(
        createSessionGateway(createHttpClient({ fetch })).current(signal()),
      ).rejects.toMatchObject({ code: 'incompatible' })
    }
    const server = { ...view().server, apiMinor: 99, capabilities: ['session.v1', 'future.v1'] }
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ ...view(), server }))
    const result = await createSessionGateway(createHttpClient({ fetch })).current(signal())
    expect(result.server.versionCode).toBe('9007199254740993')
    expect(result.server.apiMinor).toBe(99)
  })
  it('rejects missing metadata, numeric epochs or version codes, and duplicate capabilities', async () => {
    for (const server of [
      undefined,
      { ...view().server, daemonEpoch: 42 },
      { ...view().server, versionCode: 9007199254740992 },
      { ...view().server, capabilities: ['session.v1', 'session.v1'] },
    ]) {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ ...view(), server }))
      await expect(
        createSessionGateway(createHttpClient({ fetch })).current(signal()),
      ).rejects.toMatchObject({ code: 'invalid-response' })
    }
  })
  it('uses JSON pairing and CSRF logout with same-origin cookies; credentials stay out of URLs', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(view(), 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const api = createSessionGateway(createHttpClient({ fetch }))
    await api.exchange('c'.repeat(64), signal())
    await api.logout(view().csrfToken, signal())
    expect(fetch.mock.calls[0]).toEqual([
      '/api/v1/session',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pairingToken: 'c'.repeat(64) }),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        mode: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
      }),
    ])
    expect(fetch.mock.calls[1]).toEqual([
      '/api/v1/session',
      expect.objectContaining({
        method: 'DELETE',
        headers: { Accept: 'application/json', 'X-DroidVM-CSRF': view().csrfToken },
      }),
    ])
    expect(fetch.mock.calls[1]![1]).not.toHaveProperty('body')
  })
  it('rejects extra credential/role fields and malformed session data', async () => {
    for (const invalid of [
      { ...view(), token: 'secret' },
      { ...view(), csrfToken: '' },
      { ...view(), permissions: { administrator: 'true', manageTasks: true } },
      {},
    ]) {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(invalid))
      await expect(
        createSessionGateway(createHttpClient({ fetch })).current(signal()),
      ).rejects.toMatchObject({ code: 'invalid-response' })
    }
  })
  it('never sends malformed pairing tokens or retries failed mutations', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('private'))
    const api = createSessionGateway(createHttpClient({ fetch }))
    for (const token of ['', 'https://example.invalid', 'A'.repeat(64)])
      await expect(api.exchange(token, signal())).rejects.toBeInstanceOf(TypeError)
    expect(fetch).not.toHaveBeenCalled()
    await expect(api.exchange('a'.repeat(64), signal())).rejects.toMatchObject({ code: 'offline' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('accepts only 201 for pairing and 204 for logout', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json(view()))
    const api = createSessionGateway(createHttpClient({ fetch }))
    await expect(api.exchange('a'.repeat(64), signal())).rejects.toMatchObject({
      code: 'invalid-response',
    })
    await expect(api.logout(view().csrfToken, signal())).rejects.toMatchObject({
      code: 'invalid-response',
    })
  })
})

describe('session lifecycle', () => {
  it('fences context changes and rechecks without replaying a pairing or mutation', async () => {
    const api = gateway(),
      session = createSession(api)
    await session.restore()
    const old = session.epoch()
    await session.restore()
    const problem = new ApiError('context-changed', 'private')
    session.invalidate(problem, old)
    expect(session.status.value).toBe('authenticated')
    session.invalidate(problem)
    expect(session.status.value).toBe('error')
    expect(session.current.value).toBeNull()
    expect(session.problem.value?.code).toBe('context-changed')
    await session.restore()
    expect(session.status.value).toBe('authenticated')
    expect(api.exchange).not.toHaveBeenCalled()
    expect(api.logout).not.toHaveBeenCalled()
    session.dispose()
  })
  it('distinguishes anonymous from unavailable instead of treating failure as logged in', async () => {
    const api = gateway()
    const current = vi.mocked(api.current)
    const session = createSession(api)
    current.mockRejectedValueOnce(new ApiError('unauthenticated', 'private'))
    await session.restore()
    expect(session.status.value).toBe('anonymous')
    expect(session.problem.value).toBeNull()
    current.mockRejectedValueOnce(new ApiError('unavailable', 'private'))
    await session.restore()
    expect(session.status.value).toBe('error')
    expect(session.current.value).toBeNull()
    session.dispose()
  })
  it('consumes a pairing only once despite double submit and ignores late restoration', async () => {
    const api = gateway()
    const old = deferred<BrowserSession>(),
      login = deferred<BrowserSession>()
    vi.mocked(api.current).mockReturnValueOnce(old.promise)
    vi.mocked(api.exchange).mockReturnValueOnce(login.promise)
    const session = createSession(api)
    const first = session.restore()
    const second = session.login('a'.repeat(64))
    await session.login('a'.repeat(64))
    await session.restore()
    login.resolve(view('c'))
    await second
    old.resolve(view('d'))
    await first
    expect(api.exchange).toHaveBeenCalledTimes(1)
    expect(api.current).toHaveBeenCalledTimes(1)
    expect(session.current.value?.id).toBe('c'.repeat(64))
    session.dispose()
  })
  it('reconciles a lost pairing response through GET without automatic re-exchange', async () => {
    const api = gateway()
    vi.mocked(api.exchange).mockRejectedValueOnce(new ApiError('timeout', 'private'))
    const session = createSession(api)
    await session.login('a'.repeat(64))
    expect(session.loginUncertain.value).toBe(true)
    expect(session.status.value).toBe('error')
    await session.restore()
    expect(session.status.value).toBe('authenticated')
    expect(api.exchange).toHaveBeenCalledTimes(1)
    session.dispose()
  })
  it('does not let a previous request expire a new identity', async () => {
    const session = createSession(gateway())
    await session.restore()
    const old = session.epoch()
    await session.restore()
    session.expire(old)
    expect(session.status.value).toBe('authenticated')
    session.expire()
    expect(session.status.value).toBe('anonymous')
    expect(session.current.value).toBeNull()
    expect(session.expired.value).toBe(true)
    session.dispose()
  })
  it('clears inventory immediately on logout and drops already-running VM reads', async () => {
    const api = gateway()
    const pending = deferred<{ items: [] }>(),
      logout = deferred<void>()
    vi.mocked(api.logout).mockReturnValueOnce(logout.promise)
    const session = createSession(api)
    await session.restore()
    const inventory = createInventory({ mode: 'http', list: () => pending.promise })
    const stop = watch(session.status, () => inventory.reset(), { flush: 'sync' })
    const read = inventory.reload()
    const leave = session.logout()
    expect(session.current.value).toBeNull()
    expect(inventory.status.value).toBe('idle')
    pending.resolve({ items: [] })
    await read
    expect(inventory.status.value).toBe('idle')
    logout.resolve()
    await leave
    expect(session.status.value).toBe('anonymous')
    expect(api.logout).toHaveBeenCalledWith(view().csrfToken, expect.any(AbortSignal))
    stop()
    inventory.dispose()
    session.dispose()
  })
  it('retains only the logout credential for a failed logout and does not silently restore access', async () => {
    const api = gateway()
    vi.mocked(api.logout).mockRejectedValueOnce(new ApiError('offline', 'private'))
    const session = createSession(api)
    await session.restore()
    await session.logout()
    expect(session.status.value).toBe('logout-error')
    expect(session.current.value).toBeNull()
    await session.restore()
    await session.login('a'.repeat(64))
    expect(api.current).toHaveBeenCalledTimes(1)
    expect(api.exchange).not.toHaveBeenCalled()
    await session.logout()
    expect(session.status.value).toBe('anonymous')
    expect(api.logout).toHaveBeenCalledTimes(2)
    session.dispose()
  })
  it('a 401 on logout means the session is already gone', async () => {
    const api = gateway()
    vi.mocked(api.logout).mockRejectedValueOnce(new ApiError('unauthenticated', 'private'))
    const session = createSession(api)
    await session.restore()
    await session.logout()
    expect(session.status.value).toBe('anonymous')
    expect(session.problem.value).toBeNull()
    session.dispose()
  })
  it('suspension and disposal fence off completions without aborting server VM work', async () => {
    for (const action of ['suspend', 'dispose'] as const) {
      const api = gateway(),
        pending = deferred<BrowserSession>()
      vi.mocked(api.current).mockReturnValueOnce(pending.promise)
      const session = createSession(api)
      const read = session.restore()
      session[action]()
      pending.resolve(view())
      await read
      expect(session.current.value).toBeNull()
      expect(api.logout).not.toHaveBeenCalled()
      expect(vi.mocked(api.current).mock.calls[0]![0].aborted).toBe(true)
      session.dispose()
    }
  })
})
