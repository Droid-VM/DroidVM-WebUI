import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:5178',
    channel: 'msedge',
    locale: 'zh-CN',
    trace: 'retain-on-failure',
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
    {
      command: 'npm run preview -- --port 4178 --strictPort',
      url: 'http://127.0.0.1:4178',
      reuseExistingServer: false,
    },
  ],
})
