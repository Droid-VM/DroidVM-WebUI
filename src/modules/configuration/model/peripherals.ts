import { isLosslessNumber, parse } from 'lossless-json'
import type { MessageKey } from '../../../shared/i18n'
import {
  cloneConfiguration,
  encodeDocument,
  fieldText,
  getPath,
  object,
  setPath,
  type ConfigObject,
} from './document'
import type { ConfigField } from './fields'
import type { AudioDevice } from '../../resources'
import { soundAttributes, withSoundValue, type SoundAttribute } from './soundPurpose'

export type DeviceKind = 'virtio_sound' | 'xhci_usb' | 'sbsa' | 'virtio_console'
export type SoundMode = 'speaker' | 'microphone'
export interface DeviceSlot {
  collection: 'peripherals' | 'serial_ports'
  index: number
}
export interface EndpointSlot {
  card: number
  index: number
}
export interface PeripheralSection {
  key: string
  label: MessageKey
  identity?: string
  fields: ConfigField[]
  device?: DeviceSlot
  endpoint?: EndpointSlot
  soundCard?: number
  hint?: MessageKey
  raw?: string
}
const token = (value: unknown) => fieldText(value).toLowerCase()
const defaultHost = 'DEFAULT|system default'
export const audioDeviceKey = (value: unknown) =>
  typeof value === 'string' ? value.split('#', 1)[0]! : ''
const paths = ['file', 'unix', 'unix_stream', 'pty']
const maxSerial = { serial: 4, sbsa: 1, virtio_console: 4 }
const maxCounter = 9223372036854775807n
const serialHardware = (port: ConfigObject) => {
  const hardware = token(port.hardware)
  return hardware === 'sbsa' || hardware === 'virtio_console' ? hardware : 'serial'
}
const serialNumber = (port: ConfigObject) => fieldText(port.num) || '1'
export class PeripheralEditError extends Error {
  constructor(readonly key: MessageKey) {
    super(key)
  }
}
const fail = (): never => {
  throw new PeripheralEditError('configPeripheralEditUnavailable')
}
function rows(row: ConfigObject, path: string[]): unknown[] {
  const value = getPath(row, path)
  if (value !== undefined && !Array.isArray(value)) return fail()
  return (value ?? []) as unknown[]
}
function indexValid(index: number, list: unknown[]) {
  if (!Number.isInteger(index) || index < 0 || index >= list.length) fail()
}
function endpoint(mode: SoundMode) {
  return { mode, host_device: defaultHost, host_label: '' }
}
function controllerNext(row: ConfigObject, list: unknown[]): bigint {
  if (
    row.xhci_next !== undefined &&
    !isLosslessNumber(row.xhci_next) &&
    (typeof row.xhci_next !== 'number' || !Number.isSafeInteger(row.xhci_next))
  )
    return fail()
  const text = fieldText(row.xhci_next) || '0'
  if (!/^\d+$/.test(text)) return fail()
  let next = BigInt(text)
  for (const value of list) {
    if (!object(value) || token(value.type) !== 'xhci_usb') continue
    const match = /^xhci-\+?(\d+)$/.exec(fieldText(value.id))
    if (match && BigInt(match[1]!) >= next) next = BigInt(match[1]!) + 1n
  }
  if (next >= maxCounter) return fail()
  return next
}
export function endpointCount(row: ConfigObject, card: number, mode: SoundMode): number {
  const list = getPath(row, ['peripherals', String(card), 'endpoints'])
  if (list !== undefined && !Array.isArray(list)) return 4
  return ((list ?? []) as unknown[]).filter(
    (value) =>
      (object(value) && token(value.mode) === 'microphone' ? 'microphone' : 'speaker') === mode,
  ).length
}
export function canAddDevice(row: ConfigObject, kind: DeviceKind): boolean {
  const list = row[kind === 'sbsa' || kind === 'virtio_console' ? 'serial_ports' : 'peripherals']
  if (list !== undefined && !Array.isArray(list)) return false
  if (kind === 'xhci_usb') {
    try {
      controllerNext(row, (list ?? []) as unknown[])
    } catch {
      return false
    }
  }
  if (kind === 'sbsa' || kind === 'virtio_console') {
    const matching = ((list ?? []) as unknown[]).filter(
      (value) => object(value) && serialHardware(value) === kind,
    )
    if (matching.length >= maxSerial[kind]) return false
    const used = new Set(matching.flatMap((value) => (object(value) ? [serialNumber(value)] : [])))
    return Array.from({ length: maxSerial[kind] }, (_, i) => String(i + 1)).some(
      (num) => !used.has(num),
    )
  }
  return true
}
export function serialFixed(port: unknown): boolean {
  return object(port) && (port.fixed === true || serialHardware(port) === 'serial')
}
export function hasMissingSerials(row: ConfigObject): boolean {
  if (row.serial_ports !== undefined && !Array.isArray(row.serial_ports)) return false
  const ports = (row.serial_ports ?? []) as unknown[]
  return [1, 2, 3, 4].some(
    (num) =>
      !ports.some(
        (port) =>
          object(port) && serialHardware(port) === 'serial' && serialNumber(port) === String(num),
      ),
  )
}
export type DeviceEdit =
  | { type: 'add'; kind: DeviceKind }
  | { type: 'remove'; slot: DeviceSlot }
  | { type: 'serial-defaults' }
  | { type: 'endpoint-add'; card: number; mode: SoundMode }
  | { type: 'endpoint-remove'; slot: EndpointSlot }
  | { type: 'endpoint-default'; slot: EndpointSlot }
  | { type: 'endpoint-bind'; slot: EndpointSlot; device: AudioDevice | null }
  | { type: 'endpoint-purpose'; slot: EndpointSlot; attribute: SoundAttribute; value: string }

