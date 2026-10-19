import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createApiProxy, unavailableApi } from './dev/proxy.ts'

export default defineConfig(({ command, mode, isPreview }) => {
  const target =
    command === 'serve' && !isPreview
      ? loadEnv(mode, process.cwd(), 'DROIDVM_DEV_').DROIDVM_DEV_API_TARGET
      : undefined
  const proxy = createApiProxy(target)
  return {
    plugins: [vue(), ...(proxy ? [] : [unavailableApi()])],
    base: './',
    server: { host: '127.0.0.1', proxy },
    preview: { host: '127.0.0.1' },
    build: {
      target: 'es2022',
      rolldownOptions: {
        output: {
          // Native assets have a per-file limit. Keep shared validation and
          // dependencies independently cached instead of one growing bundle.
          codeSplitting: {
            groups: [
              { name: 'contracts', test: /generated[/\\]validators\.js$/, priority: 20 },
              { name: 'vendor', test: /node_modules/, priority: 10 },
            ],
          },
        },
      },
    },
  }
})
