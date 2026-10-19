import { expect, it } from 'vitest'
import { parse } from 'lossless-json'
import {
  canAddDevice,
  editDevice,
  endpointCount,
  peripheralInactive,
  peripheralIssues,
  peripheralSections,
  selectSerialConsole,
} from '../../src/modules/configuration/model/peripherals'
import {
  encodeDocument,
  getPath,
  type ConfigObject,
} from '../../src/modules/configuration/model/document'
import { remapIndexedInputs } from '../../src/modules/configuration/model/attachments'
import { soundValue, withSoundValue } from '../../src/modules/configuration/model/soundPurpose'

it('edits comma-delimited sound attributes without discarding other purposes or opaque data', () => {
  const key = 'USB_DEVICE|card=1;device=0# usage = future_usage ,content=music,future=a=b,opaque'
  expect(soundValue(key, 'usage')).toBe('future_usage')
  const content = withSoundValue(key, 'content', 'speech')
  expect(content).toBe(
    'USB_DEVICE|card=1;device=0# usage = future_usage ,future=a=b,opaque,content=speech',
  )
  expect(soundValue(content, 'usage')).toBe('future_usage')
  expect(withSoundValue(content, 'usage', '')).toBe(
    'USB_DEVICE|card=1;device=0#future=a=b,opaque,content=speech',
  )
  expect(withSoundValue('device|#usage=game,usage=media', 'usage', '')).toBe('device|')
  expect(withSoundValue('', 'preset', 'voice_communication')).toBe(
    'DEFAULT|system default#preset=voice_communication',
  )
  expect(() => withSoundValue(key, 'preset', 'system_hotword')).toThrow()
})

it('applies purpose edits only to valid endpoint directions through the shared draft operation', () => {
  const original = editDevice({}, { type: 'add', kind: 'virtio_sound' }).document
  const operation = {
    type: 'endpoint-purpose' as const,
    slot: { card: 0, index: 1 },
    attribute: 'preset' as const,
    value: 'voice_recognition',
  }
  const edited = editDevice(original, operation)
  expect(getPath(edited.document, ['peripherals', '0', 'endpoints', '1', 'host_device'])).toBe(
    'DEFAULT|system default#preset=voice_recognition',
  )
  expect(getPath(original, ['peripherals', '0', 'endpoints', '1', 'host_device'])).toBe(
    'DEFAULT|system default',
  )
  expect(edited.order).toEqual([0, 1])
  expect(() => editDevice(original, { ...operation, slot: { card: 0, index: 0 } })).toThrow()
  expect(() => editDevice(original, { ...operation, value: 'system_echo_reference' })).toThrow()
  expect(() => editDevice(original, { ...operation, attribute: 'usage', value: 'game' })).toThrow()
})

it('keeps controller IDs monotonic through removal, large counters and unknown rows', () => {
  const row: ConfigObject = {
    xhci_next: parse('9007199254740993'),
    peripherals: [
      { type: 'xhci_usb', id: 'xhci-0', usb2_ports: 8, opaque: parse('18446744073709551615') },
      { type: 'future', opaque: parse('18446744073709551615') },
    ],
  }
  const before = encodeDocument(row)
  const first = editDevice(row, { type: 'add', kind: 'xhci_usb' }).document
  expect(getPath(first, ['peripherals', '2', 'id'])).toBe('xhci-9007199254740993')
  const removed = editDevice(first, {
    type: 'remove',
    slot: { collection: 'peripherals', index: 2 },
  }).document
  const second = editDevice(removed, { type: 'add', kind: 'xhci_usb' }).document
  expect(getPath(second, ['peripherals', '2', 'id'])).toBe('xhci-9007199254740994')
  expect(encodeDocument(second)).toContain('18446744073709551615')
  expect(encodeDocument(row)).toBe(before)
  expect(canAddDevice({ xhci_next: parse('9223372036854775807') }, 'xhci_usb')).toBe(false)
  expect(() =>
    editDevice({ peripherals: { future: true } }, { type: 'add', kind: 'virtio_sound' }),
  ).toThrow()
  expect(peripheralSections(row).find((section) => section.key === 'peripherals.1')?.raw).toContain(
    '18446744073709551615',
  )
})