export function editDevice(row: ConfigObject, operation: DeviceEdit) {
  const document = cloneConfiguration(row)
  const nested = operation.type.startsWith('endpoint-')
  let path: string[]
  if (
    operation.type === 'endpoint-add' ||
    operation.type === 'endpoint-remove' ||
    operation.type === 'endpoint-default' ||
    operation.type === 'endpoint-bind' ||
    operation.type === 'endpoint-purpose'
  ) {
    const card = operation.type === 'endpoint-add' ? operation.card : operation.slot.card
    const cards = rows(document, ['peripherals'])
    indexValid(card, cards)
    const entry = cards[card]
    if (!object(entry) || token(entry.type) !== 'virtio_sound') return fail()
    path = ['peripherals', String(card), 'endpoints']
  } else {
    path = [
      operation.type === 'remove'
        ? operation.slot.collection
        : operation.type === 'serial-defaults' ||
            operation.kind === 'sbsa' ||
            operation.kind === 'virtio_console'
          ? 'serial_ports'
          : 'peripherals',
    ]
  }
  const list = rows(document, path),
    order = list.map((_, index) => index)
  const append = (value: ConfigObject) => {
    list.push(value)
    order.push(-1)
  }
  if (operation.type === 'remove' || operation.type === 'endpoint-remove') {
    const index = operation.slot.index
    indexValid(index, list)
    if (!nested && path[0] === 'serial_ports' && serialFixed(list[index])) return fail()
    const removed = list[index]
    if (!nested && object(removed) && token(removed.type) === 'xhci_usb')
      document.xhci_next = parse(controllerNext(document, list).toString())
    list.splice(index, 1)
    order.splice(index, 1)
  } else if (operation.type === 'endpoint-purpose') {
    indexValid(operation.slot.index, list)
    const value = list[operation.slot.index]
    if (
      !object(value) ||
      !['speaker', 'microphone'].includes(token(value.mode)) ||
      (value.host_device !== undefined && typeof value.host_device !== 'string') ||
      !soundAttributes(token(value.mode) === 'microphone').includes(operation.attribute)
    )
      return fail()
    try {
      value.host_device = withSoundValue(
        value.host_device ?? '',
        operation.attribute,
        operation.value,
      )
    } catch {
      return fail()
    }
  } else if (operation.type === 'endpoint-default' || operation.type === 'endpoint-bind') {
    indexValid(operation.slot.index, list)
    const value = list[operation.slot.index]
    if (!object(value)) return fail()
    const device = operation.type === 'endpoint-bind' ? operation.device : null
    if (device && device.input !== (token(value.mode) === 'microphone')) return fail()
    const previous = typeof value.host_device === 'string' ? value.host_device : ''
    const marker = previous.indexOf('#')
    value.host_device = (device?.key ?? defaultHost) + (marker < 0 ? '' : previous.slice(marker))
    value.host_label = device?.name ?? ''
  } else if (operation.type === 'endpoint-add') {
    if (
      !['speaker', 'microphone'].includes(operation.mode) ||
      endpointCount(document, operation.card, operation.mode) >= 4
    )
      return fail()
    append(endpoint(operation.mode))
  } else if (operation.type === 'serial-defaults') {
    let consoleChosen = list.some((value) => object(value) && value.console === true)
    for (const num of [1, 2, 3, 4]) {
      if (
        list.some(
          (value) =>
            object(value) &&
            serialHardware(value) === 'serial' &&
            serialNumber(value) === String(num),
        )
      )
        continue
      const port: ConfigObject = {
        hardware: 'serial',
        num,
        backend: num === 1 ? 'app_console' : 'sink',
        fixed: true,
      }
      if (num === 1 && !consoleChosen) {
        port.console = true
        consoleChosen = true
      }
      append(port)
    }
  } else {
    if (!canAddDevice(document, operation.kind)) return fail()
    if (operation.kind === 'virtio_sound')
      append({ type: 'virtio_sound', endpoints: [endpoint('speaker'), endpoint('microphone')] })
    else if (operation.kind === 'xhci_usb') {
      const next = controllerNext(document, list)
      document.xhci_next = parse((next + 1n).toString())
      append({ type: 'xhci_usb', id: `xhci-${next}`, usb2_ports: 8, usb3_ports: 8 })
    } else {
      let num = 1
      while (
        list.some(
          (value) =>
            object(value) &&
            serialHardware(value) === operation.kind &&
            serialNumber(value) === String(num),
        )
      )
        num++
      append({ hardware: operation.kind, num, backend: 'app_console' })
    }
  }
  setPath(document, path, list)
  return { document, prefix: path.join('.') + '.', order }
}

