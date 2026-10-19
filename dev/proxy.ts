import type { Plugin, ProxyOptions, ViteDevServer } from 'vite'

// Server-side setting only: never a VITE_* variable or a URL query parameter.
export function createApiProxy(
  target: string | undefined,
): Record<string, ProxyOptions> | undefined {
  if (!target) return undefined
  const url = new URL(target)
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'DROIDVM_DEV_API_TARGET requires an HTTP or HTTPS origin, without credentials or paths',
    )
  return {
    '^/api(?:[/?]|$)': {
      target: url.origin,
      changeOrigin: false,
      secure: true,
      ws: true,
      // Preserve Host/Origin and cookie attributes; do not spoof browser identity
      // or downgrade Secure cookies to make development authentication pass.
    },
  }
}

export function unavailableApi(): Plugin {
  const install = (server: Pick<ViteDevServer, 'middlewares'>) => {
    server.middlewares.use((request, response, next) => {
      const path = request.url?.split('?')[0]
      if (path !== '/api' && !path?.startsWith('/api/')) return next()
      response.statusCode = 503
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      response.end('{"error":{"code":"unavailable"}}')
    })
  }
  return { name: 'unavailable-api', configureServer: install, configurePreviewServer: install }
}
