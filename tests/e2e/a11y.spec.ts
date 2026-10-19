import { expect, test } from '@playwright/test'

// Interactive roles that must always carry an accessible name.
const named =
  /^\s*- (button|link|checkbox|switch|combobox|textbox|searchbox|spinbutton|radio|tab)\s*(\[|:|$)/

for (const width of [390, 1280]) {
  for (const route of ['vms', 'vms/demo-debian', 'resources', 'tasks', 'more', 'components']) {
    test(`every control on #/${route} at ${width}px has an accessible name`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto(`/dev.html#/${route}`)
      await expect(page.locator('main')).toBeVisible()
      await page.waitForLoadState('networkidle')
      const snapshot = await page.locator('body').ariaSnapshot()
      const unnamed = snapshot.split('\n').filter((line) => named.test(line))
      expect(unnamed).toEqual([])
    })
  }
}
