import type { NetworkResource } from '../../resources'
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
import { addressRange } from './ip'
import {
  availableLeaseOffset,
  effectiveVlan,
  leaseFamilies as families,
  leaseOffset,
  leaseScope,
  type LeaseOccupancy,
  type LeaseFamily,
  type LeaseSlot,
} from './leases'

export type { LeaseFamily, LeaseSlot } from './leases'
export interface ForwardSlot extends LeaseSlot {
  index: number
}
export interface ForwardSection {
  key: string
  label: MessageKey
  identity: string
  fields: ConfigField[]
  lease?: LeaseSlot
  forward?: ForwardSlot
  hint?: MessageKey
  raw?: string
}
export const forwardPath = (slot: LeaseSlot) => [
  'networks',
  String(slot.nic),
  slot.family,
  'forwards',
]
const networkFor = (nic: ConfigObject, networks: readonly NetworkResource[]) =>
  networks.find((net) => net.id === nic.network_id)
const l3 = (network?: NetworkResource) => !network || network.uplinkMode.toLowerCase() === 'l3'
export function leaseCapability(nic: ConfigObject, family: LeaseFamily, network?: NetworkResource) {
  const metadata = network?.vlans?.find((vlan) => String(vlan.id) === effectiveVlan(nic))?.[
    family === 'dhcp4_lease' ? 'ipv4' : 'ipv6'
  ]
  let reason: MessageKey | undefined
  if (!l3(network)) reason = 'configLeaseL3Required'
  else if (network?.vlans !== undefined && !metadata) reason = 'configLeaseVlanMissing'
  else if (metadata && !metadata.dhcpEnabled) reason = 'configLeaseDhcpDisabled'
  return {
    available: !reason,
    metadata,
    reason,
    hint: reason ?? (!metadata ? 'configLeaseUnknown' : undefined),
  }
}
function forwardReason(
  nic: ConfigObject,
  family: LeaseFamily,
  network?: NetworkResource,
): MessageKey | undefined {
  const capability = leaseCapability(nic, family, network)
  if (capability.reason) return capability.reason
  if (family === 'dhcp6_lease' && network?.bridgeType.toLowerCase() === 'linux')
    return 'configForwards6Gvisor'
  if (capability.metadata && !capability.metadata.snatEnabled) return 'configForwardSnatDisabled'
  return undefined
}
export function networkFieldHint(
  field: ConfigField,
  row: ConfigObject,
  networks: readonly NetworkResource[],
) {
  if (field.path[0] !== 'networks' || !families.includes(field.path[2] as LeaseFamily))
    return field.hint
  const nic = getPath(row, field.path.slice(0, 2))
  if (!object(nic)) return field.hint
  return (
    leaseCapability(nic, field.path[2] as LeaseFamily, networkFor(nic, networks)).hint ?? field.hint
  )
}
export function networkInactive(
  field: ConfigField,
  row: ConfigObject,
  networks: readonly NetworkResource[],
): boolean {
  if (field.path[0] !== 'networks' || !families.includes(field.path[2] as LeaseFamily)) return false
  const nic = getPath(row, field.path.slice(0, 2))
  if (!object(nic)) return true
  const family = field.path[2] as LeaseFamily
  const lease = nic[family]
  const network = networkFor(nic, networks)
  if ((lease !== undefined && !object(lease)) || !leaseCapability(nic, family, network).available)
    return true
  if (field.path[3] === 'enabled') return false
  if (!object(lease) || lease.enabled !== true) return true
  return field.path[3] === 'forwards' && !!forwardReason(nic, family, network)
}
export function portRange(text: string): [number, number] | null {
  // Same 1..65535 endpoints as App PortForward / native validate_forward.
  const match = /^\s*\+?(\d+)\s*(?:-\s*\+?(\d+)\s*)?$/.exec(text)
  if (!match) return null
  const start = Number(match[1]),
    end = Number(match[2] ?? match[1])
  return start >= 1 && end <= 65535 && end >= start ? [start, end] : null
}
function editableForward(value: unknown): value is ConfigObject {
  return (
    object(value) &&
    ['proto', 'host', 'guest'].every(
      (key) => value[key] === undefined || typeof value[key] === 'string',
    )
  )
}
export function networkIssues(
  row: ConfigObject,
  networks: readonly NetworkResource[],
  peers: LeaseOccupancy = new Map(),
): Record<string, MessageKey> {
  const errors: Record<string, MessageKey> = {}
  if (!Array.isArray(row.networks)) return errors
  const offsets = new Set<string>()
  row.networks.forEach((nic, index) => {
    if (!object(nic)) return
    const prefix = `networks.${index}.`
    const network = networkFor(nic, networks)
    const mac = typeof nic.mac_address === 'string' ? nic.mac_address : ''
    if (mac && !/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(mac))
      errors[prefix + 'mac_address'] = 'configMacInvalid'
    else if (
      !mac &&
      (nic.mac_security === true ||
        (leaseCapability(nic, 'dhcp4_lease', network).available &&
          getPath(nic, ['dhcp4_lease', 'enabled']) === true))
    )
      errors[prefix + 'mac_address'] = 'configMacRequired'
    if (fieldText(nic.vlan_id) === '0' && network?.bridgeType.toLowerCase() === 'linux')
      errors[prefix + 'vlan_id'] = 'configLinuxVlanZero'
    if (!l3(network)) return
    for (const family of families) {
      const lease = nic[family]
      const capability = leaseCapability(nic, family, network)
      if (!object(lease) || lease.enabled !== true || !capability.available) continue
      const offset = leaseOffset(lease.offset)
      if (offset === null) errors[prefix + family + '.offset'] = 'configLeaseOffsetInvalid'
      else if (typeof nic.network_id === 'string' && nic.network_id) {
        const metadata = capability.metadata
        // A delegated IPv6 prefix is only known at runtime; a saved CIDR may be stale.
        const range =
          metadata && metadata.source !== 'dhcp_pd'
            ? addressRange(metadata.cidr, family === 'dhcp4_lease' ? 32 : 128)
            : null
        if (range && offset > range.maximum)
          errors[prefix + family + '.offset'] = 'configLeaseOffsetRange'
        else if (range && offset === range.gateway)
          errors[prefix + family + '.offset'] = 'configLeaseOffsetGateway'
        else if (
          metadata &&
          offset >= BigInt(metadata.poolStart) &&
          offset <= BigInt(metadata.poolEnd)
        )
          errors[prefix + family + '.offset'] = 'configLeaseOffsetPool'
        const key = encodeDocument([nic.network_id, effectiveVlan(nic), family, offset.toString()])
        if (offsets.has(key)) errors[prefix + family + '.offset'] = 'configLeaseOffsetConflict'
        else if (peers.get(leaseScope(nic, family))?.has(offset))
          errors[prefix + family + '.offset'] = 'configLeaseOffsetOtherVm'
        offsets.add(key)
      }
      if (forwardReason(nic, family, network) || !Array.isArray(lease.forwards)) continue
      lease.forwards.forEach((forward, position) => {
        if (!editableForward(forward)) return
        const at = `${prefix}${family}.forwards.${position}.`
        if (
          !['tcp', 'udp', 'any'].includes(
            forward.proto === undefined ? 'tcp' : String(forward.proto),
          )
        )
          errors[at + 'proto'] = 'configForwardProtoInvalid'
        const host = portRange(fieldText(forward.host)),
          guest = portRange(fieldText(forward.guest))
        if (!host) errors[at + 'host'] = 'configForwardPortInvalid'
        if (!guest) errors[at + 'guest'] = 'configForwardPortInvalid'
        else if (host && host[1] - host[0] !== guest[1] - guest[0])
          errors[at + 'guest'] = 'configForwardRangeMismatch'
      })
    }
  })
  return errors
}

