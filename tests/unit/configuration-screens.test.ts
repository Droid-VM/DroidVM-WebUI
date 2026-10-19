import { expect, it } from 'vitest'
import { parse } from 'lossless-json'
import {
  screenFields,
  screenInactive,
  screenIssues,
  vncHostValid,
} from '../../src/modules/configuration/model/screens'
import { encodeDocument, type ConfigObject } from '../../src/modules/configuration/model/document'

it('accepts App numeric VNC addresses and rejects names, URL syntax, zones and malformed IPv6', () => {
  for (const host of [
    '',
    '127.0.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '::',
    '::1',
    '2001:db8::2',
    '::ffff:192.0.2.1',
    '1:2:3:4:5:6:7:8',
  ])
    expect(vncHostValid(host), host).toBe(true)
  for (const host of [
    'localhost',
    'http://127.0.0.1',
    '127.0.0.1:5900',
    '256.0.0.1',
    '1.2.3',
    '1.2.3.4 ',
    '[::1]',
    'fe80::1%wlan0',
    '1:2:3',
    '1:2:3:4:5:6:7::8',
    '1:::2',
    '192.0.2.1::',
    '::ffff:256.0.0.1',
    '1:2:3:4:5:192.0.2.1',
  ])
    expect(vncHostValid(host), host).toBe(false)
})

it('validates active bindings, preserves unknown and inactive values, and leaves automatic ports unclaimed', () => {
  const row = parse(
    '{"backend":"qemu","screens":{"gpu-0":{"enabled":true,"exporter":"native","vnc":{"port":5900}},"simplefb":{"enabled":true,"exporter":"vnc","vnc":{"port":5900}},"future":{"counter":18446744073709551615}}}',
  ) as ConfigObject
  const before = encodeDocument(row)
  expect(screenIssues(row)).toEqual({ 'screens.gpu-0.exporter': 'configNativeCrosvmOnly' })
  const screens = row.screens as Record<string, ConfigObject>
  screens['gpu-0']!.exporter = 'vnc'
  expect(screenIssues(row)).toEqual({ 'screens.simplefb.vnc.port': 'configVncPortConflict' })
  screens['gpu-0']!.enabled = false
  expect(screenIssues(row)).toEqual({})
  const port = screenFields('gpu-0', row).find((field) => field.path.at(-1) === 'port')!
  expect(screenInactive(port, row)).toBe(true)
  screens['gpu-0']!.enabled = true
  screens['gpu-0']!.vnc = { port: -1 }
  screens.simplefb!.vnc = { port: -1 }
  expect(screenIssues(row)).toEqual({})
  screens['gpu-0']!.vnc = ['future-format']
  expect(screenInactive(port, row)).toBe(true)
  expect(screenIssues(row)).toEqual({})
  expect(encodeDocument(row)).toContain('18446744073709551615')
  const original = parse(before) as ConfigObject
  screenFields('gpu-0', original)
  screenIssues(original)
  expect(encodeDocument(original)).toBe(before)
  expect(screenInactive(port, {})).toBe(true)
  expect(
    screenInactive(screenFields('gpu-0', {}).find((f) => f.path.at(-1) === 'enabled')!, {}),
  ).toBe(false)
})
