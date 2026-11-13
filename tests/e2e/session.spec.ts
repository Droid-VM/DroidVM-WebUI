import { expect, test, type Page, type APIRequestContext } from '@playwright/test'

async function pairing(request: APIRequestContext) {
  const response = await request.post('http://127.0.0.1:5189/__fixture/pairing')
  expect(response.status()).toBe(201)
  return ((await response.json()) as { pairingToken: string }).pairingToken
}
async function login(page: Page, request: APIRequestContext, path = '/#/vms') {
  const token = await pairing(request)
  await page.goto(path)
  await page.getByLabel('配对码', { exact: true }).fill(token)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
  return token
}

test('an unsupported protocol blocks resource reads after pairing without replaying the code', async ({
  page,
  request,
}) => {
  let exchanges = 0,
    reads = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/vms')) reads++
  })
  await page.route('**/api/v1/session', async (route) => {
    const response = await route.fetch(),
      body = await response.json()
    if (route.request().method() === 'POST') exchanges++
    if (body.server) body.server.apiMajor = 2
    await route.fulfill({ response, json: body })
  })
  await page.goto('/#/vms')
  await page.getByLabel('配对码', { exact: true }).fill(await pairing(request))
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('WebUI 版本不兼容')
  await expect(page.locator('.app-shell')).toHaveCount(0)
  expect(reads).toBe(0)
  await page.unroute('**/api/v1/session')
  await page.getByRole('button', { name: '检查会话', exact: true }).click()
  await expect(page.locator('[data-vm]')).toHaveCount(1)
  expect(exchanges).toBe(1)
})

for (const key of ['daemonEpoch', 'sessionId'] as const) {
  test(`changed ${key} clears all business content until a fresh session check`, async ({
    page,
    request,
  }) => {
    await login(page, request)
    await expect(page.locator('[data-vm]')).toHaveCount(1)
    await page.route('**/api/v1/vms', async (route) => {
      const response = await route.fetch(),
        body = await response.json()
      body.context[key] = key === 'sessionId' ? 'f'.repeat(64) : 'restarted'
      await route.fulfill({ response, json: body })
    })
    await page.getByRole('button', { name: '刷新列表', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('连接身份已变化')
    await expect(page.locator('.app-shell')).toHaveCount(0)
    await page.unroute('**/api/v1/vms')
    await page.getByRole('button', { name: '检查会话', exact: true }).click()
    await expect(page.locator('[data-vm]')).toHaveCount(1)
  })
}

test('authentication gates data, restores a deep link and keeps credentials out of script storage', async ({
  page,
  request,
}) => {
  const methods: string[] = []
  const vmCalls: string[] = []
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === '/api/v1/session') methods.push(req.method())
    if (new URL(req.url()).pathname === '/api/v1/vms') vmCalls.push(req.url())
  })
  await page.goto('/#/vms/http-contract-vm')
  await expect(page.getByLabel('配对码', { exact: true })).toBeVisible()
  expect(vmCalls).toEqual([])
  const token = await pairing(request)
  await page.getByLabel('配对码', { exact: true }).fill(token)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('region', { name: 'HTTP contract VM' })).toBeVisible()
  expect(methods).toEqual(['GET', 'POST'])
  expect(page.url()).toContain('#/vms/http-contract-vm')
  expect(page.url()).not.toContain(token)
  const cookie = (await page.context().cookies()).find((entry) => entry.name === 'droidvm-session')!
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/', secure: false })
  expect(cookie.value).toMatch(/^[0-9a-f]{64}$/)
  const storage = await page.evaluate(() =>
    JSON.stringify([document.cookie, { ...localStorage }, { ...sessionStorage }]),
  )
  expect(storage).not.toContain(token)
  expect(storage).not.toContain(cookie.value)
  expect(storage).not.toContain('csrfToken')
  await page.reload()
  await expect(page.getByRole('region', { name: 'HTTP contract VM' })).toBeVisible()
  expect(methods.filter((method) => method === 'POST')).toHaveLength(1)
})

test('pairing rejection clears the input, exposes no backend details and allows a fresh code', async ({
  page,
  request,
}) => {
  await page.goto('/#/vms')
  await page.getByLabel('配对码', { exact: true }).fill('0'.repeat(64))
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('配对码无效、已过期或已使用')
  await expect(page.getByLabel('配对码', { exact: true })).toHaveValue('')
  await expect(page.getByRole('main')).not.toContainText('fixture-private-detail')
  const token = await pairing(request)
  await page.getByLabel('配对码', { exact: true }).fill(token)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.locator('[data-vm]')).toHaveCount(1)
})