export function offsetSlot(field: ConfigField): LeaseSlot | null {
  if (
    field.path[0] !== 'networks' ||
    field.path[3] !== 'offset' ||
    !families.includes(field.path[2] as LeaseFamily)
  )
    return null
  return { nic: Number(field.path[1]), family: field.path[2] as LeaseFamily }
}

export function suggestLeaseOffset(
  row: ConfigObject,
  slot: LeaseSlot,
  networks: readonly NetworkResource[],
  peers: LeaseOccupancy,
): { offset: string } | { problem: MessageKey } {
  if (
    !Array.isArray(row.networks) ||
    !Number.isInteger(slot.nic) ||
    slot.nic < 0 ||
    !families.includes(slot.family)
  )
    return { problem: 'configLeaseAllocationUnavailable' }
  const nic = row.networks[slot.nic]
  const lease = object(nic) ? nic[slot.family] : undefined
  if (!object(nic) || !object(lease) || lease.enabled !== true)
    return { problem: 'configLeaseAllocationUnavailable' }
  const capability = leaseCapability(nic, slot.family, networkFor(nic, networks))
  if (!capability.available || !capability.metadata)
    return { problem: 'configLeaseAllocationUnavailable' }
  const metadata = capability.metadata
  if (
    metadata.source !== 'dhcp_pd' &&
    !addressRange(metadata.cidr, slot.family === 'dhcp6_lease' ? 128 : 32)
  )
    return { problem: 'configLeaseAllocationUnavailable' }
  const scope = leaseScope(nic, slot.family),
    used = new Set(peers.get(scope))
  row.networks.forEach((other, index) => {
    if (index === slot.nic || !object(other) || leaseScope(other, slot.family) !== scope) return
    const lease = other[slot.family]
    if (!object(lease) || lease.enabled !== true) return
    const offset = leaseOffset(lease.offset)
    if (offset !== null) used.add(offset)
  })
  const offset = availableLeaseOffset(metadata, slot.family === 'dhcp6_lease', used)
  return offset === null ? { problem: 'configLeaseNoFreeOffset' } : { offset }
}

