import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default ts.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/generated/**',
      'playwright-report/**',
      'test-results/**',
      'visual-results/**',
      '*.cjs',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  prettier,
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: ts.parser } },
    rules: {
      'no-undef': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      // Material web components take named slots through the native `slot` attribute.
      'vue/no-deprecated-slot-attribute': ['error', { ignoreParents: ['/^md-/'] }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
  {
    files: [
      'src/pages/**/*.{ts,vue}',
      'src/modules/**/components/**/*.{ts,vue}',
      'src/shared/ui/**/*.{ts,vue}',
    ],
    rules: {
      'no-restricted-globals': ['error', 'fetch', 'WebSocket', 'XMLHttpRequest'],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis'].flatMap((object) =>
          ['fetch', 'WebSocket', 'XMLHttpRequest'].map((property) => ({
            object,
            property,
            message: '通过模块数据适配器调用网络。',
          })),
        ),
      ],
    },
  },
)