test('401 clears a loaded list and closes its details before showing the login form', async ({
  page,
  request,
}) => {
  await login(page, request)
  await expect(page.locator('[data-vm]')).toHaveCount(1)
  await page
    .context()
    .addCookies([
      { name: 'fixture_case', value: 'expired', url: 'http://127.0.0.1:5178', httpOnly: true },
    ])
  await page.getByRole('button', { name: '刷新列表', exact: true }).click()
  await expect(page.getByLabel('配对码', { exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('会话已过期或被吊销')
  await expect(page.locator('[data-vm]')).toHaveCount(0)
  await expect(page.locator('.app-shell')).toHaveCount(0)
})

test('logout deletes the cookie, removes data and keeps the requested page for a later login', async ({
  page,
  request,
}) => {
  await login(page, request, '/#/more')
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.getByLabel('配对码', { exact: true })).toBeVisible()
  expect(page.url()).toContain('#/more')
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'droidvm-session')).toBe(
    false,
  )
  await page.reload()
  await expect(page.getByLabel('配对码', { exact: true })).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveCount(0)
})

test('failed logout remains locked and can be retried with the original CSRF token', async ({
  page,
  request,
}) => {
  await login(page, request, '/#/more')
  await page.context().addCookies([
    {
      name: 'fixture_case',
      value: 'logout-failure',
      url: 'http://127.0.0.1:5178',
      httpOnly: true,
    },
  ])
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '退出尚未确认' }).first()).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveCount(0)
  await expect(page.getByLabel('配对码', { exact: true })).toHaveCount(0)
  await page.context().clearCookies({ name: 'fixture_case' })
  await page.getByRole('button', { name: '重试退出' }).click()
  await expect(page.getByLabel('配对码', { exact: true })).toBeVisible()
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'droidvm-session')).toBe(
    false,
  )
})

test('an unreadable pairing response reconciles through GET instead of repeating POST', async ({
  page,
  request,
}) => {
  let exchanges = 0
  await page.route('**/api/v1/session', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    exchanges++
    const result = await route.fetch()
    await route.fulfill({ response: result, body: '{"incompatible":true}' })
  })
  await page.goto('/#/vms')
  await page.getByLabel('配对码', { exact: true }).fill(await pairing(request))
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '登录结果尚未确认' })).toBeVisible()
  await expect(page.getByLabel('配对码', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '检查会话' }).click()
  await expect(page.locator('[data-vm]')).toHaveCount(1)
  expect(exchanges).toBe(1)
})

test('resuming a cached page rechecks the session instead of exposing cached resources', async ({
  page,
  request,
}) => {
  await login(page, request, '/#/vms/http-contract-vm')
  await expect(page.getByRole('region', { name: 'HTTP contract VM' })).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  )
  await expect(page.locator('.app-shell')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'HTTP contract VM' })).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  await page.context().clearCookies({ name: 'droidvm-session' })
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  )
  await expect(page.getByLabel('配对码', { exact: true })).toBeVisible()
  await expect(page.locator('[data-vm]')).toHaveCount(0)
})

for (const [locale, lang, label] of [
  ['zh-CN', 'zh-Hans', '登录 DroidVM'],
  ['zh-TW', 'zh-Hant', '登入 DroidVM'],
  ['en-GB', 'en', 'Sign in to DroidVM'],
]) {
  test.describe(`login in ${locale}`, () => {
    test.use({ locale })
    test('fits a 320px phone and a larger font with keyboard-friendly controls', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 568 })
      await page.goto('/')
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', lang!)
      await expect(page.locator('#pairing-token')).toBeVisible()
      for (const size of ['100%', '150%']) {
        await page.evaluate((value) => {
          document.documentElement.style.fontSize = value
        }, size)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        // Measure the whole Material field (the touch target), not its inner input.
        const input = await page.locator('#pairing-token').boundingBox()
        expect(input!.height).toBeGreaterThanOrEqual(44)
      }
      await page.screenshot({ path: `test-results/session-${lang}-320.png`, fullPage: true })
      await page.getByRole('combobox').click()
      await page.getByRole('option', { name: 'English', exact: true }).click()
      await expect(
        page.getByRole('heading', { name: 'Sign in to DroidVM', exact: true }),
      ).toBeVisible()
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    })
  })
}

test('the create button sits in the rail on wide screens and floats on phones', async ({
  page,
  request,
}) => {
  await page.route('**/api/v1/session', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    if (data.server) data.server.capabilities.push('packages.import.v1')
    await route.fulfill({ response, json: data })
  })
  await login(page, request)
  const rail = page.locator('.rail').getByRole('button', { name: '创建虚拟机', exact: true })
  await page.screenshot({ path: 'test-results/fab-rail.png' })
  await rail.click()
  const dialog = page.getByRole('dialog', { name: '创建虚拟机', exact: true })
  await expect(dialog.getByRole('button', { name: /导入/ })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(rail).toBeHidden()
  const floating = page.locator('.fab-compact')
  await expect(floating).toBeVisible()
  const fab = (await floating.boundingBox())!
  const nav = (await page.getByRole('navigation', { name: '主导航' }).boundingBox())!
  expect(fab.y + fab.height).toBeLessThanOrEqual(nav.y)
  await page.screenshot({ path: 'test-results/fab-compact.png' })
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '设置' }).click()
  await expect(floating).toHaveCount(0)
})
