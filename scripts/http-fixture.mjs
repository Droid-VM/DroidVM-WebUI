// Test-only upstream for the Vite proxy. Never imported by either app entry.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { WebSocketServer } from 'ws'
import { randomBytes } from 'node:crypto'

const snapshot = JSON.parse(await readFile(new URL('../dev/vms.json', import.meta.url), 'utf8'))
const items = [{ ...snapshot.items[0], id: 'http-contract-vm', name: 'HTTP contract VM' }]
const selectCase = (request) =>
  /(?:^|;\s*)fixture_case=([a-z-]+)/.exec(request.headers.cookie ?? '')?.[1]
const send = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}
const pairings = new Set()
const sessions = new Map()
const secret = () => randomBytes(32).toString('hex')
const serverInfo = {
  apiMajor: 1,
  apiMinor: 0,
  daemonEpoch: secret(),
  version: 'fixture',
  versionCode: '9007199254740993',
  capabilities: ['session.v1', 'vm.list.v1'],
}
const currentSession = (request) => {
  const token = /(?:^|;\s*)droidvm-session=([0-9a-f]{64})(?:;|$)/.exec(
    request.headers.cookie ?? '',
  )?.[1]
  return { token, view: sessions.get(token) }
}
const server = createServer(async (request, response) => {
  if (request.url === '/__fixture/ready') return send(response, 200, { ready: true })
  if (request.url === '/__fixture/pairing' && request.method === 'POST') {
    if (pairings.size >= 512) return send(response, 429, {})
    const token = secret()
    pairings.add(token)
    return send(response, 201, { pairingToken: token })
  }
  if (request.url === '/api/v1/session') {
    if (request.headers.host !== '127.0.0.1:5178' || request.headers.accept !== 'application/json')
      return send(response, 403, {})
    if (request.method !== 'GET' && request.headers.origin !== 'http://127.0.0.1:5178')
      return send(response, 403, {})
    const { token, view } = currentSession(request)
    if (request.method === 'POST') {
      if (request.headers['content-type'] !== 'application/json') return send(response, 400, {})
      let body = ''
      try {
        for await (const chunk of request) {
          body += chunk.toString('utf8')
          if (body.length > 4096) return send(response, 413, {})
        }
        const input = JSON.parse(body)
        if (Object.keys(input).length !== 1 || !pairings.delete(input.pairingToken))
          return send(response, 401, { message: 'fixture-private-detail' })
      } catch {
        return send(response, 400, {})
      }
      const next = secret()
      const result = {
        id: secret(),
        csrfToken: secret(),
        permissions: { administrator: true, manageTasks: true },
        server: serverInfo,
      }
      sessions.set(next, result)
      response.setHeader('Set-Cookie', `droidvm-session=${next}; Path=/; HttpOnly; SameSite=Strict`)
      return send(response, 201, result)
    }
    if (!view || selectCase(request) === 'expired') return send(response, 401, {})
    if (request.method === 'GET') return send(response, 200, view)
    if (request.method === 'DELETE') {
      if (selectCase(request) === 'logout-failure') return send(response, 503, {})
      if (request.headers['x-droidvm-csrf'] !== view.csrfToken) return send(response, 403, {})
      sessions.delete(token)
      response.writeHead(204, {
        'Cache-Control': 'no-store',
        'Set-Cookie': 'droidvm-session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
      })
      return response.end()
    }
    return send(response, 405, {})
  }
  if (request.url !== '/api/v1/vms') return send(response, 404, { error: { code: 'not_found' } })
  if (request.method !== 'GET') return send(response, 405, { error: { code: 'unsupported' } })
  if (request.headers.host !== '127.0.0.1:5178' || request.headers.accept !== 'application/json') {
    return send(response, 400, { error: { code: 'invalid_request' } })
  }
  const scenario = selectCase(request)
  if ((!scenario && !currentSession(request).view) || scenario === 'expired')
    return send(response, 401, { message: 'fixture-private-detail' })
  if (scenario === 'denied') return send(response, 403, { message: 'fixture-private-detail' })
  if (scenario === 'rate-limited') {
    response.setHeader('Retry-After', '2')
    return send(response, 429, { message: 'fixture-private-detail' })
  }
  if (scenario === 'unavailable') return send(response, 503, { message: 'fixture-private-detail' })
  if (scenario === 'invalid')
    return send(response, 200, { items: [{ ...items[0], id: 9007199254740992 }] })
  if (scenario === 'html') {
    response.writeHead(200, { 'Content-Type': 'text/html' })
    return response.end('<html><body>fixture-private-detail</body></html>')
  }
  if (scenario === 'redirect') {
    response.writeHead(302, { Location: '/__fixture/redirected' })
    return response.end()
  }
  response.setHeader('Set-Cookie', 'fixture_seen=yes; HttpOnly; SameSite=Strict; Path=/api/')
  return send(response, 200, {
    items: scenario === 'empty' ? [] : items,
    context: {
      daemonEpoch: serverInfo.daemonEpoch,
      sessionId: currentSession(request).view?.id ?? '0'.repeat(64),
    },
  })
})

const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 })
server.on('upgrade', (request, socket, head) => {
  if (
    request.url !== '/api/v1/__fixture_socket' ||
    request.headers.host !== '127.0.0.1:5178' ||
    request.headers.origin !== 'http://127.0.0.1:5178' ||
    selectCase(request) !== 'ready'
  ) {
    socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
    return
  }
  sockets.handleUpgrade(request, socket, head, (connection) => {
    connection.on('error', () => undefined)
    connection.on('message', (data, binary) => connection.send(data, { binary }))
  })
})
server.listen(5189, '127.0.0.1')
const shutdown = () => {
  for (const client of sockets.clients) client.terminate()
  sockets.close()
  server.close()
  server.closeAllConnections()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
