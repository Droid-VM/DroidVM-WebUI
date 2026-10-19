import {
  cloneConfiguration,
  fieldText,
  getPath,
  object,
  setPath,
  type ConfigObject,
} from './document'

export type AttachmentKind = 'disks' | 'networks' | 'shared_dirs'
export interface AttachmentSlot {
  collection: AttachmentKind
  index: number
}
export const imageDiskPath = ['boot', 'linux', 'image', 'disk']

export function diskChoices(vm: ConfigObject) {
  const disks = vm.disks
  if (!Array.isArray(disks)) return []
  return disks.flatMap((row, index) =>
    object(row) && typeof row.path === 'string' && row.path ? [{ index, path: row.path }] : [],
  )
}
// BootConfig.imagePath / native BootPlan: prefer the selected slot, otherwise
// the first nonempty path. Duplicate paths still identify distinct slots.
export function bootDiskIndex(vm: ConfigObject): number | null {
  const text = fieldText(getPath(vm, imageDiskPath)) || '0'
  const choices = diskChoices(vm)
  return choices.find((row) => String(row.index) === text)?.index ?? choices[0]?.index ?? null
}
export function clearBootEntry(vm: ConfigObject) {
  const image = getPath(vm, ['boot', 'linux', 'image'])
  if (object(image)) delete image.entry
}
export function selectBootDisk(vm: ConfigObject, index: number) {
  if (!diskChoices(vm).some((row) => row.index === index)) throw new Error('Invalid boot disk')
  const result = cloneConfiguration(vm)
  if (bootDiskIndex(vm) !== index) clearBootEntry(result)
  setPath(result, imageDiskPath, index)
  return result
}

export type AttachmentEdit =
  | { type: 'remove' }
  | { type: 'move'; to: number }
  | { type: 'replace'; fields: ConfigObject }
export function editAttachment(vm: ConfigObject, slot: AttachmentSlot, operation: AttachmentEdit) {
  const current = vm[slot.collection]
  if (
    !Array.isArray(current) ||
    !Number.isInteger(slot.index) ||
    slot.index < 0 ||
    slot.index >= current.length
  )
    throw new Error('Invalid attachment slot')
  const result = cloneConfiguration(vm)
  const rows = result[slot.collection] as unknown[]
  // Stable old-index mapping also moves unsaved, invalid field text in the UI.
  const order = rows.map((_, index) => index)
  const tracksBoot =
    object(getPath(vm, ['boot', 'linux', 'image'])) ||
    fieldText(getPath(vm, ['boot', 'linux', 'source'])).toLowerCase() === 'image'
  const selected = slot.collection === 'disks' && tracksBoot ? bootDiskIndex(vm) : null
  let bootChanged = false
  if (operation.type === 'move') {
    if (
      slot.collection !== 'disks' ||
      !Number.isInteger(operation.to) ||
      operation.to < 0 ||
      operation.to >= rows.length
    )
      throw new Error('Invalid disk move')
    rows.splice(operation.to, 0, rows.splice(slot.index, 1)[0])
    order.splice(operation.to, 0, order.splice(slot.index, 1)[0]!)
  } else if (operation.type === 'remove') {
    rows.splice(slot.index, 1)
    order.splice(slot.index, 1)
    bootChanged = selected === slot.index
  } else {
    const row = rows[slot.index]
    if (!object(row)) throw new Error('Invalid attachment')
    for (const [key, value] of Object.entries(operation.fields)) setPath(row, [key], value)
    bootChanged =
      selected === slot.index && getPath(vm, ['disks', String(slot.index), 'path']) !== row.path
  }
  if (slot.collection === 'disks' && selected !== null) {
    const mapped = order.indexOf(selected)
    // Removing the selected disk follows native fallback to the first usable
    // disk. The UI explicitly announces this and rejects image boot with none.
    const next = mapped < 0 ? (diskChoices(result)[0]?.index ?? 0) : mapped
    if (next !== selected || bootChanged) setPath(result, imageDiskPath, next)
    if (bootChanged) clearBootEntry(result)
  }
  return { document: result, order, bootChanged }
}

export function remapAttachmentInputs(
  inputs: Record<string, string>,
  kind: AttachmentKind,
  order: number[],
) {
  return remapIndexedInputs(inputs, `${kind}.`, order)
}

export function remapIndexedInputs(
  inputs: Record<string, string>,
  prefix: string,
  order: number[],
) {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(inputs)) {
    if (!key.startsWith(prefix)) {
      result[key] = value
      continue
    }
    const suffix = key.slice(prefix.length),
      split = suffix.indexOf('.')
    const index = order.indexOf(Number(suffix.slice(0, split)))
    if (index >= 0) result[`${prefix}${index}${suffix.slice(split)}`] = value
  }
  return result
}
