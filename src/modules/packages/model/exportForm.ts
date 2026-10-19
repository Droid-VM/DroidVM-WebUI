import type { DeepReadonly } from 'vue'
import type { PackageExportOperation, PackageExportPlan } from '../api/export'
import { validHostPath } from './hostPath'

export interface ExportDraft {
  destination: string
  compression: PackageExportOperation['compression']
  volumeBytes: string
  disks: number[]
}
export const exportDraft = (): ExportDraft => ({
  destination: '',
  compression: 'NONE',
  volumeBytes: '0',
  disks: [],
})
export function exportVolume(value: string): string | null {
  if (!/^(0|[1-9][0-9]{0,18})$/.test(value)) return null
  const bytes = BigInt(value)
  return bytes === 0n || (bytes >= 16777216n && bytes <= 9223372036854775807n) ? value : null
}
export function exportOperation(
  draft: ExportDraft,
  plan: DeepReadonly<PackageExportPlan>,
): PackageExportOperation | null {
  const volumeBytes = exportVolume(draft.volumeBytes)
  if (
    volumeBytes === null ||
    !validHostPath(draft.destination) ||
    !plan.compressions.includes(draft.compression) ||
    new Set(draft.disks).size !== draft.disks.length ||
    draft.disks.some(
      (index) => !Number.isInteger(index) || !plan.disks.some((disk) => disk.index === index),
    )
  )
    return null
  return {
    destination: draft.destination,
    compression: draft.compression,
    volumeBytes,
    disks: [...draft.disks].sort((a, b) => a - b),
    overwriteConfirmed: true,
  }
}