export function forwardSections(
  row: ConfigObject,
  nicIndex: number,
  networks: readonly NetworkResource[],
): ForwardSection[] {
  const nic = getPath(row, ['networks', String(nicIndex)])
  if (!object(nic)) return []
  const network = networkFor(nic, networks)
  if (!l3(network)) return []
  return families.flatMap((family): ForwardSection[] => {
    const lease = nic[family],
      slot = { nic: nicIndex, family },
      path = forwardPath(slot)
    const label: MessageKey = family === 'dhcp4_lease' ? 'configForwards4' : 'configForwards6'
    const base = { key: path.join('.'), label, identity: String(nicIndex + 1), fields: [] }
    if (lease !== undefined && !object(lease))
      return [{ ...base, raw: encodeDocument(lease, true) }]
    if (!object(lease) || lease.enabled !== true) return []
    const reason = forwardReason(nic, family, network)
    if (reason) return [{ ...base, hint: reason }]
    const forwards = lease.forwards
    if (forwards !== undefined && !Array.isArray(forwards))
      return [{ ...base, raw: encodeDocument(forwards, true) }]
    const entries = (forwards ?? []) as unknown[]
    return [
      { ...base, lease: slot, hint: 'configForwardsHint' },
      ...entries.map(
        (value, index): ForwardSection => ({
          key: `${path.join('.')}.${index}`,
          label: 'configForwardRule',
          identity: `${nicIndex + 1} · ${family === 'dhcp4_lease' ? 'IPv4' : 'IPv6'} · ${index + 1}`,
          forward: { ...slot, index },
          fields: editableForward(value)
            ? [
                {
                  path: [...path, String(index), 'proto'],
                  label: 'configForwardProto',
                  type: 'select',
                  options: ['tcp', 'udp', 'any'],
                  optionLabels: {
                    tcp: 'configForwardTcp',
                    udp: 'configForwardUdp',
                    any: 'configForwardAny',
                  },
                },
                {
                  path: [...path, String(index), 'host'],
                  label: 'configForwardHost',
                  type: 'text',
                  required: true,
                },
                {
                  path: [...path, String(index), 'guest'],
                  label: 'configForwardGuest',
                  type: 'text',
                  required: true,
                },
              ]
            : [],
          raw: editableForward(value) ? undefined : encodeDocument(value, true),
        }),
      ),
    ]
  })
}

export function editForward(row: ConfigObject, slot: LeaseSlot, remove?: number) {
  const path = forwardPath(slot)
  const lease = getPath(row, path.slice(0, -1))
  const current = getPath(row, path)
  if (
    !Array.isArray(row.networks) ||
    !Number.isInteger(slot.nic) ||
    slot.nic < 0 ||
    !families.includes(slot.family) ||
    !object(lease) ||
    lease.enabled !== true ||
    (current !== undefined && !Array.isArray(current))
  )
    throw new Error('Invalid forwarding collection')
  const entries = cloneConfiguration((current ?? []) as unknown[])
  const order = entries.map((_, index) => index)
  if (remove === undefined) {
    entries.push({ proto: 'any', host: '', guest: '' })
    order.push(-1)
  } else {
    if (!Number.isInteger(remove) || remove < 0 || remove >= entries.length)
      throw new Error('Invalid forwarding index')
    entries.splice(remove, 1)
    order.splice(remove, 1)
  }
  const document = cloneConfiguration(row)
  setPath(document, path, entries)
  return { document, order }
}
