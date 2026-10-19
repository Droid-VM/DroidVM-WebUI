import { defineConfig } from '@playwright/test'

// Screenshot capture for the Material 3 migration. Not part of `test:e2e`; it reuses the
// e2e port because the HTTP fixture only trusts that origin, so do not run both at once.
export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: true,
  workers: 4,
  use: {
    baseURL: 'http://127.0.0.1:5178',
    channel: 'msedge',
    locale: 'zh-CN',
    reducedMotion: 'reduce',
  },
  webServer: [
    {
      command: 'node scripts/http-fixture.mjs',
      url: 'http://127.0.0.1:5189/__fixture/ready',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --port 5178 --strictPort',
      url: 'http://127.0.0.1:5178',
      reuseExistingServer: false,
      env: { DROIDVM_DEV_API_TARGET: 'http://127.0.0.1:5189' },
    },
  ],
})
