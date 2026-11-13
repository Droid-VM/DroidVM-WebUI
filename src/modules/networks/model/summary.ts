import type { components } from '../../../generated/api'
import type { MessageKey } from '../../../shared/i18n'

type Translate = (key: MessageKey, values?: Record<string, unknown>) => string
type Family = components['schemas']['NetworkAddressFamily']

// The App's network mode line: NAT or bridge, then the configured uplink.
export function networkModeLine(
  network: { readonly uplinkMode: string; readonly bridgeType: string; readonly uplink?: string },
  t: Translate,
) {
  return [
    t(network.uplinkMode === 'l2' ? 'networkModeBridge' : 'networkModeNat'),
    network.bridgeType === 'gvisor' ? 'gVisor' : '',
    network.uplink ? t('networkUplinkName', { name: network.uplink }) : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

// Pool bounds are host offsets from the network address. IPv4 shows addresses
// ("192.168.50.100 – 199" when only the last octet differs); IPv6 keeps the offsets.
export function networkPoolRange(family: Readonly<Family>) {
  const [address = '', bits = ''] = family.cidr?.split('/') ?? []
  const octets = address.split('.').map(Number)
  const prefix = Number(bits)
  if (octets.length !== 4 || octets.some((n) => !(n >= 0 && n <= 255)) || !(prefix >= 0))
    return `${family.poolStart} – ${family.poolEnd}`
  const value = octets.reduce((sum, n) => sum * 256 + n, 0)
  const size = 2 ** (32 - Math.min(prefix, 32))
  const network = value - (value % size)
  const at = (offset: string) =>
    [24, 16, 8, 0].map((shift) => Math.floor((network + Number(offset)) / 2 ** shift) % 256)
  const start = at(family.poolStart),
    end = at(family.poolEnd)
  const tail = start.slice(0, 3).join('.') === end.slice(0, 3).join('.') ? end[3] : end.join('.')
  return `${start.join('.')} – ${tail}`
}
