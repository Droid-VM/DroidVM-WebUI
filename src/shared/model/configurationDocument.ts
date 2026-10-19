import { parse, stringify, isLosslessNumber } from 'lossless-json'

export type ConfigObject = Record<string, unknown>
export function object(value: unknown): value is ConfigObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isLosslessNumber(value)
  )
}
export function encodeDocument(value: unknown, pretty = false): string {
  const text = stringify(value, null, pretty ? 2 : undefined)
  if (!text) throw new Error('Invalid configuration')
  return text
}
export function cloneConfiguration<T>(value: T): T {
  return parse(encodeDocument(value)) as T
}
export function fieldText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return isLosslessNumber(value) ? value.value : String(value)
}
export function setPath(row: ConfigObject, path: string[], value: unknown) {
  let current: ConfigObject | unknown[] = row
  for (const key of path.slice(0, -1)) {
    let child = ownValue(current, key)
    if (!object(child) && !Array.isArray(child)) {
      child = {}
      Object.defineProperty(current, key, {
        value: child,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    current = child as ConfigObject | unknown[]
  }
  Object.defineProperty(current, path.at(-1)!, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}
export function getPath(row: ConfigObject, path: string[]): unknown {
  let value: unknown = row
  for (const key of path) value = ownValue(value, key)
  return value
}
function ownValue(value: unknown, key: string): unknown {
  if (Array.isArray(value))
    return /^(0|[1-9][0-9]*)$/.test(key) && Object.hasOwn(value, key)
      ? value[Number(key)]
      : undefined
  return object(value) && Object.hasOwn(value, key) ? value[key] : undefined
}
