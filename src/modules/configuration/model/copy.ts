import { clearBootEntry } from './attachments'
import { cloneConfiguration, fieldText, getPath, object, type ConfigObject } from './document'
import { newMacAddress, newVmId } from './identity'

export function uniqueVmName(existing: ConfigObject[], name: string): string {
  const names = new Set(existing.map((vm) => vm.name))
  let result = name
  for (let suffix = 2; names.has(result); suffix++) result = `${name} (${suffix})`
  return result
}

// Copy a configuration, never its backing files. Keep unknown fields and exact
// numbers, but regenerate identities and detach known exclusive host resources.
// The native conditional commit still validates the complete document.
export function copyConfiguration(
  source: ConfigObject,
  existing: ConfigObject[],
  name: string,
): ConfigObject {
  const row = cloneConfiguration(source)
  const ids = new Set(existing.map((vm) => vm.id))
  do row.id = newVmId()
  while (ids.has(row.id))
  row.name = uniqueVmName(existing, name)
  row.created_at = Date.now()
  row.auto_up = false
  if (Array.isArray(row.disks)) {
    for (const disk of row.disks) {
      if (!object(disk) || disk.readonly === true || !disk.path) continue
      disk.path = ''
      clearBootEntry(row)
    }
  }
  const uefi = getPath(row, ['boot', 'uefi'])
  if (object(uefi) && Object.hasOwn(uefi, 'vars')) uefi.vars = ''
  if (Array.isArray(row.networks)) {
    const macs = new Set(
      existing.flatMap((vm) =>
        Array.isArray(vm.networks)
          ? vm.networks.map((nic) => fieldText(getPath(nic, ['mac_address'])).toLowerCase())
          : [],
      ),
    )
    for (const nic of row.networks) {
      if (!object(nic)) continue
      let mac: string
      do mac = newMacAddress()
      while (macs.has(mac))
      macs.add(mac)
      nic.mac_address = mac
      for (const key of ['dhcp4_lease', 'dhcp6_lease']) {
        const lease = nic[key]
        if (!object(lease)) continue
        lease.enabled = false
        delete lease.offset
        delete lease.forwards
      }
    }
  }
  delete row.port_forwards // Legacy VM-level forwards must not be migrated into the copy.
  if (object(row.screens)) {
    for (const screen of Object.values(row.screens)) {
      if (object(screen) && ['vnc', 'webrtc'].includes(fieldText(screen.exporter).toLowerCase()))
        screen.enabled = false
    }
  }
  if (Array.isArray(row.serial_ports)) {
    for (const port of row.serial_ports) {
      if (!object(port)) continue
      if (
        ['file', 'unix', 'unix_stream', 'pty', 'usb_acm'].includes(
          fieldText(port.backend).toLowerCase(),
        )
      ) {
        port.backend = 'sink'
        if (Object.hasOwn(port, 'path')) port.path = ''
        delete port.usb_slot
      }
    }
  }
  return row
}
