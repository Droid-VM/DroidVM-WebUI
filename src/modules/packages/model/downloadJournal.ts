import { compileContract } from '../../../shared/api/contract'
import { createOperationJournal } from '../../../shared/model/operationJournal'
import type { DownloadTracking } from '../api/transfer'

export interface DownloadRecord {
  downloadId: string
  exportRequestId: string
  step: 'begin' | 'delete' | null
}
const validId = compileContract<string>('RequestId')
export function validDownloadRecord(value: unknown): value is DownloadRecord {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'downloadId,exportRequestId,step'
  )
    return false
  const record = value as Record<string, unknown>
  return (
    validId(record.downloadId) &&
    validId(record.exportRequestId) &&
    (record.step === null || record.step === 'begin' || record.step === 'delete')
  )
}
export function createDownloadJournal(tracking: DownloadTracking) {
  return createOperationJournal<DownloadRecord>({
    ...tracking,
    valid: validDownloadRecord,
    key: () => 'download',
  })
}
