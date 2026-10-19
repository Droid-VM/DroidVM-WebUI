import { parse, LosslessNumber } from 'lossless-json'
import {
  object,
  fieldText,
  getPath,
  setPath,
  type ConfigObject,
} from '../../../shared/model/configurationDocument'
import { ipLiteral } from '../../../shared/model/ip'
import { newUuid, newMacAddress } from '../../../shared/model/identity'
import type { MessageKey } from '../../../shared/i18n'

export function parseNetworks(json: string): ConfigObject[] {
  const document = parse(json)
  if (!object(document) || !Array.isArray(document.networks))
    throw new Error('Invalid network document')
  const ids = new Set<string>()
  for (const row of document.networks) {
    if (
      !object(row) ||
      typeof row.id !== 'string' ||
      !row.id ||
      ids.has(row.id) ||
      typeof row.name !== 'string'
    )
      throw new Error('Invalid network configuration')
    ids.add(row.id)
  }
  return document.networks as ConfigObject[]
}
export interface NetworkField {
  key: string
  label: MessageKey
  type?: 'boolean' | 'integer' | 'list' | 'select'
  options?: string[]
  fallback?: unknown
  inactive?: boolean
}
export const basicFields: NetworkField[] = [
  { key: 'name', label: 'name' },
  { key: 'bridge_name', label: 'networkBridgeName' },
  {
    key: 'bridge_type',
    label: 'networkBridgeType',
    type: 'select',
    options: ['linux', 'gvisor'],
    fallback: 'linux',
  },
  {
    key: 'uplink_mode',
    label: 'networkUplinkMode',
    type: 'select',
    options: ['l2', 'l3'],
    fallback: 'l3',
  },
  { key: 'auto_up', label: 'networkAutoUp', type: 'boolean', fallback: false },
  { key: 'stp', label: 'networkStp', type: 'boolean', fallback: false },
]
export const l2Fields: NetworkField[] = [
  { key: 'l2.uplink', label: 'networkUplink' },
  { key: 'l2.pseudo_bridge', label: 'networkPseudoBridge', type: 'boolean', fallback: false },
]
export function vlanFields(row: ConfigObject, index: number): NetworkField[] {
  const base = `l3.vlans.${index}.`,
    gvisor = row.bridge_type === 'gvisor'
  const pd = getPath(row, [...base.slice(0, -1).split('.'), 'ipv6', 'source']) === 'dhcp_pd'
  const fields: NetworkField[] = [
    { key: 'vlan_id', label: 'configVlanId', type: 'integer', fallback: 0 },
  ]
  for (const family of ['ipv4', 'ipv6']) {
    const v6 = family === 'ipv6'
    const enabled = getPath(row, (base + family + '.dhcp.enabled').split('.')) === true
    if (v6)
      fields.push(
        {
          key: 'ipv6.source',
          label: 'networkIpv6Source',
          type: 'select',
          options: ['static', 'dhcp_pd'],
          fallback: 'static',
        },
        { key: 'ipv6.pd.uplink', label: 'networkPdUplink', inactive: !pd },
        { key: 'ipv6.pd.duid', label: 'networkDuid', inactive: !pd },
      )
    fields.push(
      { key: `${family}.cidr`, label: v6 ? 'networkCidr6' : 'networkCidr4', inactive: v6 && pd },
      {
        key: `${family}.snat`,
        label: v6 ? 'networkSnat6' : 'networkSnat4',
        type: 'boolean',
        fallback: false,
        inactive: v6 && !gvisor,
      },
      {
        key: `${family}.dhcp.enabled`,
        label: v6 ? 'networkDhcp6' : 'networkDhcp4',
        type: 'boolean',
        fallback: false,
      },
      {
        key: `${family}.dhcp.offset_start`,
        label: v6 ? 'networkPool6Start' : 'networkPool4Start',
        type: 'integer',
        fallback: 128,
        inactive: !enabled,
      },
      {
        key: `${family}.dhcp.offset_end`,
        label: v6 ? 'networkPool6End' : 'networkPool4End',
        type: 'integer',
        fallback: 192,
        inactive: !enabled,
      },
    )
  }
  fields.push(
    { key: 'ipv6.slaac.enabled', label: 'networkSlaac', type: 'boolean', fallback: false },
    { key: 'ipv4_secondary', label: 'networkSecondary4', type: 'list', inactive: gvisor },
    { key: 'ipv6_secondary', label: 'networkSecondary6', type: 'list', inactive: gvisor },
    { key: 'dns_servers', label: 'networkDns', type: 'list' },
  )
  return fields.map((field) => ({ ...field, key: base + field.key }))
}
export function fieldValue(row: ConfigObject, field: NetworkField) {
  return getPath(row, field.key.split('.')) ?? field.fallback
}
export function representable(row: ConfigObject, field: NetworkField) {
  const value = fieldValue(row, field)
  if (value === undefined || value === null) return true
  if (field.type === 'list')
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
  if (field.type === 'boolean') return typeof value === 'boolean'
  if (field.type === 'integer') return typeof value === 'number' || value instanceof LosslessNumber
  return typeof value === 'string'
}
export function textValue(row: ConfigObject, field: NetworkField) {
  const value = fieldValue(row, field)
  return field.type === 'list' && Array.isArray(value) ? value.join('\n') : fieldText(value)
}
export function editField(
  row: ConfigObject,
  field: NetworkField,
  value: string | boolean,
): boolean {
  if (field.inactive || !representable(row, field)) return false
  let parsed: unknown = value
  if (field.type === 'integer') {
    const text = String(value).trim()
    if (!/^[+-]?\d+$/.test(text)) return false
    const integer = BigInt(text)
    if (integer < -9223372036854775808n || integer > 9223372036854775807n) return false
    parsed = new LosslessNumber(integer.toString())
  } else if (field.type === 'list')
    parsed = String(value)
      .split(/[,\s]+/)
      .filter(Boolean)
  setPath(row, field.key.split('.'), parsed)
  return true
}
export function vlans(row: ConfigObject): unknown[] | null {
  const value = getPath(row, ['l3', 'vlans'])
  return value === undefined ? [] : Array.isArray(value) ? value : null
}
function subnet(text: string, bits: 32 | 128) {
  const [address, prefixText, extra] = text.split('/'),
    ip = ipLiteral(address ?? '')
  if (!ip || ip.bits !== bits || extra !== undefined || !/^\d{1,3}$/.test(prefixText ?? ''))
    return null
  const prefix = Number(prefixText)
  if (prefix > bits) return null
  const count = 1n << BigInt(bits - prefix),
    base = ip.value & ~(count - 1n)
  return { base, end: base + count - 1n, count, prefix, address: ip.value }
}
// Same preset rules as App NetworkPresets.newVlan / pickFreeCidrPair. Only
// explicit additions get defaults; reading or switching an existing row never does.
export function newVlan(
  id: number,
  bridge: unknown,
  existing: readonly ConfigObject[],
): ConfigObject {
  const gvisor = bridge === 'gvisor',
    used: { bits: 32 | 128; base: bigint; end: bigint }[] = []
  for (const row of existing.filter(
    (item) => (item.bridge_type ?? 'linux') === (bridge ?? 'linux'),
  )) {
    for (const vlan of vlans(row) ?? []) {
      if (!object(vlan)) continue
      for (const bits of [32, 128] as const) {
        const family = bits === 32 ? 'ipv4' : 'ipv6',
          list = vlan[`${family}_secondary`]
        for (const value of [
          getPath(vlan, [family, 'cidr']),
          ...(Array.isArray(list) ? list : []),
        ]) {
          const net = subnet(fieldText(value), bits)
          if (net) used.push({ bits, ...net })
        }
      }
    }
  }
  let cidr4: string | null = null,
    cidr6: string | null = null
  for (let n = 50; n <= 250; n++) {
    const a = `192.168.${n}.1/24`,
      b = `fd00:${n}::1/64`,
      v4 = subnet(a, 32)!,
      v6 = subnet(b, 128)!
    if (
      used.some((item) => {
        const candidate = item.bits === 32 ? v4 : v6
        return candidate.base <= item.end && item.base <= candidate.end
      })
    )
      continue
    cidr4 = a
    cidr6 = b
    break
  }
  return {
    vlan_id: id,
    ipv4: { cidr: cidr4, snat: true, dhcp: { enabled: true, offset_start: 128, offset_end: 192 } },
    ipv6: {
      cidr: cidr6,
      source: 'static',
      snat: gvisor,
      dhcp: { enabled: gvisor, offset_start: 128, offset_end: 192 },
      slaac: { enabled: gvisor },
      ...(!gvisor ? { pd: { uplink: 'WiFi' } } : {}),
    },
    ipv4_secondary: [],
    ipv6_secondary: [],
    dns_servers: [],
  }
}
export function newNetwork(existing: readonly ConfigObject[]): ConfigObject {
  let n = 0
  while (existing.some((row) => row.name === `net${n}` || row.bridge_name === `net${n}`)) n++
  return {
    schema: 2,
    id: newUuid(),
    name: `net${n}`,
    bridge_name: `net${n}`,
    bridge_type: 'linux',
    uplink_mode: 'l3',
    auto_up: true,
    stp: false,
    l3: { mac_address: newMacAddress(), vlans: [newVlan(0, 'linux', existing)] },
  }
}
export interface NetworkIssue {
  path: string
  message: MessageKey
}
export function networkIssues(
  row: ConfigObject,
  existing: readonly ConfigObject[],
): NetworkIssue[] {
  const issues: NetworkIssue[] = [],
    add = (path: string, message: MessageKey) => issues.push({ path, message })
  if (!fieldText(row.name).trim()) add('name', 'networkRequired')
  if (!/^[a-z][a-z0-9_-]{0,11}$/i.test(fieldText(row.bridge_name)))
    add('bridge_name', 'networkBridgeInvalid')
  for (const other of existing)
    if (other.id !== row.id) {
      if (other.name === row.name) add('name', 'networkDuplicate')
      if (other.bridge_name === row.bridge_name) add('bridge_name', 'networkDuplicate')
    }
  const gvisor = row.bridge_type === 'gvisor'
  if (row.uplink_mode === 'l2') {
    if (gvisor) add('uplink_mode', 'networkL2Linux')
    if (!fieldText(getPath(row, ['l2', 'uplink'])).trim()) add('l2.uplink', 'networkRequired')
    return issues
  }
  const mac = fieldText(getPath(row, ['l3', 'mac_address']))
  if (mac && !/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(mac)) add('l3.mac_address', 'networkMacInvalid')
  const seen = new Set<string>()
  for (const [index, vlan] of (vlans(row) ?? []).entries()) {
    if (!object(vlan)) continue
    const base = `l3.vlans.${index}.`,
      id = fieldText(vlan.vlan_id ?? 0)
    if (!/^\d+$/.test(id) || Number(id) > 4094) add(base + 'vlan_id', 'networkVlanInvalid')
    if (seen.has(id)) add(base + 'vlan_id', 'networkDuplicate')
    seen.add(id)
    for (const bits of [32, 128] as const) {
      const family = bits === 32 ? 'ipv4' : 'ipv6',
        prefix = base + family + '.'
      const value = (key: string) => getPath(vlan, [family, ...key.split('.')])
      const pd = bits === 128 && value('source') === 'dhcp_pd',
        cidr = fieldText(value('cidr'))
      const net = subnet(cidr, bits)
      if (pd) {
        if (gvisor) add(prefix + 'source', 'networkPdLinux')
        if (!fieldText(value('pd.uplink')).trim()) add(prefix + 'pd.uplink', 'networkRequired')
        const duid = fieldText(value('pd.duid'))
        if (duid && !/^([\da-f]{2}:)*[\da-f]{2}$/i.test(duid))
          add(prefix + 'pd.duid', 'networkDuidInvalid')
      } else if (
        cidr &&
        (!net ||
          net.prefix > bits - 2 ||
          (bits === 32 && (net.address === net.base || net.address === net.end)))
      )
        add(prefix + 'cidr', 'networkCidrInvalid')
      if (bits === 128 && !pd && net && value('slaac.enabled') === true && net.prefix !== 64)
        add(prefix + 'cidr', 'networkSlaac64')
      if ((pd || cidr) && value('dhcp.enabled') === true) {
        const startText = fieldText(value('dhcp.offset_start') ?? 128),
          endText = fieldText(value('dhcp.offset_end') ?? 192)
        const integer = (text: string) =>
          /^\d+$/.test(text) && BigInt(text) > 0n && BigInt(text) <= 9223372036854775807n
        if (!integer(startText)) add(prefix + 'dhcp.offset_start', 'networkPoolInvalid')
        if (
          !integer(endText) ||
          (integer(startText) && BigInt(endText) < BigInt(startText)) ||
          (bits === 32 && net && integer(endText) && BigInt(endText) >= net.count - 1n)
        )
          add(prefix + 'dhcp.offset_end', 'networkPoolInvalid')
      }
      const list = vlan[family + '_secondary']
      if (
        Array.isArray(list) &&
        list.length &&
        (gvisor || list.some((item) => !subnet(fieldText(item), bits)))
      )
        add(base + family + '_secondary', gvisor ? 'networkSecondaryLinux' : 'networkCidrInvalid')
    }
  }
  return issues
}
