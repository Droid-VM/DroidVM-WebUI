import { inject, type InjectionKey } from 'vue'
import { requestId } from '../../../shared/api/requestId'
import { createOperations } from '../../tasks'
import type { UsbDevice } from '../api/gateway'
import type { UsbActionGateway, UsbOperation, UsbTarget } from '../api/usbOperations'

export function usbObservation(device: UsbDevice): UsbOperation['expected'] {
  return {
    busNumber: device.busNumber,
    deviceNumber: device.deviceNumber,
    vendorId: device.vendorId,
    productId: device.productId,
    state: device.state,
    locked: device.locked,
    owner: device.owner
      ? {
          vmId: device.owner.vmId,
          controllerId: device.owner.controllerId,
          port: device.owner.port,
        }
      : null,
  }
}
export function createUsbActions(
  gateway: UsbActionGateway | undefined,
  refresh: () => Promise<boolean>,
  newId = requestId,
) {
  const operations = createOperations(gateway, refresh, gateway?.tracking)
  const allowed = (device: UsbDevice) => operations.allowed(device.id)
  async function submit(device: UsbDevice, target: UsbTarget) {
    if (!allowed(device)) return
    await operations.submit(device.id, {
      requestId: newId(),
      deviceId: device.id,
      expected: usbObservation(device),
      target: { ...target },
    })
  }
  return { ...operations, allowed, submit }
}
export type UsbActions = ReturnType<typeof createUsbActions>
export const usbActionsKey: InjectionKey<UsbActions> = Symbol('usb-actions')
export function useUsbActions() {
  const actions = inject(usbActionsKey)
  if (!actions) throw new Error('USB actions are not provided')
  return actions
}
