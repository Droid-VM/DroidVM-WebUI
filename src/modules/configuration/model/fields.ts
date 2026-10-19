import type { MessageKey } from '../../../shared/i18n'

export interface ConfigField {
  path: string[]
  label: MessageKey
  type: 'text' | 'number' | 'boolean' | 'select' | 'password' | 'boot-disk'
  options?: string[]
  optionLabels?: Partial<Record<string, MessageKey>>
  disabledOptions?: string[]
  hint?: MessageKey
  emptyValue?: number | null
  min?: number
  max?: number
  readonly?: boolean
  required?: boolean
}
// Stored keys/options match VMConfig, VMEditBasicTab and BootConfig in the App.
// These controls change only touched fields; defaults and migrations stay native.
export const configGroups: { label: MessageKey; fields: ConfigField[] }[] = [
  {
    label: 'configBasic',
    fields: [
      { path: ['name'], label: 'name', type: 'text' },
      { path: ['backend'], label: 'backend', type: 'select', options: ['crosvm', 'qemu'] },
      {
        path: ['hypervisor'],
        label: 'configHypervisor',
        type: 'select',
        options: ['auto', 'soft', 'kvm', 'gunyah', 'geniezone'],
      },
      { path: ['cpu_count'], label: 'processor', type: 'number', min: 1, max: 64 },
      { path: ['memory_mb'], label: 'configMemory', type: 'number', min: 1 },
      { path: ['swiotlb_mb'], label: 'configSwiotlb', type: 'number', min: 0 },
      {
        path: ['protected_vm'],
        label: 'configProtection',
        type: 'select',
        options: [
          'protected_normal',
          'protected_protected',
          'protected_without_firmware',
          'pseudo_unprotected',
        ],
        optionLabels: {
          protected_normal: 'configProtectionNormal',
          protected_protected: 'configProtectionProtected',
          protected_without_firmware: 'configProtectionNoFirmware',
          pseudo_unprotected: 'configProtectionPseudo',
        },
      },
      {
        path: ['prepare_lend_mthp'],
        label: 'configMthp',
        type: 'select',
        options: ['disabled', 'single', 'chunked'],
        optionLabels: {
          disabled: 'configMthpDisabled',
          single: 'configMthpSingle',
          chunked: 'configMthpChunked',
        },
      },
      { path: ['hugepages'], label: 'configHugepages', type: 'boolean' },
      { path: ['balloon'], label: 'configBalloon', type: 'boolean' },
      { path: ['pmu'], label: 'configPmu', type: 'boolean' },
      { path: ['rng'], label: 'configRng', type: 'boolean' },
      { path: ['smt'], label: 'configSmt', type: 'boolean' },
      { path: ['sandbox'], label: 'configSandbox', type: 'boolean' },
      { path: ['strace'], label: 'configStrace', type: 'boolean' },
    ],
  },
  {
    label: 'configBoot',
    fields: [
      {
        path: ['boot', 'protocol'],
        label: 'configBootProtocol',
        type: 'select',
        options: ['uefi', 'linux'],
      },
      { path: ['boot', 'uefi', 'firmware'], label: 'configFirmware', type: 'text' },
      { path: ['boot', 'uefi', 'vars_enabled'], label: 'configVarsEnabled', type: 'boolean' },
      { path: ['boot', 'uefi', 'vars'], label: 'configVars', type: 'text' },
      {
        path: ['boot', 'linux', 'source'],
        label: 'configLinuxSource',
        type: 'select',
        options: ['manual', 'image'],
      },
      { path: ['boot', 'linux', 'kernel'], label: 'configKernel', type: 'text' },
      { path: ['boot', 'linux', 'initrd'], label: 'configInitrd', type: 'text' },
      { path: ['boot', 'linux', 'cmdline'], label: 'configCmdline', type: 'text' },
      { path: ['boot', 'linux', 'image', 'disk'], label: 'configImageDisk', type: 'boot-disk' },
      { path: ['boot', 'linux', 'image', 'cmdline'], label: 'configImageCmdline', type: 'text' },
      { path: ['boot', 'linux', 'image', 'vdafix'], label: 'configVdafix', type: 'boolean' },
      { path: ['boot', 'linux', 'image', 'wait'], label: 'configBootWait', type: 'number', min: 0 },
      { path: ['auto_up'], label: 'configAutoStart', type: 'boolean' },
    ],
  },
  { label: 'configStorage', fields: [] },
  { label: 'configNetwork', fields: [] },
  { label: 'configGraphics', fields: [] },
  { label: 'configPeripheral', fields: [] },
]
