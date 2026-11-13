import { expect, test } from '@playwright/test'

const failures = [
  ['unauthenticated', '需要登录', undefined],
  ['permission-denied', '没有访问权限', undefined],
  ['unsupported', '当前服务不支持此功能', undefined],
  ['invalid-response', '服务数据不兼容', undefined],
  ['offline', '与宿主的连接已断开', '重新连接'],
  ['timeout', '读取超时', '重新查询'],
  ['unavailable', '尚未连接管理服务', '重新检查'],
  ['commit-uncertain', '操作结果待核实', '查询当前状态'],
] as const

for (const [scenario, title, action] of failures) {
  test(`explicit ${scenario} recovery`, async ({ page }) => {
    await page.goto(`/dev.html?scenario=${scenario}#/vms`)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.locator('[data-vm]')).toHaveCount(0)
    if (action) await expect(main.getByRole('button', { name: action, exact: true })).toBeEnabled()
    else await expect(main.getByRole('button', { name: /重试|重新|查询当前状态/ })).toHaveCount(0)
    if (scenario === 'commit-uncertain') {
      await main.getByRole('button', { name: action!, exact: true }).click()
      await expect(page.locator('[data-vm]')).toHaveCount(4)
      await expect(page.getByRole('button', { name: '停止', exact: true }).first()).toBeDisabled()
    }
  })
}

test('loading is indeterminate and empty inventory is not a disconnected state', async ({
  page,
}) => {
  await page.goto('/dev.html?scenario=loading#/vms')
  const progress = page.getByRole('progressbar', { name: '正在读取', exact: true })
  await expect(progress).toBeVisible()
  await expect(progress).not.toHaveAttribute('aria-valuenow')
  await expect(page.locator('[data-vm]')).toHaveCount(4)
  await page.goto('/dev.html?scenario=empty#/vms')
  await expect(page.getByRole('heading', { name: '暂无虚拟机' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重新检查' })).toHaveCount(0)
})

test('long names, large text, mobile controls and changed viewport remain usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/dev.html?scenario=long-name#/vms')
  await page.addStyleTag({ content: 'html { font-size: 24px; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const filters = page.getByRole('group', { name: '状态筛选' }).getByRole('button')
  for (const button of await filters.all())
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.getByRole('button', { name: '搜索虚拟机', exact: true }).click()
  expect(
    await page
      .getByRole('searchbox')
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16)
  await page.locator('[data-vm]').first().locator('.vm-specs').click()
  await expect(page.getByRole('dialog')).toContainText('用于检查长名称换行的虚拟机')
  expect(
    await page
      .getByRole('dialog')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true)
  await page.getByRole('link', { name: '终端', exact: true }).click()
  await page.setViewportSize({ width: 568, height: 320 })
  expect((await page.getByRole('dialog').boundingBox())?.height).toBe(320)
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: '会话尚未接入', exact: true }),
  ).toBeInViewport()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }),
  ).toBeInViewport()
  await page.screenshot({ path: 'test-results/q-large-text-session.png' })
})

test('navigation restores list scroll and moves keyboard focus to main content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 })
  await page.goto('/dev.html#/vms')
  await expect(page.locator('[data-vm]')).toHaveCount(4)
  await page.evaluate(() => window.scrollTo(0, 250))
  const before = await page.evaluate(() => window.scrollY)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '设置' }).click()
  await expect(page.getByRole('main')).toBeFocused()
  await expect(page).toHaveTitle('DroidVM · 设置')
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '虚拟机' })
    .click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before)
})

test('a missing page bundle after an upgrade reloads once into the target route', async ({
  page,
}) => {
  await page.goto('/dev.html#/vms')
  await expect(page.locator('[data-vm]')).toHaveCount(4)
  let loads = 0
  page.on('load', () => loads++)
  await page.route('**/pages/TasksPage.vue*', (route) => route.abort())
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '任务' }).click()
  await expect.poll(() => loads).toBe(1)
  await expect(page).toHaveURL(/#\/tasks$/)
  // The reloaded page fails the same way and must not reload again.
  await page.waitForTimeout(1000)
  expect(loads).toBe(1)
})

test('nested confirmations keep scroll locked, trap focus and report failures', async ({
  page,
}) => {
  await page.goto('/dev.html#/components')
  const unknown = page.getByRole('progressbar', { name: '未知进度', exact: true })
  await expect(unknown).not.toHaveAttribute('aria-valuenow')
  await expect(page.getByRole('progressbar', { name: '已知进度', exact: true })).toHaveAttribute(
    'aria-valuenow',
    '42',
  )
  await page.getByRole('checkbox', { name: '演示提交失败' }).check()
  await page.getByRole('button', { name: '打开嵌套对话框' }).click()
  await page.getByRole('button', { name: '在详情中确认' }).click()
  const inner = page.getByRole('dialog', { name: '确认操作示例' })
  await expect(inner).toBeVisible()
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press('Tab')
    expect(await inner.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  await inner.getByRole('button', { name: '确认', exact: true }).click()
  await expect(inner.getByRole('button', { name: '正在处理…' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(inner).toBeVisible()
  await expect(inner.getByRole('alert')).toContainText('演示失败')
  await inner.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '外层详情' })).toBeVisible()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  await page.getByRole('checkbox', { name: '演示提交失败' }).uncheck()
  await page.getByRole('button', { name: '打开确认对话框' }).click()
  await inner.getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByRole('heading', { name: '确认意图已收到' })).toBeVisible()
  await page.getByRole('button', { name: '关闭提示' }).click()
  await expect(page.getByRole('heading', { name: '确认意图已收到' })).toHaveCount(0)
})