export function peripheralInactive(field: ConfigField, row: ConfigObject): boolean {
  if (field.path[0] === 'serial_ports') {
    const port = getPath(row, field.path.slice(0, 2))
    if (!object(port)) return true
    if (field.path[2] === 'path') return !paths.includes(token(port.backend))
    if (field.path[2] === 'usb_slot') return token(port.backend) !== 'usb_acm'
  }
  if (field.path[0] === 'peripherals' && field.path[2] === 'underrun') {
    const list = getPath(row, [field.path[0], field.path[1]!, 'endpoints'])
    return (
      Array.isArray(list) &&
      !list.some((value) => object(value) && token(value.mode) !== 'microphone')
    )
  }
  return false
}
export function selectSerialConsole(row: ConfigObject, path: string[], value: unknown) {
  if (
    path[0] !== 'serial_ports' ||
    path[2] !== 'console' ||
    value !== true ||
    !Array.isArray(row.serial_ports)
  )
    return
  row.serial_ports.forEach((port, index) => {
    if (object(port) && String(index) !== path[1] && port.console === true) port.console = false
  })
}
export function peripheralIssues(row: ConfigObject): Record<string, MessageKey> {
  const errors: Record<string, MessageKey> = {},
    slots = new Set<string>(),
    hosts = new Set<string>()
  let consoleSeen = false
  if (Array.isArray(row.serial_ports))
    row.serial_ports.forEach((port, index) => {
      if (!object(port)) return
      const backend = token(port.backend),
        at = `serial_ports.${index}.`
      if (paths.includes(backend) && backend !== 'pty' && !fieldText(port.path))
        errors[at + 'path'] = 'configSerialPathRequired'
      if (port.console === true) {
        if (consoleSeen) errors[at + 'console'] = 'configSerialConsoleDuplicate'
        consoleSeen = true
      }
      if (backend === 'usb_acm') {
        const slot = fieldText(port.usb_slot) || '0'
        if (!/^\d+$/.test(slot) || BigInt(slot) > 2147483647n)
          errors[at + 'usb_slot'] = 'configInvalid'
        else if (slots.has(BigInt(slot).toString()))
          errors[at + 'usb_slot'] = 'configSerialSlotDuplicate'
        else slots.add(BigInt(slot).toString())
      }
    })
  if (Array.isArray(row.peripherals))
    row.peripherals.forEach((card, index) => {
      if (!object(card) || token(card.type) !== 'virtio_sound' || !Array.isArray(card.endpoints))
        return
      card.endpoints.forEach((value) => {
        if (
          !object(value) ||
          typeof value.host_device !== 'string' ||
          !value.host_device ||
          audioDeviceKey(value.host_device) === defaultHost
        )
          return
        const key = `${token(value.mode) === 'microphone' ? 'in' : 'out'}|${audioDeviceKey(value.host_device)}`
        // Anchor the issue on the editable card field, shared with the custom
        // endpoint picker, so HTML validity can block save across categories.
        if (hosts.has(key)) errors[`peripherals.${index}.buffer`] = 'configAudioHostDuplicate'
        hosts.add(key)
      })
    })
  return errors
}

export function peripheralValueLabel(
  field: ConfigField,
  row: ConfigObject,
): MessageKey | undefined {
  if (field.path[0] !== 'peripherals') return undefined
  const value = getPath(row, field.path)
  if (field.path.at(-1) === 'host_device' && (!value || value === defaultHost))
    return 'configAudioSystemDefault'
  if (field.path.at(-1) === 'mode') {
    if (token(value) === 'speaker') return 'configAudioSpeaker'
    if (token(value) === 'microphone') return 'configAudioMicrophone'
  }
  return undefined
}

