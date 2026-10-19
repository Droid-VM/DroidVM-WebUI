import { inject, type InjectionKey } from 'vue'
import { requestId } from '../../../shared/api/requestId'
import type { MessageKey } from '../../../shared/i18n'
import { createOperations } from '../../tasks'
import type { Vm } from '../api/gateway'
import type { VmAction, VmActionGateway } from '../api/operations'

export const vmActionKeys: Record<VmAction, MessageKey> = {
  start: 'start',
  stop: 'stop',
  reboot: 'vmReboot',
  suspend: 'vmSuspend',
  resume: 'vmResume',
}
export function createVmActions(
  gateway: VmActionGateway | undefined,
  refresh: () => Promise<boolean>,
  newId = requestId,
) {
  const operations = createOperations(gateway, refresh, gateway?.tracking)
  const allowed = (vm: Vm, action: VmAction) =>
    operations.allowed(vm.id) && !!vm.lifecycle?.actions.includes(action)
  async function submit(vm: Vm, action: VmAction) {
    if (!allowed(vm, action) || !vm.lifecycle) return
    await operations.submit(vm.id, {
      requestId: newId(),
      vmId: vm.id,
      action,
      expected: {
        instanceId: vm.lifecycle.instanceId,
        revision: vm.lifecycle.revision,
        configRevision: vm.lifecycle.configRevision,
      },
    })
  }
  return { ...operations, allowed, submit }
}
export type VmActions = ReturnType<typeof createVmActions>
export const vmActionsKey: InjectionKey<VmActions> = Symbol('vm-actions')
export function useVmActions(): VmActions {
  const model = inject(vmActionsKey)
  if (!model) throw new Error('VM actions are not provided')
  return model
}
