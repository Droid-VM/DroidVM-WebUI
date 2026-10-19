import { expect, it } from 'vitest'
import { parse } from 'lossless-json'
import {
  editForward,
  leaseCapability,
  forwardSections,
  networkInactive,
  networkIssues,
  portRange,
} from '../../src/modules/configuration/model/networks'
import { remapIndexedInputs } from '../../src/modules/configuration/model/attachments'
import { encodeDocument, type ConfigObject } from '../../src/modules/configuration/model/document'
import type { NetworkResource } from '../../src/modules/resources'
import { addressRange } from '../../src/modules/configuration/model/ip'

const network: NetworkResource = {
  id: 'net',
  name: 'network',
  bridgeType: 'gvisor',
  uplinkMode: 'l3',
}
const vm = (): ConfigObject => ({
  networks: [
    {
      network_id: 'net',
      mac_address: '02:00:00:00:00:01',
      dhcp4_lease: {
        enabled: true,
        offset: 64,
        forwards: [{ proto: 'any', host: '8000-8002', guest: '9000-9002' }],
      },
    },
  ],
})

it('checks port endpoints and equal range sizes using the App forward grammar', () => {
  expect(portRange(' +80 - +90 ')).toEqual([80, 90])
  expect(portRange('65535')).toEqual([65535, 65535])
  for (const text of ['0', '65536', '80-79', '1-2-3', '80:90', '1e3', ''])
    expect(portRange(text)).toBeNull()
  const row = vm(),
    nic = (row.networks as ConfigObject[])[0]!
  expect(networkIssues(row, [network])).toEqual({})
  ;(nic.dhcp4_lease as ConfigObject).forwards = [
    { proto: 'sctp', host: '8000-8002', guest: '9000-9001' },
  ]
  expect(networkIssues(row, [network])).toMatchObject({
    'networks.0.dhcp4_lease.forwards.0.proto': 'configForwardProtoInvalid',
    'networks.0.dhcp4_lease.forwards.0.guest': 'configForwardRangeMismatch',
  })
})

it('uses known network constraints without discarding inactive leases and retains exact IPv6 offsets', () => {
  const row = vm(),
    nic = (row.networks as ConfigObject[])[0]!
  nic.vlan_id = 0
  nic.dhcp6_lease = {
    enabled: true,
    offset: parse('9007199254740993'),
    forwards: [{ proto: 'udp', host: '53', guest: '53' }],
  }
  const linux = { ...network, bridgeType: 'linux' }
  expect(networkIssues(row, [linux])).toEqual({ 'networks.0.vlan_id': 'configLinuxVlanZero' })
  const input = {
    path: ['networks', '0', 'dhcp6_lease', 'forwards', '0', 'host'],
    label: 'configForwardHost' as const,
    type: 'text' as const,
  }
  expect(networkInactive(input, row, [linux])).toBe(true)
  expect(networkInactive(input, row, [network])).toBe(false)
  const before = encodeDocument(row)
  forwardSections(row, 0, [linux])
  expect(encodeDocument(row)).toBe(before)
  expect(before).toContain('9007199254740993')
  nic.mac_address = ''
  expect(networkIssues(row, [{ ...network, uplinkMode: 'l2' }])).toEqual({})
  nic.mac_address = 'bad'
  expect(networkIssues(row, [network])['networks.0.mac_address']).toBe('configMacInvalid')
  nic.mac_address = '02:00:00:00:00:01'
  nic.vlan_id = null
  ;(row.networks as ConfigObject[]).push({
    network_id: 'net',
    vlan_id: 4095,
    mac_address: '02:00:00:00:00:02',
    dhcp4_lease: { enabled: true, offset: 64 },
  })
  expect(networkIssues(row, [network])['networks.1.dhcp4_lease.offset']).toBe(
    'configLeaseOffsetConflict',
  )
})

it('edits indexed rules without losing unknown entries/extensions and remaps only the affected input collection', () => {
  const row = vm(),
    nic = (row.networks as ConfigObject[])[0]!
  const forwards = (nic.dhcp4_lease as ConfigObject).forwards as unknown[]
  forwards.push('future', {
    proto: 'tcp',
    host: '80',
    guest: '80',
    extension: parse('18446744073709551615'),
  })
  const before = encodeDocument(row),
    slot = { nic: 0, family: 'dhcp4_lease' as const }
  const result = editForward(row, slot, 0)
  const prefix = 'networks.0.dhcp4_lease.forwards.'
  expect(
    remapIndexedInputs(
      { [prefix + '2.guest']: 'invalid', 'networks.1.dhcp4_lease.offset': '0' },
      prefix,
      result.order,
    ),
  ).toEqual({ [prefix + '1.guest']: 'invalid', 'networks.1.dhcp4_lease.offset': '0' })
  expect(encodeDocument(row)).toBe(before)
  const added = editForward(result.document, slot)
  expect(encodeDocument(added.document)).toContain('18446744073709551615')
  expect(encodeDocument(added.document)).toContain('"future"')
  expect(
    forwardSections(added.document, 0, [network]).some((section) => section.raw === '"future"'),
  ).toBe(true)
  ;(nic.dhcp4_lease as ConfigObject).forwards = { future: true }
  expect(() => editForward(row, slot)).toThrow('Invalid forwarding collection')
  expect(() => editForward({ networks: { '0': nic } }, slot)).toThrow(
    'Invalid forwarding collection',
  )
  expect(forwardSections(row, 0, [network])[0]!.raw).toContain('future')
})

