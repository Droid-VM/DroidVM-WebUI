import { test } from '@playwright/test'

// Output goes to visual-results/<VISUAL_LABEL>/ (Playwright wipes test-results on each run).
const label = process.env.VISUAL_LABEL || 'current'
const viewports = [
  { name: 'compact', width: 390, height: 844 },
  { name: 'medium', width: 768, height: 1024 },
  { name: 'expanded', width: 1280, height: 800 },
  { name: 'large', width: 1680, height: 945 },
]
const routes = [
  'components',
  'home',
  'vms',
  'vms/demo-debian',
  'vms/new',
  'resources',
  'resources/network',
  'resources/disk',
  'resources/usb',
  'tasks',
  'more',
  'host',
  'settings/service',
  'hugepages',
]

for (const viewport of viewports) {
  for (const theme of ['light', 'dark']) {
    test(`${viewport.name} ${theme} login`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('droidvm.theme', value), theme)
      await page.setViewportSize(viewport)
      await page.goto('/')
      await page.locator('#pairing-token').waitFor()
      await page.screenshot({ path: `visual-results/${label}/${viewport.name}-${theme}-login.png` })
    })
    test(`${viewport.name} ${theme}`, async ({ page }) => {
      await page
        .context()
        .addCookies([{ name: 'fixture_case', value: 'ready', url: 'http://127.0.0.1:5178' }])
      await page.addInitScript((value) => localStorage.setItem('droidvm.theme', value), theme)
      await page.setViewportSize(viewport)
      for (const route of routes) {
        await page.goto(`/dev.html#/${route}`)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(300)
        await page.screenshot({
          path: `visual-results/${label}/${viewport.name}-${theme}-${route.replaceAll('/', '_')}.png`,
          fullPage: true,
        })
      }
    })
  }
}
