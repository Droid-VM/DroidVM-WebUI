import type { InjectionKey, Ref } from 'vue'

export type LiveResource = 'vms' | 'tasks' | 'disks' | 'networks'
export interface LiveUpdates {
  connected: Readonly<Ref<boolean>>
  revisions: Readonly<Record<LiveResource, number>>
}
export const liveUpdatesKey: InjectionKey<LiveUpdates> = Symbol('live-updates')