export function peripheralSections(row: ConfigObject): PeripheralSection[] {
  const field = (
    prefix: string[],
    key: string,
    label: MessageKey,
    type: ConfigField['type'] = 'text',
    extra: Partial<ConfigField> = {},
  ): ConfigField => ({ path: [...prefix, key], label, type, ...extra })
  const result: PeripheralSection[] = []
  for (const collection of ['peripherals', 'serial_ports'] as const) {
    const entries = row[collection],
      label: MessageKey = collection === 'peripherals' ? 'configDevices' : 'configSerialPorts'
    if (!Array.isArray(entries)) {
      result.push({
        key: collection,
        label,
        fields: [],
        raw: entries === undefined ? undefined : encodeDocument(entries, true),
      })
      continue
    }
    entries.forEach((value, index) => {
      const prefix = [collection, String(index)],
        device = { collection, index },
        section: PeripheralSection = {
          key: prefix.join('.'),
          label,
          identity: String(index + 1),
          fields: [],
          device,
        }
      result.push(section)
      if (!object(value)) {
        section.raw = encodeDocument(value, true)
        return
      }
      if (collection === 'serial_ports') {
        if (serialFixed(value)) delete section.device
        const backend = token(value.backend)
        section.fields = [
          field(prefix, 'hardware', 'configSerialHardware', 'text', { readonly: true }),
          field(prefix, 'num', 'configSerialNumber', 'number', { readonly: true }),
          field(prefix, 'backend', 'configSerialBackend', 'select', {
            options: [
              'sink',
              'app_console',
              'file',
              'unix',
              'unix_stream',
              'pty',
              'stdout',
              'syslog',
              'usb_acm',
            ],
          }),
          field(prefix, 'path', 'configSerialPath', 'text', {
            required: paths.includes(backend) && backend !== 'pty',
            hint: backend === 'pty' ? 'configSerialPtyHint' : undefined,
          }),
          field(prefix, 'console', 'configSerialConsole', 'boolean'),
          field(prefix, 'usb_slot', 'configUsbSlot', 'number', {
            min: 0,
            max: 2147483647,
            hint: 'configSerialAcmHint',
          }),
        ]
        return
      }
      const type = token(value.type)
      section.fields = [field(prefix, 'type', 'configDeviceType', 'text', { readonly: true })]
      if (type === 'xhci_usb') {
        section.fields.push(
          field(prefix, 'id', 'configControllerId', 'text', { readonly: true }),
          field(prefix, 'usb2_ports', 'configUsb2Ports', 'number', { min: 0, max: 15 }),
          field(prefix, 'usb3_ports', 'configUsb3Ports', 'number', { min: 0, max: 15 }),
        )
        section.hint =
          token(row.backend) === 'crosvm' ? 'configXhciCrosvmHint' : 'configXhciRulesHint'
        return
      }
      if (type !== 'virtio_sound') {
        section.raw = encodeDocument(value, true)
        section.hint = 'configPeripheralUnsupported'
        return
      }
      section.fields.push(
        field(prefix, 'buffer', 'configSoundBuffer', 'select', {
          options: ['low', 'normal', 'safe'],
        }),
        field(prefix, 'underrun', 'configSoundUnderrun', 'select', {
          options: ['silence', 'repeat', 'wsola', 'lpc'],
        }),
      )
      section.soundCard = index
      if (value.endpoints !== undefined && !Array.isArray(value.endpoints)) {
        section.raw = encodeDocument(value.endpoints, true)
        delete section.soundCard
        return
      }
      ;((value.endpoints ?? []) as unknown[]).forEach((item, position) => {
        const at = [...prefix, 'endpoints', String(position)],
          slot = { card: index, index: position }
        const known =
          object(item) &&
          ['speaker', 'microphone'].includes(token(item.mode)) &&
          ['host_device', 'host_label'].every(
            (key) => item[key] === undefined || typeof item[key] === 'string',
          )
        result.push({
          key: at.join('.'),
          label: 'configAudioEndpoint',
          identity: `${index + 1} · ${position + 1}`,
          endpoint: slot,
          fields: known
            ? [field(at, 'mode', 'configAudioDirection', 'text', { readonly: true })]
            : [],
          hint: known
            ? token(item.mode) === 'microphone'
              ? 'configAudioMicrophoneHint'
              : 'configAudioRoutingHint'
            : undefined,
          raw: known ? undefined : encodeDocument(item, true),
        })
      })
    })
  }
  return result
}
