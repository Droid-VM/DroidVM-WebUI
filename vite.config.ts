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
    plugins: [
      vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('md-') } } }),
      ...(proxy ? [] : [unavailableApi()]),
    ],
    // Lit's development build logs a console warning that the tests treat as a failure.
    resolve: { conditions: ['module', 'browser', 'production'] },
    base: './',
    server: { host: '127.0.0.1', proxy },
    preview: { host: '127.0.0.1' },
    build: {
      target: 'es2022',
      // One stylesheet (~75 kB) instead of one per lazy page keeps the asset count low.
      cssCodeSplit: false,
      rolldownOptions: {
        output: {
          // Native assets have a per-file limit. Keep shared validation and
          // dependencies independently cached instead of one growing bundle.
          codeSplitting: {
            groups: [
              { name: 'contracts', test: /generated[/\\]validators\.js$/, priority: 20 },
              {
                name: 'material',
                test: /node_modules[/\\](@material[/\\]web|lit|lit-html|lit-element|@lit|tslib)[/\\]/,
                priority: 15,
              },
              { name: 'vendor', test: /node_modules/, priority: 10 },
              // Lazy pages would otherwise split shared UI into many tiny files; the native
              // embed also caps the asset count at 128.
              { name: 'shared', test: /[/\\]src[/\\]shared[/\\]/, priority: 5 },
            ],
          },
        },
      },
    },
  }
})
