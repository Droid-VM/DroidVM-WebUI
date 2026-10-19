export interface OperationTracking<R> {
  namespace: string
  valid(request: unknown): request is R
  key(request: R): string
  /** Store only a non-secret lookup reference when the submitted request carries leases. */
  snapshot?(request: R): R
  durable?: boolean
  storage?: Storage
  byteLimit?: number
}
export type RecoveryProblem = 'invalid' | 'unavailable'
export interface TrackedOperation<R> {
  key: string
  request: R
}
export const OPERATION_RECORD_LIMIT = 64
export const OPERATION_BYTE_LIMIT = 256 * 1024

export class JournalError extends Error {
  constructor(readonly problem: RecoveryProblem) {
    super(problem)
  }
}
function safe(value: unknown, depth = 0): boolean {
  if (depth > 32) return false
  if (!value || typeof value !== 'object') return true
  return Object.entries(value).every(
    ([key, child]) =>
      !['__proto__', 'constructor', 'prototype'].includes(key) && safe(child, depth + 1),
  )
}
function bounded(text: string, limit: number) {
  if (text.length > limit || new TextEncoder().encode(text).length > limit)
    throw new JournalError('invalid')
}
export function createOperationJournal<R>(tracking: OperationTracking<R>) {
  const byteLimit = tracking.byteLimit ?? OPERATION_BYTE_LIMIT
  if (!Number.isSafeInteger(byteLimit) || byteLimit <= 0 || byteLimit > 1024 * 1024)
    throw new Error('Invalid operation byte limit')
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(tracking.namespace))
    throw new Error('Invalid operation namespace')
  const name = `droidvm.operations.v1:${tracking.namespace}`
  let expectedRaw: string | null | undefined
  function storage() {
    try {
      return (
        tracking.storage ?? (tracking.durable ? globalThis.localStorage : globalThis.sessionStorage)
      )
    } catch {
      throw new JournalError('unavailable')
    }
  }
  function readRaw() {
    try {
      return storage().getItem(name)
    } catch {
      throw new JournalError('unavailable')
    }
  }
  function records(value: unknown): TrackedOperation<R>[] {
    if (!Array.isArray(value) || value.length > OPERATION_RECORD_LIMIT)
      throw new JournalError('invalid')
    const keys = new Set<string>()
    for (const row of value) {
      if (
        !row ||
        typeof row !== 'object' ||
        Object.keys(row).sort().join(',') !== 'key,request' ||
        typeof row.key !== 'string' ||
        !row.key ||
        row.key.length > 256 ||
        ['__proto__', 'constructor', 'prototype'].includes(row.key) ||
        keys.has(row.key) ||
        !safe(row.request) ||
        !tracking.valid(row.request) ||
        tracking.key(row.request) !== row.key
      )
        throw new JournalError('invalid')
      keys.add(row.key)
    }
    return value as TrackedOperation<R>[]
  }
  function decode(raw: string) {
    try {
      bounded(raw, byteLimit)
      const value: unknown = JSON.parse(raw)
      if (
        !value ||
        typeof value !== 'object' ||
        Object.keys(value).sort().join(',') !== 'identity,records,version'
      )
        throw new JournalError('invalid')
      const envelope = value as { version: unknown; identity: unknown; records: unknown }
      if (
        envelope.version !== 1 ||
        typeof envelope.identity !== 'string' ||
        !envelope.identity ||
        envelope.identity.length > 512
      )
        throw new JournalError('invalid')
      return { identity: envelope.identity, records: records(envelope.records) }
    } catch (error) {
      if (error instanceof JournalError) throw error
      throw new JournalError('invalid')
    }
  }
  return {
    load(identity: string) {
      const raw = readRaw()
      expectedRaw = raw
      if (raw === null) return []
      const value = decode(raw)
      return value.identity === identity ? value.records : []
    },
    save(identity: string, value: TrackedOperation<R>[], replace = false) {
      let encoded: string
      try {
        encoded = JSON.stringify({
          version: 1,
          identity,
          records: value.map((row) => ({
            key: row.key,
            request: tracking.snapshot ? tracking.snapshot(row.request) : row.request,
          })),
        })
        // Validate the serialized snapshot as well as caller input, then keep it immutable.
        decode(encoded)
      } catch (error) {
        if (error instanceof JournalError) throw error
        throw new JournalError('invalid')
      }
      if (!replace && readRaw() !== expectedRaw) throw new JournalError('invalid')
      try {
        storage().setItem(name, encoded)
        if (readRaw() !== encoded) throw new Error('Operation journal was not retained')
        expectedRaw = encoded
      } catch {
        throw new JournalError('unavailable')
      }
    },
    clear(identity: string | null, force = false) {
      const raw = readRaw()
      if (!force && raw !== null && decode(raw).identity !== identity) return
      try {
        storage().removeItem(name)
        expectedRaw = null
      } catch {
        throw new JournalError('unavailable')
      }
    },
    snapshot(request: R): R {
      try {
        const encoded = JSON.stringify(request)
        bounded(encoded, byteLimit)
        const value: unknown = JSON.parse(encoded)
        const projected = tracking.snapshot ? tracking.snapshot(value as R) : value
        if (!safe(value) || !tracking.valid(projected)) throw new JournalError('invalid')
        return value as R
      } catch (error) {
        if (error instanceof JournalError) throw error
        throw new JournalError('invalid')
      }
    },
  }
}
