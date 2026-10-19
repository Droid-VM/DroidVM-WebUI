import { inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type { BrowserSession, SessionGateway } from '../api/gateway'

export type SessionStatus =
  | 'checking'
  | 'anonymous'
  | 'authenticated'
  | 'authenticating'
  | 'signing-out'
  | 'error'
  | 'logout-error'

// Credentials/CSRF stay in memory; the browser alone handles the HttpOnly cookie.
// Generation changes fence off responses from a previous identity or lifecycle.
export function createSession(gateway: SessionGateway) {
  const status = ref<SessionStatus>('checking')
  const current = shallowRef<BrowserSession | null>(null)
  const problem = shallowRef<ApiProblem | null>(null)
  const expired = ref(false)
  const loginUncertain = ref(false)
  let request: AbortController | undefined
  let generation = 0
  let disposed = false
  let logoutCsrf: string | undefined
  const busy = () => status.value === 'authenticating' || status.value === 'signing-out'

  function clear(next: SessionStatus) {
    generation++
    request?.abort()
    request = undefined
    current.value = null
    problem.value = null
    status.value = next
  }
  async function load(pairingToken?: string) {
    if (disposed || busy() || logoutCsrf !== undefined) return
    clear(pairingToken === undefined ? 'checking' : 'authenticating')
    const controller = new AbortController()
    request = controller
    const epoch = generation
    loginUncertain.value = false
    try {
      const result =
        pairingToken === undefined
          ? await gateway.current(controller.signal)
          : await gateway.exchange(pairingToken, controller.signal)
      if (disposed || epoch !== generation) return
      current.value = result
      expired.value = false
      status.value = 'authenticated'
    } catch (cause) {
      if (disposed || epoch !== generation) return
      if (cause instanceof ApiError && cause.code === 'unauthenticated') {
        status.value = 'anonymous'
        if (pairingToken !== undefined) problem.value = describeApiError(cause)
      } else {
        problem.value = describeApiError(cause)
        status.value = 'error'
        // A response can disappear after the pairing was consumed. Offer a GET
        // to reconcile; never automatically exchange the one-time token again.
        loginUncertain.value = pairingToken !== undefined
      }
    } finally {
      if (epoch === generation) request = undefined
    }
  }
  function expire(epoch = generation) {
    if (disposed || epoch !== generation) return
    expired.value = true
    clear(logoutCsrf === undefined ? 'anonymous' : 'logout-error')
  }
  async function logout() {
    if (disposed || busy()) return
    logoutCsrf ??= current.value?.csrfToken
    if (logoutCsrf === undefined) return
    const csrf = logoutCsrf
    clear('signing-out')
    const controller = new AbortController()
    request = controller
    const epoch = generation
    try {
      await gateway.logout(csrf, controller.signal)
      if (disposed || epoch !== generation) return
      logoutCsrf = undefined
      expired.value = false
      status.value = 'anonymous'
    } catch (cause) {
      if (disposed || epoch !== generation) return
      if (cause instanceof ApiError && cause.code === 'unauthenticated') {
        logoutCsrf = undefined
        expired.value = false
        status.value = 'anonymous'
      } else {
        problem.value = describeApiError(cause)
        status.value = 'logout-error'
      }
    } finally {
      if (epoch === generation) request = undefined
    }
  }
  return {
    status: readonly(status),
    current: readonly(current),
    problem: readonly(problem),
    expired: readonly(expired),
    loginUncertain: readonly(loginUncertain),
    epoch: () => generation,
    restore: () => load(),
    login: (token: string) => load(token),
    logout,
    expire,
    invalidate(cause: ApiError, epoch = generation) {
      if (disposed || epoch !== generation) return
      clear(logoutCsrf === undefined ? 'error' : 'logout-error')
      problem.value = describeApiError(cause)
    },
    suspend() {
      if (!disposed) clear(logoutCsrf === undefined ? 'checking' : 'logout-error')
    },
    dispose() {
      disposed = true
      logoutCsrf = undefined
      clear('anonymous')
    },
  }
}
export type Session = ReturnType<typeof createSession>
export const sessionKey: InjectionKey<Session> = Symbol('browser-session')
// Development visual scenarios intentionally have no authentication service.
export function useSession() {
  return inject(sessionKey, null)
}
