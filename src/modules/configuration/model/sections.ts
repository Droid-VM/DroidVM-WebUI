import type { MessageKey } from '../../../shared/i18n'
import { getPath, object, type ConfigObject } from './document'
import type { ConfigField } from './fields'
import type { AttachmentSlot } from './attachments'
import { screenFields, screenIds } from './screens'
import { graphicsSections } from './graphics'
import { forwardSections, networkFieldHint, type LeaseSlot, type ForwardSlot } from './networks'
import type { NetworkResource } from '../../resources'
import { peripheralSections, type DeviceSlot, type EndpointSlot } from './peripherals'
import { storageHint } from './storage'

export interface ConfigSection {
  key: string
  label?: MessageKey
  identity?: string
  fields: ConfigField[]
  slot?: AttachmentSlot
  lease?: LeaseSlot
  forward?: ForwardSlot
  hint?: MessageKey
  raw?: string
  device?: DeviceSlot
  endpoint?: EndpointSlot
  soundCard?: number
}
const field = (
  key: string,
  label: MessageKey,
  type: ConfigField['type'] = 'text',
  extra: Omit<Partial<ConfigField>, 'path' | 'label' | 'type'> = {},
): ConfigField => ({ path: key.split('.'), label, type, ...extra })
const at = (prefix: string[], fields: ConfigField[]) =>
  fields.map((value) => ({ ...value, path: [...prefix, ...value.path] }))

// These are the App's saved keys (VMEditStorageTab, VMNicConfig,
// VMScreenConfig, VMPeripheralConfig and VMSerialConfig). Only touched fields
// are changed; structural edits are explicit draft operations in attachments.ts.
const diskFields = [
  field('path', 'configDiskPath', 'text', { required: true }),
  field('bus', 'configDiskBus', 'select', {
    options: ['virtio', 'scsi', 'pmem', 'pflash', 'cdrom'],
  }),
  field('readonly', 'configReadonly', 'boolean'),
]
const directoryFields = [
  field('path', 'configDirectoryPath', 'text', { required: true }),
  field('tag', 'configDirectoryTag', 'text', { required: true }),
  field('cache', 'configDirectoryCache', 'select', {
    options: ['never', 'auto', 'always'],
    optionLabels: {
      never: 'configDirectoryCacheNever',
      auto: 'configDirectoryCacheAuto',
      always: 'configDirectoryCacheAlways',
    },
  }),
  field('timeout', 'configDirectoryTimeout', 'number', { min: 0 }),
  field('writeback', 'configWriteback', 'boolean'),
  field('posix_acl', 'configPosixAcl', 'boolean'),
  field('root_access', 'configRootAccess', 'boolean'),
  field('readonly', 'configReadonly', 'boolean'),
]
const networkFields = [
  field('network_id', 'configNetworkId', 'text', { readonly: true }),
  field('mac_address', 'configMacAddress'),
  field('vlan_id', 'configVlanId', 'number', {
    min: 0,
    max: 4095,
    emptyValue: null,
    hint: 'configVlanHint',
  }),
  field('mac_security', 'configMacSecurity', 'boolean'),
  field('isolated', 'configIsolated', 'boolean'),
  field('dhcp4_lease.enabled', 'configDhcp4Lease', 'boolean'),
  field('dhcp4_lease.offset', 'configDhcp4Offset', 'number', {
    min: 1,
    required: true,
    hint: 'configLeaseOffsetHint',
  }),
  field('dhcp6_lease.enabled', 'configDhcp6Lease', 'boolean'),
  field('dhcp6_lease.offset', 'configDhcp6Offset', 'number', {
    min: 1,
    required: true,
    hint: 'configLeaseOffsetHint',
  }),
]

function collection(
  row: ConfigObject,
  key: string,
  label: MessageKey,
  fields: ConfigField[] | ((value: ConfigObject) => ConfigField[]),
): ConfigSection[] {
  const items = getPath(row, [key])
  if (!Array.isArray(items) || !items.length) return [{ key, label, fields: [] }]
  return items.map((value, index) => ({
    key: `${key}.${index}`,
    label,
    identity: String(index + 1),
    slot:
      key === 'disks' || key === 'networks' || key === 'shared_dirs'
        ? { collection: key, index }
        : undefined,
    fields: object(value)
      ? at([key, String(index)], typeof fields === 'function' ? fields(value) : fields)
      : [],
  }))
}

export function configurationSections(
  group: { label: MessageKey; fields: ConfigField[] },
  row: ConfigObject,
  networks: readonly NetworkResource[] = [],
): ConfigSection[] {
  if (group.fields.length) return [{ key: group.label, fields: group.fields }]
  switch (group.label) {
    case 'configStorage':
      return [
        ...collection(row, 'disks', 'configDisks', diskFields),
        ...collection(row, 'shared_dirs', 'configSharedDirectories', directoryFields).map(
          (section) => ({ ...section, hint: storageHint(row) }),
        ),
      ]
    case 'configNetwork':
      return collection(row, 'networks', 'configNetworkAdapters', networkFields).flatMap(
        (section) => [
          {
            ...section,
            fields: section.fields.map((field) => ({
              ...field,
              hint: networkFieldHint(field, row, networks),
            })),
          },
          ...(section.slot ? forwardSections(row, section.slot.index, networks) : []),
        ],
      )
    case 'configGraphics': {
      const screens = row.screens
      if (screens !== undefined && !object(screens))
        return [{ key: 'screens', label: 'configScreens', fields: [] }, ...graphicsSections(row)]
      return [
        ...screenIds.map((id) => ({
          key: `screens.${id}`,
          label: id === 'gpu-0' ? ('configScreenGpu' as const) : ('configScreenFb' as const),
          fields: screenFields(id, row),
        })),
        ...graphicsSections(row),
      ]
    }
    case 'configPeripheral':
      return peripheralSections(row)
    default:
      return []
  }
}
