import { inject, type InjectionKey } from 'vue'
import { requestId } from '../../../shared/api/requestId'
import type { HostPreferenceGateway, HostPreferenceValues } from '../api/http'
import { createPreferenceEditor } from './editor'

export const preferenceKeys = [
  'vm_hugepage_auto_reserve',
  'optimize_sdcard',
  'vm_clear_logs_before_start',
] as const
export function createHostPreferences(gateway?: HostPreferenceGateway, newId = requestId) {
  return createPreferenceEditor(
    {
      gateway,
      defaults: {
        vm_hugepage_auto_reserve: true,
        optimize_sdcard: true,
        vm_clear_logs_before_start: false,
      } as HostPreferenceValues,
      resource: 'host-preferences',
      receipt: (task) => task.hostPreferenceResult,
    },
    newId,
  )
}
export type HostPreferences = ReturnType<typeof createHostPreferences>
export const hostPreferencesKey: InjectionKey<HostPreferences> = Symbol('host-preferences')
export function useHostPreferences() {
  const model = inject(hostPreferencesKey)
  if (!model) throw new Error('Host preferences are not provided')
  return model
}
