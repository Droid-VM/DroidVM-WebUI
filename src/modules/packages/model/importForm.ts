import type { DeepReadonly } from 'vue'
import type {
  PackageImportPlan,
  PackageImportOperation,
  PackageImportNetworkChoice,
} from '../api/import'
import { validHostPath } from './hostPath'
export interface ImportDraft {
  source: string
  targetDirectory: string
  networks: PackageImportNetworkChoice[]
}
export const importDraft = (): ImportDraft => ({ source: '', targetDirectory: '', networks: [] })
export function initialNetworks(
  plan: DeepReadonly<PackageImportPlan>,
): PackageImportNetworkChoice[] {
  return plan.networks.map((network) =>
    network.candidates[0]
      ? { ref: network.ref, action: 'join', networkId: network.candidates[0].id }
      : { ref: network.ref, action: network.createAllowed ? 'create' : 'skip' },
  )
}
export function importOperation(
  draft: ImportDraft,
  plan: DeepReadonly<PackageImportPlan>,
): PackageImportOperation | null {
  if (
    !validHostPath(draft.targetDirectory, true) ||
    draft.networks.length !== plan.networks.length ||
    new Set(draft.networks.map((row) => row.ref)).size !== draft.networks.length
  )
    return null
  for (const choice of draft.networks) {
    const network = plan.networks.find((row) => row.ref === choice.ref)
    if (
      !network ||
      (choice.action === 'create' && !network.createAllowed) ||
      (choice.action === 'join' &&
        !network.candidates.some((candidate) => candidate.id === choice.networkId)) ||
      (choice.action !== 'join' && 'networkId' in choice)
    )
      return null
  }
  return {
    targetDirectory: draft.targetDirectory,
    networks: draft.networks.map((row) => ({ ...row })),
    confirmed: true,
  }
}
export { validHostPath } from './hostPath'
export type { PackageImportNetworkChoice } from '../api/import'
