import type { DeepReadonly } from 'vue'
import type { DiskAction, DiskOperation, DiskPreparation } from '../api/diskOperations'
import { validDiskOperation } from '../api/diskOperations'
import { compactCpuSet, cpuSet } from '../../../shared/lib/cpuSet'
import type { MessageKey } from '../../../shared/i18n'
import { validUploadName } from '../../../shared/lib/uploadFiles'

export const diskActionKeys: Record<DiskAction, MessageKey> = {
  create: 'diskCreate',
  clone: 'diskClone',
  resize: 'diskResize',
  convert: 'diskConvert',
  flatten: 'diskFlatten',
  commit: 'diskMerge',
  reset: 'diskReset',
  'snapshot-create': 'diskSnapshotCreate',
  'snapshot-apply': 'diskSnapshotApply',
  'snapshot-delete': 'diskSnapshotDelete',
  delete: 'diskDelete',
}
export const snapshotAction = (action: DiskAction) => action.startsWith('snapshot-')
export interface DiskForm {
  folder: string
  createFolder: boolean
  name: string
  size: string
  unit: 'B' | 'MiB' | 'GiB'
  format: string
  compression: 'none' | 'deflate' | 'zstd'
  preallocate: boolean
  shrink: boolean
  deleteFiles: boolean
  relocate: boolean
  inheritSize: boolean
  attach: 'follow' | 'readonly'
  cpus: string
  snapshot: string
}
export function diskForm(
  path = '',
  previous: DeepReadonly<DiskOperation> | null = null,
  defaultCpus?: readonly number[],
): DiskForm {
  const form: DiskForm = {
    folder: path ? path.slice(0, path.lastIndexOf('/')) || '/' : '',
    createFolder: false,
    name: '',
    size: '8',
    unit: 'GiB',
    format: 'qcow2',
    compression: 'none',
    preallocate: false,
    shrink: false,
    deleteFiles: false,
    relocate: false,
    inheritSize: true,
    attach: 'readonly',
    cpus: !previous && defaultCpus ? compactCpuSet(defaultCpus.map((cpu) => [cpu, cpu])) : '',
    snapshot: '',
  }
  if (previous) {
    if ('folder' in previous && previous.folder) {
      form.folder = previous.folder
      form.relocate = true
    }
    if ('name' in previous && previous.name) form.name = previous.name
    if (previous.action === 'clone' && previous.createFolder) form.createFolder = true
    if ('size' in previous && previous.size) {
      form.size = previous.size
      form.unit = 'B'
      form.inheritSize = false
    }
    if ('format' in previous && previous.format) form.format = previous.format
    if ('compress' in previous && previous.compress) form.compression = previous.compress
    if ('preallocate' in previous) form.preallocate = !!previous.preallocate
    if ('shrink' in previous) form.shrink = !!previous.shrink
    if ('deleteFiles' in previous) form.deleteFiles = !!previous.deleteFiles
    if ('attach' in previous && previous.attach) form.attach = previous.attach
    if ('snapshot' in previous && previous.snapshot) form.snapshot = previous.snapshot
    if (previous.cpus) form.cpus = compactCpuSet(previous.cpus.map((cpu) => [cpu, cpu]))
  }
  return form
}
export function diskBytes(value: string, unit: DiskForm['unit']): string | null {
  if (value.length > 64 || !/^\d+(?:\.\d{1,9})?$/.test(value)) return null
  const [integer, fraction = ''] = value.split('.'),
    denominator = 10n ** BigInt(fraction.length)
  const numerator = BigInt(integer! + fraction) * { B: 1n, MiB: 1048576n, GiB: 1073741824n }[unit]
  if (numerator % denominator) return null
  const bytes = numerator / denominator
  return bytes > 0n && bytes <= 9223372036854775807n ? String(bytes) : null
}
export function buildDiskOperation(
  action: DiskAction,
  id: string | null,
  form: DiskForm,
): DiskOperation | null {
  const op: Record<string, unknown> = { action }
  if (action === 'create' && id) {
    op.backingId = id
    op.attach = form.attach
  } else if (action !== 'create') {
    if (!id) return null
    op.diskId = id
  }
  if (action === 'create' || action === 'clone' || (action === 'convert' && form.relocate)) {
    op.folder = form.folder
    op.name = form.name
  }
  if (action === 'clone' && form.createFolder) {
    if (
      !validUploadName(form.name) ||
      new TextEncoder().encode(`${op.folder}/${form.name}`).length > 4096
    )
      return null
    op.createFolder = true
  }
  if (action === 'resize' || (action === 'create' && (!id || !form.inheritSize))) {
    const size = diskBytes(form.size, form.unit)
    if (!size) return null
    op.size = size
  }
  if (action === 'create' || action === 'convert' || action === 'flatten')
    op.format = action === 'create' && id ? 'qcow2' : form.format
  if (['create', 'clone', 'convert', 'flatten'].includes(action)) {
    op.compress = form.compression
    op.preallocate = form.preallocate
  }
  if (action === 'resize') op.shrink = form.shrink
  if (action === 'delete') op.deleteFiles = form.deleteFiles
  if (snapshotAction(action)) op.snapshot = form.snapshot.trim()
  if (form.cpus.trim()) {
    const ranges = cpuSet(form.cpus, 1023)
    if (!ranges) return null
    const cpus = new Set<number>()
    for (const [first, last] of ranges) for (let i = first; i <= last; i++) cpus.add(i)
    op.cpus = [...cpus].sort((a, b) => a - b)
  }
  return validDiskOperation(op) ? op : null
}
export function diskImpact(prepared: DeepReadonly<DiskPreparation>, action: DiskAction) {
  const selected = prepared.detail?.disk
  const ids = new Set<string>(selected ? [selected.id] : [])
  if (action === 'delete') {
    const children = new Map<string, string[]>()
    for (const disk of prepared.catalog.items)
      if (disk.parentId)
        children.set(disk.parentId, [...(children.get(disk.parentId) ?? []), disk.id])
    const queue = [...ids]
    for (let i = 0; i < queue.length; i++)
      for (const child of children.get(queue[i]!) ?? [])
        if (!ids.has(child)) {
          ids.add(child)
          queue.push(child)
        }
  }
  if (action === 'commit' && prepared.parent) {
    ids.add(prepared.parent.disk.id)
    for (const disk of prepared.detail?.children ?? []) ids.add(disk.id)
  }
  return {
    disks: prepared.catalog.items.filter((disk) => ids.has(disk.id)),
    attachments: (action === 'commit' ? prepared.parent : prepared.detail)?.attachments ?? [],
  }
}
