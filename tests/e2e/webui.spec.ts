import { expect, test } from '@playwright/test'

for (const width of [320, 360, 375, 390, 650, 651, 900, 1440]) {
  test(`Q layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 844 })
    await page.goto('/dev.html#/vms')
    await expect(page.locator('[data-vm]')).toHaveCount(4)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 375 || width === 390) {
      const second = await page.locator('[data-vm]').nth(1).boundingBox()
      const bottomNav = await page.getByRole('navigation', { name: '主导航' }).boundingBox()
      expect(second && bottomNav && second.y + second.height <= bottomNav.y).toBeTruthy()
    }
    await page.screenshot({ path: `test-results/q-${width}.png`, fullPage: true })
  })
}

test('mobile navigation, shared filtering, detail, full viewport session and theme', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dev.html#/vms')
  await page.getByRole('button', { name: '搜索虚拟机', exact: true }).click()
  await page.getByRole('searchbox').fill('windows')
  await expect(page.locator('[data-vm]')).toHaveCount(1)
  await page.getByRole('searchbox').fill('')
  await page.locator('[data-vm]').first().locator('.vm-specs').click()
  await expect(page.getByRole('dialog')).toContainText('4,096 MiB')
  await expect(page.getByRole('dialog')).toContainText('IP 地址')
  await page.getByRole('link', { name: '终端', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('会话尚未接入')
  const bounds = await page.getByRole('dialog').boundingBox()
  expect(bounds?.height).toBe(844)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '资源' }).click()
  await page.getByRole('link', { name: /USB 设备/ }).click()
  await expect(page.getByRole('main').getByRole('status')).toContainText('USB 设备服务尚未接入')
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '更多' }).click()
  await page
    .getByRole('group', { name: '外观主题' })
    .getByRole('button', { name: '深色', exact: true })
    .click()
  await expect(page.locator('html')).toHaveAttribute('data-color', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-color', 'dark')
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '虚拟机' })
    .click()
  await page.setViewportSize({ width: 900, height: 650 })
  await expect(page.locator('[data-vm]')).toHaveCount(4)
  await page.screenshot({ path: 'test-results/q-dark-landscape.png', fullPage: true })
})

test('dialog focus returns to its trigger and the last card clears the mobile navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/dev.html#/vms')
  const trigger = page.locator('[data-vm]').first().locator('.vm-name')
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const last = await page.locator('[data-vm]').last().boundingBox()
  const nav = await page.getByRole('navigation', { name: '主导航' }).boundingBox()
  expect(last && nav && last.y + last.height <= nav.y).toBeTruthy()
})

test('production requires a session and contains no preview switch or simulated writes', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:4178/?preview=true#/vms')
  await expect(page.getByRole('alert')).toContainText('尚未连接管理服务')
  await expect(page.locator('[data-vm]')).toHaveCount(0)
  await expect(page.getByText('开发预览', { exact: false })).toHaveCount(0)
  await page.getByRole('button', { name: '检查会话' }).click()
  await expect(page.getByRole('alert')).toContainText('尚未连接管理服务')
  await page.goto('http://127.0.0.1:4178/dev.html#/vms')
  await expect(page.locator('[data-vm]')).toHaveCount(0)
  await page.goto('http://127.0.0.1:4178/?scenario=permission-denied#/vms')
  await expect(page.getByRole('heading', { name: '尚未连接管理服务' })).toBeVisible()
  await page.goto('http://127.0.0.1:4178/#/components')
  await expect(page.getByRole('heading', { name: '登录 DroidVM' })).toBeVisible()
  expect(errors).toEqual([])
})

test('deep links and browser back retain filter state', async ({ page }) => {
  await page.goto('/dev.html#/vms/demo-debian')
  const details = page.getByRole('region', { name: '虚拟机详情' })
  await expect(details).toContainText('Debian 13')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-vm="demo-debian"]')).toHaveClass(/selected/)
  await details.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByText('选择一台虚拟机查看详情')).toBeVisible()
  await page.getByRole('button', { name: /运行中/ }).click()
  await expect(page.locator('[data-vm]')).toHaveCount(2)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '任务' }).click()
  await page.goBack()
  await expect(page.locator('[data-vm]')).toHaveCount(2)
})
