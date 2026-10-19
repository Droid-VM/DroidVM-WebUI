import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

async function openEditor(page: Page, request: APIRequestContext) {
  let context = { daemonEpoch: '', sessionId: '' }
  const json = JSON.stringify({ vms: [{ id: 'edit-vm', name: '编辑测试', cpu_count: 2 }] })
  await page.route('**/api/v1/session', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    if (data.server) {
      data.server.capabilities.push('vm.configuration.v1')
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
            id: 'edit-vm',
            name: '编辑测试',
            state: 'STOPPED',
            backend: 'crosvm',
            cpuCount: 2,
            memoryMiB: 2048,
          },
        ],
      },
    }),
  )
  await page.route('**/api/v1/vm-configuration/*', async (route) => {
    const operation = new URL(route.request().url()).pathname.split('/').pop()
    if (operation !== 'read') return route.fulfill({ json: { context } })
    const bytes = new TextEncoder().encode(json)
    await route.fulfill({
      json: {
        context,
        snapshotId: 'snapshot',
        cursor: { epoch: context.daemonEpoch, sequence: '1' },
        total: 2,
        next: null,
        items: [
          {
            type: 'metadata',
            revision: 'revision',
            bytes: bytes.length,
            persisted: true,
            recovered: false,
            durabilityUncertain: false,
          },
          { type: 'chunk', offset: 0, data: btoa(String.fromCharCode(...bytes)) },
        ],
      },
    })
  })
  const response = await request.post('http://127.0.0.1:5189/__fixture/pairing')
  const { pairingToken } = await response.json()
  await page.goto('/#/vms/edit-vm/edit')
  await page.getByLabel('配对码', { exact: true }).fill(pairingToken)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('group', { name: '配置分类' })).toBeVisible()
}

test('configuration categories become a side list on wide screens and chips on phones', async ({
  page,
  request,
}) => {
  await openEditor(page, request)
  const categories = page.getByRole('group', { name: '配置分类' })
  const form = page.locator('.configuration > form')
  const list = (await categories.boundingBox())!
  const content = (await form.boundingBox())!
  expect(list.x + list.width).toBeLessThanOrEqual(content.x)
  expect(Math.abs(list.y - content.y)).toBeLessThan(2)
  await page.screenshot({ path: 'test-results/configuration-wide.png', fullPage: true })
  await categories.getByRole('button', { name: '外设' }).click()
  await page.getByRole('combobox', { name: '添加设备', exact: true }).click()
  await expect(page.getByRole('option', { name: 'xHCI USB 控制器' })).toBeVisible()
  await page.screenshot({ path: 'test-results/configuration-select.png' })
  await page.keyboard.press('Escape')
  await categories.getByRole('button', { name: '基本' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  const chips = (await categories.boundingBox())!
  expect(chips.y + chips.height).toBeLessThanOrEqual((await form.boundingBox())!.y)
  await page.screenshot({ path: 'test-results/configuration-compact.png' })
})
