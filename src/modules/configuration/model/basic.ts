import type { MessageKey } from '../../../shared/i18n'
import { fieldText, type ConfigObject } from './document'
import type { ConfigField } from './fields'
import { cpuSet, type CpuInterval as Interval } from '../../../shared/lib/cpuSet'
export { cpuSet } from '../../../shared/lib/cpuSet'

const enumValue = (row: ConfigObject, key: string) => fieldText(row[key]).toLowerCase()
const hypervisors: Record<string, string[]> = {
  crosvm: ['kvm', 'gunyah', 'geniezone'],
  qemu: ['soft', 'kvm', 'gunyah'],
}
export function basicOptions(field: ConfigField, row: ConfigObject): string[] {
  if (field.path[0] === 'hypervisor')
    return hypervisors[enumValue(row, 'backend') || 'crosvm'] ?? field.options ?? []
  if (field.path[0] === 'protected_vm' && !supportsPseudo(row))
    return field.options?.filter((value) => value !== 'pseudo_unprotected') ?? []
  return field.options ?? []
}
function supportsPseudo(row: ConfigObject) {
  return (
    (enumValue(row, 'backend') || 'crosvm') === 'crosvm' &&
    enumValue(row, 'hypervisor') === 'gunyah'
  )
}
export function incompatiblePseudo(row: ConfigObject) {
  const backend = enumValue(row, 'backend') || 'crosvm'
  const hypervisor = enumValue(row, 'hypervisor')
  // Legacy AUTO cannot be resolved without current host facts; never guess KVM
  // and silently change a configuration that may resolve to Gunyah.
  return (
    enumValue(row, 'protected_vm') === 'pseudo_unprotected' &&
    (backend === 'qemu' ||
      (backend === 'crosvm' && ['soft', 'kvm', 'geniezone'].includes(hypervisor)))
  )
}
export function normalizeProtection(row: ConfigObject): boolean {
  if (!incompatiblePseudo(row)) return false
  row.protected_vm = 'protected_normal'
  return true
}
export function basicIssue(row: ConfigObject, path: string): MessageKey | undefined {
  if (path === 'hypervisor') {
    const hypervisor = enumValue(row, 'hypervisor')
    const allowed = hypervisors[enumValue(row, 'backend') || 'crosvm']
    if (
      allowed &&
      ['soft', 'kvm', 'gunyah', 'geniezone'].includes(hypervisor) &&
      !allowed.includes(hypervisor)
    )
      return 'configHypervisorMismatch'
  }
  if (path === 'protected_vm' && incompatiblePseudo(row)) return 'configPseudoOnly'
}
export function basicInactive(field: ConfigField, row: ConfigObject): boolean {
  return (
    field.path[0] === 'swiotlb_mb' &&
    ['protected_normal', 'pseudo_unprotected'].includes(enumValue(row, 'protected_vm'))
  )
}
export function basicSelection(field: ConfigField, value: unknown): string {
  if (field.path[0] === 'prepare_lend_mthp' && typeof value === 'boolean')
    return value ? 'chunked' : 'disabled'
  return fieldText(value).toLowerCase()
}
export function stringLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}
export function lineArray(value: unknown): value is string[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((line) => typeof line === 'string' && !/[\r\n]/.test(line)))
  )
}
export function environmentValid(value: unknown): boolean {
  return (
    !lineArray(value) ||
    (value ?? []).every((line) => {
      const text = line.trim()
      return (
        !text ||
        (!text.includes('\0') && text.indexOf('=') > 0 && !!text.slice(0, text.indexOf('=')).trim())
      )
    })
  )
}

export function topologyIssues(row: ConfigObject): Partial<Record<string, MessageKey>> {
  const errors: Partial<Record<string, MessageKey>> = {}
  const affinity = typeof row.cpu_affinity === 'string' ? row.cpu_affinity.trim() : ''
  if (!affinity) return errors // App CpuPlacementPlan ignores manual topology without affinity.
  const count = Number(fieldText(row.cpu_count) || '1')
  if (!Number.isInteger(count) || count < 1 || count > 64)
    errors.cpu_affinity = 'configAffinityInvalid'
  for (const assignment of affinity.split(':')) {
    const match = /^\s*(\d+)\s*=\s*(.+)$/.exec(assignment)
    if (!match || Number(match[1]) >= count || !cpuSet(match[2]!, 2147483647)) {
      errors.cpu_affinity = 'configAffinityInvalid'
      break
    }
  }
  if (row.cpu_topology_auto !== false) return errors
  const capacity = typeof row.cpu_capacity === 'string' ? row.cpu_capacity.trim() : ''
  if (capacity)
    for (const pair of capacity.split(',')) {
      const match = /^\s*(\d+)\s*=\s*(\d+)\s*$/.exec(pair)
      if (!match || Number(match[1]) >= count || Number(match[2]) < 1 || Number(match[2]) > 1024) {
        errors.cpu_capacity = 'configCapacityInvalid'
        break
      }
    }
  const clusters = typeof row.cpu_clusters === 'string' ? row.cpu_clusters.trim() : ''
  const previous: Interval[] = []
  if (clusters)
    for (const group of clusters.split(';')) {
      const ranges = cpuSet(group, count - 1)
      if (!ranges || ranges.some(([a, b]) => previous.some(([c, d]) => a <= d && c <= b))) {
        errors.cpu_clusters = 'configClustersInvalid'
        break
      }
      previous.push(...ranges) // Repeats within one group are a CPU set, as in the App.
    }
  return errors
}
