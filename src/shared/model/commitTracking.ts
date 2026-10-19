import type { OperationTracking } from './operationJournal'

// Commit uploads and previews are short-lived authority, not recovery data.
// Keep only the request identity and explicitly selected non-secret labels.
export function createCommitTracking<R extends { requestId: string }>(
  namespace: string,
  key: string,
  fields: readonly (keyof R)[] = [],
  cleared: readonly (keyof R)[] = [],
): OperationTracking<R> {
  const kept = ['requestId', ...fields] as (keyof R)[]
  const names = [...kept, ...cleared].map(String).sort().join(',')
  return {
    namespace,
    durable: true,
    key: () => key,
    snapshot(request) {
      return Object.fromEntries([
        ...kept.map((field) => [field, request[field]]),
        ...cleared.map((field) => [field, '']),
      ]) as R
    },
    valid(value): value is R {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false
      const row = value as Record<string, unknown>
      return (
        Object.keys(row).sort().join(',') === names &&
        kept.every(
          (field) =>
            typeof row[String(field)] === 'string' &&
            /^[A-Za-z0-9_-]{1,128}$/.test(row[String(field)] as string),
        ) &&
        cleared.every((field) => row[String(field)] === '')
      )
    },
  }
}
