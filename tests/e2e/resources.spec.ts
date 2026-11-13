import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

async function openDisks(page: Page, request: APIRequestContext, extra: object[] = []) {
  let context = { daemonEpoch: '', sessionId: '' }
  const disk = {
    id: 'system-disk',
    name: 'Debian 系统盘',
    path: '/data/droidvm/disks/debian.qcow2',
    parentId: null,
    backing: false,
    selectable: true,
  }
  await page.route('**/api/v1/session', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    if (data.server) {
      data.server.capabilities.push('disks.list.v1', 'disks.inspect.v1')
      context = { daemonEpoch: data.server.daemonEpoch, sessionId: data.id }
    }
    await route.fulfill({ response, json: data })
  })
  await page.route('**/api/v1/disks', (route) =>
    route.fulfill({ json: { context, revision: 'disks', items: [...extra, disk] } }),
  )
  await page.route('**/api/v1/disks/system-disk', (route) =>
    route.fulfill({
      json: {
        context,
        revision: 'disks',
        vmRevision: 'vms',
        disk,
        chain: [disk],
        chainComplete: true,
        children: [],
        attachments: [],
        readOnlyRequired: false,
        checkedAtMs: 1000,
        inspection: {
          state: 'ready',
          format: 'qcow2',
          virtualBytes: '21474836480',
          allocatedBytes: '4294967296',
          clusterBytes: '65536',
          encrypted: false,
          dirty: false,
          compression: null,
        },
      },
    }),
  )
  const response = await request.post('http://127.0.0.1:5189/__fixture/pairing')
  const { pairingToken } = await response.json()
  await page.goto('/#/resources/disk')
  await page.getByLabel('配对码', { exact: true }).fill(pairingToken)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.locator('.resource-card', { hasText: 'Debian 系统盘' })).toBeVisible()
}

test('disk details open beside the list on wide screens and as a page on phones', async ({
  page,
  request,
}) => {
  await openDisks(page, request)
  // Wide screens always show an item: the first disk opens by itself.
  const pane = page.getByRole('region', { name: 'Debian 系统盘' })
  await expect(pane).toContainText('qcow2')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.resource-card.selected')).toHaveCount(1)
  await expect(pane.getByRole('button', { name: '关闭', exact: true })).toBeHidden()
  await page.screenshot({ path: 'test-results/resources-pane.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('dialog', { name: 'Debian 系统盘' })).toContainText('qcow2')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.resource-card .card-title', { hasText: 'Debian 系统盘' }).click()
  await expect(page.getByRole('dialog', { name: 'Debian 系统盘' })).toContainText('qcow2')
  await page.screenshot({ path: 'test-results/resources-dialog.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})

test('resizing to a wide screen moves an open disk dialog into the pane and unlocks scrolling', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openDisks(page, request)
  await page.locator('.resource-card .card-title', { hasText: 'Debian 系统盘' }).click()
  await expect(page.getByRole('dialog', { name: 'Debian 系统盘' })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.getByRole('region', { name: 'Debian 系统盘' })).toContainText('qcow2')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})

test('overlay disks are listed under their backing disk', async ({ page, request }) => {
  await openDisks(page, request, [
    {
      id: 'overlay-disk',
      name: 'Debian 增量盘',
      path: '/data/droidvm/disks/debian-overlay.qcow2',
      parentId: 'system-disk',
      backing: false,
      selectable: true,
    },
  ])
  const cards = page.locator('.resource-card')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toContainText('Debian 系统盘')
  await expect(cards.nth(1)).toContainText('Debian 增量盘')
  await expect(cards.nth(1)).toHaveClass(/child/)
  const parent = (await cards.nth(0).boundingBox())!
  const child = (await cards.nth(1).boundingBox())!
  expect(child.x).toBeGreaterThan(parent.x)
})
