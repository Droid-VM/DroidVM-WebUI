import { parse } from 'lossless-json'
import { object, type ConfigObject } from '../../../shared/model/configurationDocument'
export * from '../../../shared/model/configurationDocument'

// No numeric coercion or JSON.parse/stringify round trip: extensions may contain
// uint64 counters or arbitrary decimal values outside JavaScript precision.
export function parseDocument(json: string): ConfigObject & { vms: ConfigObject[] } {
  const document = parse(json)
  if (!object(document) || !Array.isArray(document.vms)) throw new Error('Invalid VM document')
  const ids = new Set<string>()
  for (const row of document.vms) {
    if (
      !object(row) ||
      typeof row.id !== 'string' ||
      !row.id ||
      ids.has(row.id) ||
      typeof row.name !== 'string'
    )
      throw new Error('Invalid VM configuration')
    ids.add(row.id)
  }
  return document as ConfigObject & { vms: ConfigObject[] }
}
export function parseConfiguration(json: string): ConfigObject {
  const row = parse(json)
  if (!object(row) || typeof row.id !== 'string' || !row.id || typeof row.name !== 'string')
    throw new Error('Invalid VM configuration')
  return row
}
