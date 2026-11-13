import { inject, shallowRef, type InjectionKey } from 'vue'
import type { ConfigurationGateway } from '../api/gateway'
import { fieldText, getPath, object, parseDocument, type ConfigObject } from './document'

export interface VmPortForward {
  proto: string
  host: string
  guest: string
}
export interface VmNicSummary {
  network: string
  mac: string
  forwards: VmPortForward[]
}
// Read-only facts the App's VM list and info screen show from the saved configuration.
export interface VmConfigSummary {
  notes: string
  kernel: string
  protection: string
  disks: string[]
  nics: VmNicSummary[]
}
const baseName = (path: string) => path.split('/').filter(Boolean).pop() ?? path
function summarize(row: ConfigObject): VmConfigSummary {
  const protocol = fieldText(getPath(row, ['boot', 'protocol'])).toLowerCase()
  const kernel = fieldText(getPath(row, ['boot', 'linux', 'kernel']))
  const disks = Array.isArray(row.disks) ? row.disks : []
  const nics = Array.isArray(row.networks) ? row.networks : []
  return {
    notes: typeof row.notes === 'string' ? row.notes : '',
    kernel: protocol === 'uefi' ? 'UEFI' : kernel ? baseName(kernel) : '',
    protection: fieldText(row.protected_vm).toLowerCase(),
    disks: disks
      .map((disk) => (object(disk) ? baseName(fieldText(disk.path)) : ''))
      .filter(Boolean),
    nics: nics.filter(object).map((nic) => ({
      network: fieldText(nic.network_id),
      mac: fieldText(nic.mac_address),
      forwards: (['dhcp4_lease', 'dhcp6_lease'] as const).flatMap((family) => {
        const lease = nic[family]
        if (!object(lease) || lease.enabled !== true || !Array.isArray(lease.forwards)) return []
        return lease.forwards.filter(object).map((forward) => ({
          proto: fieldText(forward.proto || 'tcp').toUpperCase(),
          host: fieldText(forward.host),
          guest: fieldText(forward.guest),
        }))
      }),
    })),
  }
}
// One read per configuration revision; the list passes the revision it observed.
export function createVmConfigSummaries(gateway?: ConfigurationGateway) {
  const items = shallowRef(new Map<string, VmConfigSummary>())
  let revision: string | null = null
  let reading: string | null = null
  async function ensure(observed: string | null | undefined) {
    if (!observed || observed === revision || observed === reading || !gateway?.supported()) return
    reading = observed
    try {
      const loaded = await gateway.read(new AbortController().signal)
      const document = parseDocument(loaded.json)
      items.value = new Map(document.vms.map((row) => [String(row.id), summarize(row)]))
      revision = loaded.version.revision
    } catch {
      /* Summaries are decoration; the list stays usable without them. */
    } finally {
      reading = null
    }
  }
  return { items, ensure }
}
export type VmConfigSummaries = ReturnType<typeof createVmConfigSummaries>
export const vmConfigSummariesKey: InjectionKey<VmConfigSummaries> = Symbol('vmConfigSummaries')
export function useVmConfigSummaries() {
  return inject(vmConfigSummariesKey, null) ?? createVmConfigSummaries()
}
