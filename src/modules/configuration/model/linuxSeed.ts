import { cloneConfiguration, type ConfigObject } from './document'
import { newMacAddress, newVmId } from './identity'

export interface LinuxSeedOptions {
  diskPath: string
  cpuCount?: number
  memoryMb?: number
  networkId?: string
}

export function createLinuxSeed(options: LinuxSeedOptions) {
  return {
    ...options,
    id: newVmId(),
    mac: options.networkId ? newMacAddress() : '',
  }
}
export type LinuxSeed = ReturnType<typeof createLinuxSeed>

// This only prepares an editable configuration. Disk preparation and the final
// conditional save remain with their existing owners.
export function seedLinuxConfiguration(defaults: ConfigObject, seed: LinuxSeed): ConfigObject {
  const row = cloneConfiguration(defaults)
  row.id = seed.id
  row.cpu_count = seed.cpuCount ?? 1
  row.memory_mb = seed.memoryMb ?? 512
  row.disks = [{ path: seed.diskPath, bus: 'virtio', readonly: false }]
  row.networks = seed.networkId ? [{ network_id: seed.networkId, mac_address: seed.mac }] : []
  return row
}
