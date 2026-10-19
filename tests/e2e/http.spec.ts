import { expect, test, type Page } from '@playwright/test'

async function useFixture(page: Page, scenario: string) {
  await page.context().addCookies([
    {
      name: 'fixture_case',
      value: scenario,
      url: 'http://127.0.0.1:5178',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ])
}

test('HTTP adapter reads through the proxy and preserves session cookies', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await useFixture(page, 'ready')
  const requests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.method())
  })
  await page.goto('/dev.html?transport=http&scenario=empty#/vms')
  await expect(page.locator('[data-vm]')).toHaveCount(1)
  await expect(page.locator('[data-vm]')).toHaveAttribute('data-vm', 'http-contract-vm')
  await expect(page.locator('.connection')).toHaveText('已读取列表')
  await expect(page.locator('.preview-banner')).toContainText('接口联调')
  await expect(page.getByRole('button', { name: '停止', exact: true })).toBeDisabled()
  expect(requests).toEqual(['GET'])
  expect(await page.evaluate(() => document.cookie)).not.toContain('fixture_')
  expect(await page.context().cookies()).toContainEqual(
    expect.objectContaining({
      name: 'fixture_seen',
      httpOnly: true,
      sameSite: 'Strict',
      path: '/api/',
    }),
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/q-http-375.png', fullPage: true })
  await page.getByRole('button', { name: '刷新列表', exact: true }).click()
  await expect(page.locator('[data-vm]')).toHaveCount(1)
  expect(requests).toEqual(['GET', 'GET'])
})

test('expired authentication clears a prior HTTP list and requires login', async ({ page }) => {
  await useFixture(page, 'ready')
  await page.goto('/dev.html?transport=http#/vms')
  await expect(page.locator('[data-vm]')).toHaveCount(1)
  await useFixture(page, 'expired')
  await page.getByRole('button', { name: '刷新列表', exact: true }).click()
  await expect(
    page.getByRole('main').getByRole('heading', { name: '需要登录', exact: true }),
  ).toBeVisible()
  await expect(page.locator('[data-vm]')).toHaveCount(0)
  await expect(page.locator('.connection')).toHaveText('需要登录')
  await expect(page.getByRole('main')).not.toContainText('fixture-private-detail')
  await expect(page.getByRole('button', { name: /刷新列表|重新检查|重新连接/ })).toHaveCount(0)
})

for (const [scenario, title] of [
  ['denied', '没有访问权限'],
  ['rate-limited', '请求过于频繁'],
  ['unavailable', '尚未连接管理服务'],
  ['invalid', '服务数据不兼容'],
  ['html', '服务数据不兼容'],
]) {
  test(`HTTP ${scenario} does not show samples or internal error text`, async ({ page }) => {
    await useFixture(page, scenario!)
    await page.goto('/dev.html?transport=http#/vms')
    await expect(
      page.getByRole('main').getByRole('heading', { name: title, exact: true }),
    ).toBeVisible()
    await expect(page.locator('[data-vm]')).toHaveCount(0)
    await expect(page.getByRole('main')).not.toContainText('fixture-private-detail')
  })
}

test('a successful empty HTTP list is different from a missing session', async ({ page }) => {
  await page.goto('/dev.html?transport=http#/vms')
  await expect(
    page.getByRole('main').getByRole('heading', { name: '需要登录', exact: true }),
  ).toBeVisible()
  await useFixture(page, 'empty')
  await page.reload()
  await expect(page.getByRole('heading', { name: '暂无虚拟机', exact: true })).toBeVisible()
  await expect(page.locator('.connection')).toHaveText('已读取列表')
})

test('a redirect cannot replace a management read with a different endpoint', async ({ page }) => {
  await useFixture(page, 'redirect')
  const redirects: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/__fixture/redirected')) redirects.push(request.url())
  })
  await page.goto('/dev.html?transport=http#/vms')
  await expect(page.getByRole('heading', { name: '与宿主的连接已断开', exact: true })).toBeVisible()
  expect(redirects).toEqual([])
})

test('WebSocket proxy preserves Host, Origin, cookies, text and binary across reconnects', async ({
  page,
}) => {
  await useFixture(page, 'ready')
  await page.goto('/dev.html?transport=http#/vms')
  await expect(page.locator('[data-vm]')).toHaveCount(1)
  for (let round = 0; round < 2; round++) {
    const echoed = await page.evaluate(
      () =>
        new Promise<(string | number[])[]>((resolve, reject) => {
          const result: (string | number[])[] = []
          const socket = new WebSocket(
            `${location.origin.replace(/^http/, 'ws')}/api/v1/__fixture_socket`,
          )
          socket.binaryType = 'arraybuffer'
          const timer = window.setTimeout(() => {
            socket.close()
            reject(new Error('WebSocket fixture timed out'))
          }, 5000)
          socket.onopen = () => {
            socket.send('多语言 transport')
            socket.send(new Uint8Array([0, 127, 255]))
          }
          socket.onerror = () => {
            clearTimeout(timer)
            reject(new Error('WebSocket fixture failed'))
          }
          socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
            result.push(
              typeof event.data === 'string' ? event.data : Array.from(new Uint8Array(event.data)),
            )
            if (result.length === 2) {
              socket.close()
            }
          }
          socket.onclose = () => {
            clearTimeout(timer)
            if (result.length === 2) resolve(result)
            else reject(new Error('WebSocket closed before both messages arrived'))
          }
        }),
    )
    expect(echoed).toEqual(['多语言 transport', [0, 127, 255]])
  }
  await useFixture(page, 'expired')
  const rejected = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        let failed = false
        const socket = new WebSocket(
          `${location.origin.replace(/^http/, 'ws')}/api/v1/__fixture_socket`,
        )
        const timer = window.setTimeout(() => {
          socket.close()
          resolve(false)
        }, 5000)
        socket.onopen = () => {
          clearTimeout(timer)
          socket.close()
          resolve(false)
        }
        socket.onerror = () => {
          failed = true
        }
        socket.onclose = () => {
          clearTimeout(timer)
          resolve(failed)
        }
      }),
  )
  expect(rejected).toBe(true)
})

test('API errors never become HTML and production ignores the integration switch', async ({
  page,
  request,
}) => {
  for (const path of ['/api/v1/not-a-route', '/api?query=value']) {
    const missing = await request.get(path)
    expect(missing.status()).toBe(404)
    expect(missing.headers()['content-type']).toContain('application/json')
  }
  const unavailable = await request.get('http://127.0.0.1:4178/api/v1/vms')
  expect(unavailable.status()).toBe(503)
  expect(unavailable.headers()['content-type']).toContain('application/json')
  const requests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url())
  })
  await page.goto('http://127.0.0.1:4178/?transport=http&scenario=default#/vms')
  await expect(page.getByRole('heading', { name: '尚未连接管理服务', exact: true })).toBeVisible()
  await expect(page.locator('[data-vm]')).toHaveCount(0)
  await expect(page.locator('.preview-banner')).toHaveCount(0)
  expect(requests).toEqual(['http://127.0.0.1:4178/api/v1/session'])
})
