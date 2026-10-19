const { readdirSync } = require('node:fs')
const modules = readdirSync('src/modules', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
    {
      name: 'shared-is-independent',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(app|pages|modules)/' },
    },
    {
      name: 'modules-never-import-pages',
      severity: 'error',
      from: { path: '^src/modules/' },
      to: { path: '^src/(app|pages)/' },
    },
    {
      name: 'pages-never-import-app',
      severity: 'error',
      from: { path: '^src/pages/' },
      to: { path: '^src/app/' },
    },
    ...modules.map((name) => ({
      name: `public-entry-${name}`,
      severity: 'error',
      from: { pathNot: `^src/modules/${name}/` },
      to: { path: `^src/modules/${name}/(?!index[.]ts$)` },
    })),
    {
      name: 'api-never-imports-ui-state',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/api/' },
      to: { path: '^src/modules/[^/]+/(components|model)/' },
    },
    {
      name: 'model-never-imports-ui',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/model/' },
      to: { path: '^src/modules/[^/]+/components/' },
    },
    {
      name: 'ui-never-bypasses-model',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/components/' },
      to: { path: '^src/(modules/[^/]+/api|shared/api)/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'production-excludes-dev',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '(^|/)(dev|tests)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      extensions: ['.ts', '.vue', '.js', '.json'],
      conditionNames: ['import', 'types', 'default'],
    },
  },
}
