export { createResourceGateway } from './api/http'
export { createUsbActionGateway } from './api/usbOperations'
export { createDiskActionGateway } from './api/diskOperations'
export type { DiskActionGateway, DiskOperation, DiskPreparation } from './api/diskOperations'
export { createDiskActions, diskActionsKey, useDiskActions } from './model/diskOperations'
export type {
  DiskOptimizationPreferences,
  DiskOptimizationDefaults,
  OptimizationRememberState,
  DiskOptimizationOrigin,
} from './model/diskOptimize'
export type { UsbActionGateway, UsbOperation, UsbTarget } from './api/usbOperations'
export { createUsbActions, usbActionsKey, useUsbActions } from './model/usbOperations'
export type {
  ResourceGateway,
  ResourceKind,
  DiskResource,
  DiskDetail,
  NetworkResource,
  AudioDevice,
  HostCpuCore,
  HostDevices,
  UsbDevice,
  UsbVmTarget,
} from './api/gateway'
export { createResourceCatalog, resourceCatalogKey, useResourceCatalog } from './model/catalog'
export { default as ResourceList } from './components/ResourceList.vue'
export { default as DiskOperationDialog } from './components/DiskOperationDialog.vue'
export { default as DiskOperationStatus } from './components/DiskOperationStatus.vue'
export { default as DiskRecovery } from './components/DiskRecovery.vue'
export { default as ResourcePicker } from './components/ResourcePicker.vue'
export { default as AudioDevicePicker } from './components/AudioDevicePicker.vue'
export { default as CpuCorePicker } from './components/CpuCorePicker.vue'
export { default as UsbDeviceList } from './components/UsbDeviceList.vue'