it('adds fixed and optional serial hardware, selects a single console and validates only applicable backends', () => {
  const legacy = editDevice(
    { serial_ports: [{ backend: 'sink' }] },
    { type: 'serial-defaults' },
  ).document
  expect((legacy.serial_ports as unknown[]).length).toBe(4)
  expect(canAddDevice({ serial_ports: [{ hardware: 'sbsa', num: 0 }] }, 'sbsa')).toBe(false)
  let row = editDevice({}, { type: 'serial-defaults' }).document
  expect((row.serial_ports as unknown[]).length).toBe(4)
  expect(() =>
    editDevice(row, { type: 'remove', slot: { collection: 'serial_ports', index: 0 } }),
  ).toThrow()
  row = editDevice(row, { type: 'add', kind: 'sbsa' }).document
  expect(canAddDevice(row, 'sbsa')).toBe(false)
  const port = getPath(row, ['serial_ports', '4']) as ConfigObject
  port.console = true
  selectSerialConsole(row, ['serial_ports', '4', 'console'], true)
  expect(getPath(row, ['serial_ports', '0', 'console'])).toBe(false)
  port.backend = 'file'
  expect(peripheralIssues(row)['serial_ports.4.path']).toBe('configSerialPathRequired')
  port.backend = 'pty'
  expect(peripheralIssues(row)).toEqual({})
  port.backend = 'usb_acm'
  port.usb_slot = 0
  row = editDevice(row, { type: 'add', kind: 'virtio_console' }).document
  const other = getPath(row, ['serial_ports', '5']) as ConfigObject
  other.backend = 'usb_acm'
  expect(peripheralIssues(row)['serial_ports.5.usb_slot']).toBe('configSerialSlotDuplicate')
  expect(
    peripheralInactive(
      { path: ['serial_ports', '4', 'path'], label: 'configSerialPath', type: 'text' },
      row,
    ),
  ).toBe(true)
  const removed = editDevice(row, {
    type: 'remove',
    slot: { collection: 'serial_ports', index: 4 },
  })
  expect(
    remapIndexedInputs(
      { 'serial_ports.5.usb_slot': 'bad', name: 'unchanged' },
      removed.prefix,
      removed.order,
    ),
  ).toEqual({ 'serial_ports.4.usb_slot': 'bad', name: 'unchanged' })
  row = editDevice(removed.document, { type: 'add', kind: 'sbsa' }).document
  expect(getPath(row, ['serial_ports', '5', 'num'])).toBe(1)
})

it('bounds endpoints per direction, preserves unknown data and checks host duplication across cards', () => {
  let row = editDevice({}, { type: 'add', kind: 'virtio_sound' }).document
  for (let i = 0; i < 3; i++)
    row = editDevice(row, { type: 'endpoint-add', card: 0, mode: 'speaker' }).document
  expect(endpointCount(row, 0, 'speaker')).toBe(4)
  expect(() => editDevice(row, { type: 'endpoint-add', card: 0, mode: 'speaker' })).toThrow()
  row = editDevice(row, { type: 'add', kind: 'virtio_sound' }).document
  const first = getPath(row, ['peripherals', '0', 'endpoints', '0']) as ConfigObject
  const second = getPath(row, ['peripherals', '1', 'endpoints', '0']) as ConfigObject
  first.host_device = 'speaker|1#usage=media'
  second.host_device = 'speaker|1#usage=game&future=keep'
  second.extra = parse('18446744073709551615')
  expect(peripheralIssues(row)['peripherals.1.buffer']).toBe('configAudioHostDuplicate')
  row = editDevice(row, { type: 'endpoint-default', slot: { card: 1, index: 0 } }).document
  expect(getPath(row, ['peripherals', '1', 'endpoints', '0', 'host_device'])).toBe(
    'DEFAULT|system default#usage=game&future=keep',
  )
  row = editDevice(row, {
    type: 'endpoint-bind',
    slot: { card: 1, index: 0 },
    device: { id: 'out:usb|1', key: 'usb|1', name: 'USB', input: false, kind: 3 },
  }).document
  expect(getPath(row, ['peripherals', '1', 'endpoints', '0', 'host_device'])).toBe(
    'usb|1#usage=game&future=keep',
  )
  expect(() =>
    editDevice(row, {
      type: 'endpoint-bind',
      slot: { card: 1, index: 0 },
      device: { id: 'in:mic|1', key: 'mic|1', name: 'Mic', input: true, kind: 6 },
    }),
  ).toThrow()
  expect(peripheralIssues(row)).toEqual({})
  expect(encodeDocument(row)).toContain('18446744073709551615')
  ;(getPath(row, ['peripherals', '1', 'endpoints']) as unknown[]).push('future')
  const removed = editDevice(row, { type: 'endpoint-remove', slot: { card: 1, index: 0 } })
  expect(getPath(removed.document, ['peripherals', '1', 'endpoints', '1'])).toBe('future')
  expect(peripheralSections(removed.document).some((section) => section.raw === '"future"')).toBe(
    true,
  )
})
