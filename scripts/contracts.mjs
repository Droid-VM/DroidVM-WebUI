import { mkdir, readFile, writeFile } from 'node:fs/promises'
import openapiTS, { astToString } from 'openapi-typescript'
import Ajv2020 from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'

const input = new URL('../../contracts/webui/openapi.json', import.meta.url)
const banner = '// Generated from contracts/webui/openapi.json. Do not edit.\n'
const types =
  '// Generated from contracts/webui/openapi.json. Do not edit.\n' +
  astToString(await openapiTS(input))
const contract = JSON.parse(await readFile(input, 'utf8'))
const validator = new Ajv2020({
  strict: false,
  // Callers use the accept/reject result and never render AJV's error list.
  // Stop at the first error without changing the accepted schema language.
  allErrors: false,
  // Only the validation boolean is consumed; localized UI errors come from
  // the API boundary, so do not ship unused English AJV error messages.
  messages: false,
  // Task results are shared by several responses. Reuse validators instead of
  // expanding the same nested schema into every endpoint's production code.
  inlineRefs: false,
  code: { source: true, esm: true, lines: true },
})
validator.addSchema({ $id: 'webui', components: contract.components })
const schemas = Object.keys(contract.components.schemas)
let validators = standaloneCode(
  validator,
  Object.fromEntries(schemas.map((name) => [name, `webui#/components/schemas/${name}`])),
)
// AJV emits this tiny runtime helper as CommonJS even with esm:true. Import the
// same upstream implementation statically so the browser needs neither require nor eval.
const helper = 'require("ajv/dist/runtime/ucs2length").default'
if (validators.includes(helper)) {
  validators =
    "import ucs2lengthModule from 'ajv/dist/runtime/ucs2length.js'\n" +
    "const ucs2length = typeof ucs2lengthModule === 'function' ? ucs2lengthModule : ucs2lengthModule.default\n" +
    validators.replaceAll(helper, 'ucs2length')
}
if (/\brequire\s*\(/.test(validators)) throw new Error('新增 AJV 运行时辅助函数需要显式 ESM 导入')
const declarations =
  "import type { ValidateFunction } from 'ajv'\nimport type { components } from './api'\n" +
  schemas
    .map((name) => `export const ${name}: ValidateFunction<components['schemas']['${name}']>\n`)
    .join('')
for (const [name, result] of Object.entries({
  'api.ts': types,
  'validators.js': banner + validators,
  'validators.d.ts': banner + declarations,
})) {
  const output = new URL(`../src/generated/${name}`, import.meta.url)
  if (process.argv.includes('--check')) {
    if ((await readFile(output, 'utf8')) !== result)
      throw new Error('接口类型或校验代码已过期，请运行 npm run contract:generate')
  } else {
    await mkdir(new URL('../src/generated/', import.meta.url), { recursive: true })
    await writeFile(output, result)
  }
}