it('uses optional VLAN metadata to disable inapplicable editing without altering saved leases', () => {
  const row = vm(),
    nic = (row.networks as ConfigObject[])[0]!
  const metadata = {
    cidr: '192.0.2.1/24',
    source: 'static' as const,
    dhcpEnabled: true,
    snatEnabled: false,
    poolStart: '128',
    poolEnd: '192',
  }
  const known: NetworkResource = { ...network, vlans: [{ id: 0, ipv4: metadata, ipv6: metadata }] }
  const field = {
    path: ['networks', '0', 'dhcp4_lease', 'enabled'],
    label: 'configDhcp4Lease' as const,
    type: 'boolean' as const,
  }
  const before = encodeDocument(row)
  expect(leaseCapability(nic, 'dhcp4_lease', network).hint).toBe('configLeaseUnknown')
  expect(networkInactive(field, row, [known])).toBe(false)
  expect(forwardSections(row, 0, [known])[0]!.hint).toBe('configForwardSnatDisabled')
  expect(networkInactive(field, row, [{ ...known, vlans: [] }])).toBe(true)
  metadata.dhcpEnabled = false
  expect(leaseCapability(nic, 'dhcp4_lease', known).reason).toBe('configLeaseDhcpDisabled')
  expect(networkIssues(row, [known])).toEqual({})
  expect(encodeDocument(row)).toBe(before)
  nic.vlan_id = 10
  expect(leaseCapability(nic, 'dhcp4_lease', known).reason).toBe('configLeaseVlanMissing')
  nic.vlan_id = 4095
  expect(leaseCapability(nic, 'dhcp4_lease', known).metadata).toBe(metadata)
})

it('checks subnet, gateway and pool boundaries with exact IPv6 arithmetic and defers delegated prefixes', () => {
  const row = vm(),
    nic = (row.networks as ConfigObject[])[0]!
  const v4 = {
    cidr: '192.0.2.1/24',
    source: 'static' as 'static' | 'dhcp_pd',
    dhcpEnabled: true,
    snatEnabled: true,
    poolStart: '128',
    poolEnd: '192',
  }
  const v6 = {
    ...v4,
    cidr: '2001:db8::1/64',
    poolStart: '9007199254740994',
    poolEnd: '9007199254740995',
  }
  const known: NetworkResource = { ...network, vlans: [{ id: 0, ipv4: v4, ipv6: v6 }] }
  for (const [offset, reason] of [
    [255, 'configLeaseOffsetRange'],
    [256, 'configLeaseOffsetRange'],
    [1, 'configLeaseOffsetGateway'],
    [128, 'configLeaseOffsetPool'],
    [192, 'configLeaseOffsetPool'],
  ] as const) {
    ;(nic.dhcp4_lease as ConfigObject).offset = offset
    expect(networkIssues(row, [known])['networks.0.dhcp4_lease.offset']).toBe(reason)
  }
  for (const offset of [2, 127, 193, 254]) {
    ;(nic.dhcp4_lease as ConfigObject).offset = offset
    expect(networkIssues(row, [known])).toEqual({})
  }
  nic.dhcp6_lease = { enabled: true, offset: parse('9007199254740993') }
  expect(networkIssues(row, [known])).toEqual({})
  ;(nic.dhcp6_lease as ConfigObject).offset = parse('9007199254740994')
  expect(networkIssues(row, [known])['networks.0.dhcp6_lease.offset']).toBe('configLeaseOffsetPool')
  v6.cidr = '2001:db8::1/128'
  expect(networkIssues(row, [known])['networks.0.dhcp6_lease.offset']).toBe(
    'configLeaseOffsetRange',
  )
  v6.source = 'dhcp_pd'
  ;(nic.dhcp6_lease as ConfigObject).offset = parse('9007199254740993')
  expect(networkIssues(row, [known])).toEqual({})
  expect(addressRange('2001:db8::ffff:192.0.2.1/64', 128)).toEqual({
    maximum: 18446744073709551615n,
    gateway: 281473902969345n,
  })
  expect(addressRange('::/127', 128)?.maximum).toBe(1n)
  expect(addressRange('0.0.0.1/0', 32)?.maximum).toBe(4294967294n)
  for (const cidr of [':::/64', 'example.com/64', '::/129', '[::1]/64', 'fe80::1%eth0/64'])
    expect(addressRange(cidr, 128)).toBeNull()
})
