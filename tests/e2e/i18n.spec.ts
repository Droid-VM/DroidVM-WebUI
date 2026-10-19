import { expect, test } from '@playwright/test'

for (const [browserLocale, language, title, running] of [
  ['zh-CN', 'zh-Hans', '虚拟机', '运行中'],
  ['zh-TW', 'zh-Hant', '虛擬機', '執行中'],
  ['en-GB', 'en', 'VMs', 'Running'],
  ['ja-JP', 'en', 'VMs', 'Running'],
]) {
  test.describe(`browser locale ${browserLocale}`, () => {
    test.use({ locale: browserLocale })
    test('automatically selects language, title, states and accessibility labels', async ({
      page,
    }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'warning') errors.push(message.text())
      })
      await page.goto('/dev.html#/vms')
      await expect(page.locator('html')).toHaveAttribute('lang', language!)
      await expect(page).toHaveTitle(`DroidVM · ${title}`)
      await expect(page.locator('[data-vm]').first().locator('.badge')).toHaveText(running!)
      await expect(page.locator('.overview summary')).not.toContainText('{count}')
      expect(errors).toEqual([])
    })
  })
}

test('respects the ordered browser language list and explicit scripts', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['fr-FR', 'zh-Hant-CN', 'en-US'],
    })
  })
  await page.goto('/dev.html#/vms')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  await expect(page.getByRole('navigation', { name: '主導覽' })).toBeVisible()
})

test('manual selection survives reload and switching back restores browser preference', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dev.html#/more')
  await page.getByRole('combobox', { name: '语言', exact: true }).selectOption('en')
  await expect(page).toHaveTitle('DroidVM · More')
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Language', exact: true })).toHaveValue('en')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'VMs', exact: true })
    .click()
  await expect(page.locator('[data-vm]').first().locator('.badge')).toHaveText('Running')
  await page
    .locator('[data-vm]')
    .first()
    .getByRole('link', { name: 'Details', exact: true })
    .click()
  await expect(page.getByRole('dialog', { name: 'VM details' })).toContainText('4,096 MiB')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'More', exact: true })
    .click()
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-Hant')
  await expect(page.getByRole('combobox', { name: '語言', exact: true })).toHaveValue('zh-Hant')
  await page.getByRole('combobox', { name: '語言', exact: true }).selectOption('auto')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')
  await page.reload()
  await expect(page.getByRole('combobox', { name: '语言', exact: true })).toHaveValue('auto')
})

test('languagechange updates the current error and title without changing its recovery policy', async ({
  page,
}) => {
  await page.goto('/dev.html?scenario=permission-denied#/vms')
  await expect(page.getByRole('heading', { name: '没有访问权限', exact: true })).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['en-US'] })
    window.dispatchEvent(new Event('languagechange'))
  })
  await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
  await expect(page).toHaveTitle('DroidVM · VMs')
  await expect(
    page.getByRole('main').getByRole('button', { name: /retry|check again/i }),
  ).toHaveCount(0)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'More', exact: true })
    .click()
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-Hant')
  await page.evaluate(() => window.dispatchEvent(new Event('languagechange')))
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
})

test('blocked browser storage still allows language changes', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new DOMException('Blocked', 'SecurityError')
      },
    })
  })
  await page.goto('/dev.html#/more')
  await page.getByRole('combobox', { name: '语言', exact: true }).selectOption('en')
  await expect(page).toHaveTitle('DroidVM · More')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('invalid saved language falls back to browser settings', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('droidvm.language', 'invalid'))
  await page.goto('/dev.html#/more')
  await expect(page.getByRole('combobox', { name: '语言', exact: true })).toHaveValue('auto')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')
})

for (const locale of ['en-US', 'zh-TW']) {
  test.describe(`${locale} mobile layout`, () => {
    test.use({ locale })
    for (const width of [320, 375, 390]) {
      test(`fits ${width}px and larger text`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 667 })
        await page.goto('/dev.html#/vms')
        await expect(page.locator('[data-vm]')).toHaveCount(4)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        if (width >= 375) {
          const second = await page.locator('[data-vm]').nth(1).boundingBox()
          const navigation = await page.locator('.rail nav').boundingBox()
          expect(second && navigation && second.y + second.height <= navigation.y).toBeTruthy()
        }
        await page.screenshot({ path: `test-results/q-${locale}-${width}.png`, fullPage: true })
        await page.addStyleTag({ content: 'html { font-size: 24px; }' })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.locator('[data-vm]').first().locator('footer a').last().click()
        expect(
          await page
            .getByRole('dialog')
            .evaluate((element) => element.scrollWidth <= element.clientWidth),
        ).toBe(true)
        await page.keyboard.press('Escape')
        await page.locator('.rail nav a[href="#/more"]').click()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
      })
    }
  })
}

test.describe('English production and shared controls', () => {
  test.use({ locale: 'en-US' })
  test('production fallback and resource labels are translated without exposing previews', async ({
    page,
  }) => {
    await page.goto('http://127.0.0.1:4178/#/vms')
    await expect(
      page.getByRole('heading', { name: 'Management service disconnected' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check session' })).toBeEnabled()
    await expect(page.locator('[data-vm]')).toHaveCount(0)
    await page.goto('http://127.0.0.1:4178/#/resources/usb')
    await expect(page.getByRole('heading', { name: 'Sign in to DroidVM' })).toBeVisible()
    await expect(page.locator('.app-shell')).toHaveCount(0)
    await page.goto('/dev.html#/resources/usb')
    await expect(
      page.getByRole('heading', { name: 'USB devices service unavailable' }),
    ).toBeVisible()
    await page.goto('http://127.0.0.1:4178/#/components')
    await expect(page.getByRole('heading', { name: 'Sign in to DroidVM' })).toBeVisible()
  })
  test('confirmation controls follow browser language', async ({ page }) => {
    await page.goto('/dev.html#/components')
    await page.getByRole('button', { name: 'Open confirmation', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Example confirmation' })
    await expect(dialog.getByRole('button', { name: 'Confirm', exact: true })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).not.toBeVisible()
  })
})
