import { expect, it } from 'vitest'
import { parse } from 'lossless-json'
import {
  availableLeaseOffset,
  collectLeaseOccupancy,
  leaseScope,
} from '../../src/modules/configuration/model/leases'
import { networkIssues, suggestLeaseOffset } from '../../src/modules/configuration/model/networks'
import { encodeDocument, type ConfigObject } from '../../src/modules/configuration/model/document'
import type { NetworkResource } from '../../src/modules/resources'

const family = {
  cidr: '192.0.2.1/24',
  source: 'static' as const,
  dhcpEnabled: true,
  snatEnabled: true,
  poolStart: '128',
  poolEnd: '192',
}
const network: NetworkResource = {
  id: 'net',
  name: 'Net',
  bridgeType: 'gvisor',
  uplinkMode: 'l3',
  vlans: [{ id: 0, ipv4: family, ipv6: { ...family, cidr: '2001:db8::1/64' } }],
}
const nic = (offset: number | unknown = 64): ConfigObject => ({
  network_id: 'net',
  vlan_id: null,
  mac_address: '02:00:00:00:00:01',
  dhcp4_lease: { enabled: true, offset },
})

it('indexes other saved VMs by network, effective VLAN and family, excluding the current baseline', () => {
  const self = { id: 'self', networks: [nic(65)] }
  const peer = {
    id: 'peer',
    networks: [
      nic(64),
      { ...nic(65), vlan_id: 10 },
      { ...nic(65), network_id: 'other' },
      { ...nic(), dhcp4_lease: { enabled: false, offset: 66 } },
      {
        ...nic(),
        vlan_id: 4095,
        dhcp4_lease: { enabled: true, offset: '67' },
        dhcp6_lease: { enabled: true, offset: parse('9007199254740993') },
      },
    ],
  }
  const index = collectLeaseOccupancy([self, peer], 'self')
  const draft = { id: 'self', networks: [nic(64)] }
  expect(index.get(leaseScope(nic(), 'dhcp4_lease'))).toEqual(new Set([64n]))
  expect(index.get(leaseScope(nic(), 'dhcp6_lease'))).toEqual(new Set([9007199254740993n]))
  expect(networkIssues(draft, [network], index)['networks.0.dhcp4_lease.offset']).toBe(
    'configLeaseOffsetOtherVm',
  )
  expect(suggestLeaseOffset(draft, { nic: 0, family: 'dhcp4_lease' }, [network], index)).toEqual({
    offset: '65',
  })
  draft.networks.push(nic(65))
  expect(suggestLeaseOffset(draft, { nic: 0, family: 'dhcp4_lease' }, [network], index)).toEqual({
    offset: '66',
  })
  // Copying uses a new identity and must reserve the source VM's assignments.
  expect(collectLeaseOccupancy([self, peer], 'copy').get(leaseScope(nic(), 'dhcp4_lease'))).toEqual(
    new Set([64n, 65n]),
  )
})

it('skips whole pools, exact IPv6 assignments and the gateway without enumerating the address space', () => {
  expect(
    availableLeaseOffset(
      { ...family, cidr: '192.0.2.64/24', poolStart: '65', poolEnd: '200' },
      false,
      new Set([201n]),
    ),
  ).toBe('202')
  expect(availableLeaseOffset({ ...family, cidr: '192.0.2.1/30' }, false, new Set())).toBe('2')
  expect(availableLeaseOffset({ ...family, cidr: '192.0.2.1/30' }, false, new Set([2n]))).toBeNull()
  expect(
    availableLeaseOffset(
      { ...family, cidr: '192.0.2.1/24', poolStart: '64', poolEnd: '254' },
      false,
      new Set(),
    ),
  ).toBe('2')
  const v6 = { ...family, cidr: '2001:db8::1/64', poolStart: '2', poolEnd: '9007199254740992' }
  expect(availableLeaseOffset(v6, true, new Set([9007199254740993n]))).toBe('9007199254740994')
  expect(
    availableLeaseOffset({ ...v6, poolEnd: '9223372036854775807' }, true, new Set()),
  ).toBeNull()
  expect(availableLeaseOffset({ ...v6, cidr: '::1/128' }, true, new Set())).toBeNull()
  expect(availableLeaseOffset({ ...v6, source: 'dhcp_pd', cidr: '::1/128' }, true, new Set())).toBe(
    '9007199254740993',
  )
})

it('refuses unavailable allocation and retains drafts, invalid/unknown offsets and peer indexes', () => {
  const draft = { id: 'self', networks: [nic(parse('9007199254740993'))] }
  const before = encodeDocument(draft),
    peers = collectLeaseOccupancy([], 'self')
  const slot = { nic: 0, family: 'dhcp4_lease' as const }
  for (const net of [
    { ...network, vlans: undefined },
    { ...network, vlans: [] },
    { ...network, uplinkMode: 'l2' },
  ])
    expect(suggestLeaseOffset(draft, slot, [net], peers)).toEqual({
      problem: 'configLeaseAllocationUnavailable',
    })
  const exhausted = {
    ...network,
    vlans: [
      {
        id: 0,
        ipv4: { ...family, cidr: '192.0.2.1/30', poolStart: '2', poolEnd: '2' },
        ipv6: family,
      },
    ],
  }
  expect(suggestLeaseOffset(draft, slot, [exhausted], peers)).toEqual({
    problem: 'configLeaseNoFreeOffset',
  })
  expect(encodeDocument(draft)).toBe(before)
  expect(peers.size).toBe(0)
  expect(networkIssues({ networks: [nic('64')] }, [network])['networks.0.dhcp4_lease.offset']).toBe(
    'configLeaseOffsetInvalid',
  )
})
