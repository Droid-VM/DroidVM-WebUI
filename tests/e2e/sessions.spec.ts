import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const instanceId = 'b'.repeat(32)
async function openSession(page: Page, request: APIRequestContext, path: string) {
  let context = { daemonEpoch: '', sessionId: '' }
  await page.route('**/api/v1/session', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    if (data.server) {
      data.server.capabilities.push('vm.terminal.v1', 'vm.display.v1')
      context = { daemonEpoch: data.server.daemonEpoch, sessionId: data.id }
    }
    await route.fulfill({ response, json: data })
  })
  await page.route('**/api/v1/vms', (route) =>
    route.fulfill({
      json: {
        context,
        items: [
          {
            id: 'session-vm',
            name: '会话测试',
            state: 'RUNNING',
            backend: 'crosvm',
            cpuCount: 2,
            memoryMiB: 2048,
            lifecycle: {
              instanceId,
              revision: '1',
              configRevision: 'config-1',
              actions: ['stop'],
              uncertain: false,
            },
          },
        ],
      },
    }),
  )
  const expected = { instanceId, revision: '1' }
  await page.route('**/api/v1/vm-terminals/session-vm', (route) =>
    route.fulfill({
      json: {
        context,
        vmId: 'session-vm',
        expected,
        streams: ['console'],
        resizeSupported: false,
      },
    }),
  )
  await page.route('**/api/v1/vm-displays/session-vm', (route) =>
    route.fulfill({
      json: {
        context,
        vmId: 'session-vm',
        expected,
        screens: [{ id: 'gpu-0', available: true, reason: '', inputEnabled: true }],
      },
    }),
  )
  const response = await request.post('http://127.0.0.1:5189/__fixture/pairing')
  const { pairingToken } = await response.json()
  await page.goto(path)
  await page.getByLabel('配对码', { exact: true }).fill(pairingToken)
  await page.getByRole('button', { name: '登录', exact: true }).click()
}

for (const [theme, background] of [
  ['light', 'rgb(255, 255, 255)'],
  ['dark', 'rgb(13, 14, 19)'],
]) {
  test(`the terminal fills the viewport and follows the ${theme} theme`, async ({
    page,
    request,
  }) => {
    await page.addInitScript((value) => localStorage.setItem('droidvm.theme', value), theme!)
    await openSession(page, request, '/#/vms/session-vm/terminal')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('terminal-output')).toBeVisible()
    const box = (await dialog.boundingBox())!
    const viewport = page.viewportSize()!
    expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, viewport.width, viewport.height])
    // xterm 6 paints the theme background on its scrollable element.
    await expect(page.locator('.xterm-scrollable-element')).toHaveCSS(
      'background-color',
      background!,
    )
    await expect(dialog.getByRole('combobox', { name: '串口' })).toBeVisible()
    await page.screenshot({ path: `test-results/session-terminal-${theme}.png` })
  })
}

test('the console fills the viewport with its toolbars', async ({ page, request }) => {
  await openSession(page, request, '/#/vms/session-vm/console')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('graphic-screen')).toBeVisible()
  await expect(dialog.getByTestId('graphic-keys')).toBeVisible()
  await expect(dialog.getByRole('switch', { name: '适应视口' })).toBeVisible()
  const box = (await dialog.boundingBox())!
  expect(box.height).toBe(page.viewportSize()!.height)
  await page.screenshot({ path: 'test-results/session-console.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  expect((await dialog.boundingBox())!.height).toBe(844)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/session-console-compact.png' })
})
