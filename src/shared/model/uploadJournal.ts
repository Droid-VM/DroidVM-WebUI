import { validUploadName, type UploadFile } from '../lib/uploadFiles'
import { createOperationJournal, type OperationTracking } from './operationJournal'

export type UploadStep =
  | { kind: 'begin' | 'finish' | 'delete' }
  | { kind: 'chunk'; index: number; oldOffset: string; end: string; offsets: string[] }
export interface UploadRecord {
  uploadId: string
  files: (UploadFile & { sha256: string })[]
  offsets: string[]
  step: UploadStep | null
}
export type UploadTracking = Pick<OperationTracking<UploadRecord>, 'namespace' | 'storage'>
const exact = (value: unknown, keys: string): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === keys
const bytes = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^(0|[1-9][0-9]{0,15})$/.test(value) &&
  BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)

export function validUploadRecord(value: unknown): value is UploadRecord {
  if (
    !exact(value, 'files,offsets,step,uploadId') ||
    typeof value.uploadId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.uploadId) ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.offsets)
  )
    return false
  const files = value.files,
    offsets = value.offsets
  if (
    !files.length ||
    files.length > 1000 ||
    !files.every(
      (file) =>
        exact(file, 'name,sha256,sizeBytes') &&
        typeof file.name === 'string' &&
        validUploadName(file.name) &&
        bytes(file.sizeBytes) &&
        typeof file.sha256 === 'string' &&
        /^[0-9a-f]{64}$/.test(file.sha256),
    ) ||
    new Set(files.map((file) => file.name)).size !== files.length ||
    offsets.length !== files.length ||
    !offsets.every(
      (offset, index) => bytes(offset) && BigInt(offset) <= BigInt(files[index].sizeBytes),
    )
  )
    return false
  const record = value as unknown as UploadRecord
  const step: unknown = record.step
  if (step === null) return true
  if (exact(step, 'kind')) {
    if (step.kind === 'delete') return true
    if (step.kind === 'begin') return record.offsets.every((offset) => offset === '0')
    return (
      step.kind === 'finish' &&
      record.offsets.every((offset, i) => offset === record.files[i]!.sizeBytes)
    )
  }
  if (
    !exact(step, 'end,index,kind,offsets,oldOffset') ||
    step.kind !== 'chunk' ||
    typeof step.index !== 'number' ||
    !Number.isInteger(step.index) ||
    step.index < 0 ||
    step.index >= record.files.length ||
    !bytes(step.oldOffset) ||
    !bytes(step.end) ||
    !Array.isArray(step.offsets) ||
    step.offsets.length !== record.offsets.length ||
    !step.offsets.every((offset, i) => offset === record.offsets[i])
  )
    return false
  return (
    step.oldOffset === record.offsets[step.index] &&
    BigInt(step.end) > BigInt(step.oldOffset) &&
    BigInt(step.end) <= BigInt(record.files[step.index]!.sizeBytes)
  )
}

export function createUploadJournal(tracking: UploadTracking) {
  // A full 1000-volume selection can include 255-byte names requiring JSON
  // escaping. Keep the original file-count/name limits without an unbounded log.
  return createOperationJournal<UploadRecord>({
    ...tracking,
    byteLimit: 1024 * 1024,
    valid: validUploadRecord,
    key: () => 'upload',
  })
}
