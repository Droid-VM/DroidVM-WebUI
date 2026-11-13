import type { MessageKey } from '../../../shared/i18n'

export const taskKindKeys: Readonly<Record<string, MessageKey>> = {
  network_configuration: 'configSave',
  network_lifecycle: 'networkLifecycle',
  network_deletion: 'networkDelete',
  configuration_recovery: 'configurationRecoveryTitle',
  configuration_backup: 'backupImportTitle',
  web_service: 'webServiceOperationStatus',
  host_preferences: 'hostPreferencesTitle',
  usb_acm: 'usbAcmTitle',
  android_display: 'androidDisplayTitle',
  disk_defaults: 'diskDefaultsTitle',
  usb_rules: 'usbRulesSave',
  usb_target: 'usbChangeTarget',
  vm_configuration: 'configSave',
  vm_start: 'vmTaskStart',
  vm_stop: 'vmTaskStop',
  vm_reboot: 'vmTaskReboot',
  vm_suspend: 'vmTaskSuspend',
  vm_resume: 'vmTaskResume',
  vm_powerbtn: 'vmTaskPowerButton',
  vm_sleepbtn: 'vmTaskSleepButton',
  disk_operation: 'taskKindDisk',
  disk_recovery: 'diskRecoveryTitle',
  agent_operation: 'agentStatusTitle',
  agent_recovery: 'agentRecoveryTitle',
  agent_rescue_close: 'agentRescueCloseResult',
  vm_export: 'taskKindExport',
  vm_import: 'taskKindImport',
  package_import_plan: 'packageImportPreviewTask',
  image_import_plan: 'imageImportPreview',
  image_import: 'imageImportSubmit',
  image_install: 'imageUploadInstall',
}
export const taskPhaseKeys: Readonly<Record<string, MessageKey>> = {
  admitted: 'vmOperationAdmitted',
  copy: 'taskPhaseCopy',
  resize: 'taskPhaseResize',
  convert: 'taskPhaseConvert',
  flatten: 'taskPhaseFlatten',
  create: 'taskPhaseCreate',
  clone: 'taskPhaseClone',
  commit: 'taskPhaseMerge',
  delete: 'taskPhaseDelete',
  reset: 'taskPhaseReset',
  relink: 'taskPhaseRelink',
  pack: 'taskPhasePack',
  done: 'taskSucceeded',
  error: 'taskFailed',
}
export const taskUnitKeys: Readonly<Record<string, MessageKey>> = {
  bytes: 'taskUnitBytes',
  basis_points: 'taskUnitBasisPoints',
}
// "2 minutes ago" for a task timestamp in milliseconds since the epoch.
export function taskAge(ms: string, locale: string, now = Date.now()) {
  const seconds = Math.round((Number(ms) - now) / 1000)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const steps = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [Infinity, 'day'],
  ] as const
  let value = seconds
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return format.format(value, unit)
    value = Math.round(value / size)
  }
  return ''
}
