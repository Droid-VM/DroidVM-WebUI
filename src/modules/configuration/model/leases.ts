import { isLosslessNumber } from 'lossless-json'
import { fieldText, object, type ConfigObject } from './document'
import { addressRange } from './ip'
import type { NetworkResource } from '../../resources'

export type LeaseFamily = 'dhcp4_lease' | 'dhcp6_lease'
export interface LeaseSlot {
  nic: number
  family: LeaseFamily
}
export type LeaseOccupancy = ReadonlyMap<string, ReadonlySet<bigint>>
export const leaseFamilies: readonly LeaseFamily[] = ['dhcp4_lease', 'dhcp6_lease']
const maximumOffset = 9223372036854775807n

export function leaseOffset(value: unknown): bigint | null {
  if (typeof value !== 'number' && !isLosslessNumber(value)) return null
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null
  const text = fieldText(value)
  if (!/^\d+$/.test(text)) return null
  const offset = BigInt(text)
  return offset > 0n && offset <= maximumOffset ? offset : null
}
export function effectiveVlan(nic: ConfigObject): string {
  const vlan = fieldText(nic.vlan_id)
  return !vlan || vlan === '4095' ? '0' : vlan
}
export function leaseScope(nic: ConfigObject, family: LeaseFamily): string {
  return typeof nic.network_id === 'string' && nic.network_id
    ? JSON.stringify([nic.network_id, effectiveVlan(nic), family])
    : ''
}
// Index only saved assignments; names, opaque extensions and other VM settings
// stay in the editor's baseline. The current VM is replaced by its live draft.
export function collectLeaseOccupancy(
  rows: readonly ConfigObject[],
  excludeVmId: string,
): LeaseOccupancy {
  const result = new Map<string, Set<bigint>>()
  for (const row of rows) {
    if (row.id === excludeVmId || !Array.isArray(row.networks)) continue
    for (const nic of row.networks) {
      if (!object(nic)) continue
      for (const family of leaseFamilies) {
        const lease = nic[family],
          scope = leaseScope(nic, family)
        if (!scope || !object(lease) || lease.enabled !== true) continue
        const offset = leaseOffset(lease.offset)
        if (offset === null) continue
        let used = result.get(scope)
        if (!used) result.set(scope, (used = new Set()))
        used.add(offset)
      }
    }
  }
  return result
}

type AddressFamily = NonNullable<NetworkResource['vlans']>[number]['ipv4']

// Iterate occupied intervals rather than addresses: a single IPv6 pool can
// cover billions of candidates. Prefer the App's 64+, then use smaller hosts.
export function availableLeaseOffset(
  metadata: AddressFamily,
  ipv6: boolean,
  used: ReadonlySet<bigint>,
): string | null {
  const range =
    metadata.source === 'dhcp_pd' && ipv6 ? null : addressRange(metadata.cidr, ipv6 ? 128 : 32)
  if (!range && !(metadata.source === 'dhcp_pd' && ipv6)) return null
  const maximum = range && range.maximum < maximumOffset ? range.maximum : maximumOffset
  if (maximum < 1n) return null
  const blocked: [bigint, bigint][] = [...used].map((offset) => [offset, offset])
  if (range) blocked.push([range.gateway, range.gateway])
  const poolStart = BigInt(metadata.poolStart),
    poolEnd = BigInt(metadata.poolEnd)
  if (poolEnd >= poolStart) blocked.push([poolStart, poolEnd])
  blocked.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const first = (start: bigint, end: bigint): bigint | null => {
    let candidate = start
    for (const [low, high] of blocked) {
      if (candidate > end) return null
      if (high < candidate) continue
      if (low > candidate) break
      candidate = high + 1n
    }
    return candidate <= end ? candidate : null
  }
  return (first(64n, maximum) ?? first(1n, maximum < 63n ? maximum : 63n))?.toString() ?? null
}
