import type { ValidateFunction } from 'ajv'
import * as validators from '../../generated/validators.js'
import type { components } from '../../generated/api'

export function compileContract<T>(name: keyof components['schemas']) {
  // Compilation runs in scripts/contracts.mjs; only plain validators reach the browser.
  return validators[name] as ValidateFunction<T>
}
