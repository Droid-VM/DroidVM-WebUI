import type { HostCpuCore } from '../../resources'
import { isLosslessNumber } from 'lossless-json'
import { compactCpuSet, cpuSet, hasCpu } from '../../../shared/lib/cpuSet'
import { affinityRows } from './cpuAffinity'
import { cloneConfiguration, fieldText, type ConfigObject } from './document'

export function vcpuCount(row: ConfigObject): number {
  if (row.cpu_count === undefined) return 1
  if (typeof row.cpu_count !== 'number' && !isLosslessNumber(row.cpu_count)) return 0
  const text = fieldText(row.cpu_count)
  if (!/^\d+$/.test(text)) return 0 // Native integer access does not coerce strings/reals.
  const value = Number(text)
  return Number.isInteger(value) && value >= 1 && value <= 64 ? value : 0
}
export interface CpuPlacementPreview {
  capacity: { vcpu: number; value: number }[]
  clusters: number[][]
  incomplete: boolean
}
// A view of App CpuPlacementPlan / native cpu_placement, using the host's
// observed capacities (including its estimates). Never persists auto values.
export function cpuPlacementPreview(
  row: ConfigObject,
  cores: readonly HostCpuCore[],
): CpuPlacementPreview | null {
  const count = vcpuCount(row),
    mapping = affinityRows(row.cpu_affinity)
  if (!count || !mapping || [...mapping.keys()].some((id) => id >= count)) return null
  const capacity: CpuPlacementPreview['capacity'] = []
  let incomplete = false
  for (const [vcpu, text] of [...mapping].sort((a, b) => a[0] - b[0])) {
    const ranges = cpuSet(text)!
    const merged = cpuSet(compactCpuSet(ranges))!
    // The native parser bounds expansions to 2^20 and rejects ranges ending
    // at INT32_MAX. Keep the preview unavailable for those rejected inputs.
    if (
      ranges.some(([a, b]) => b - a >= 1048576 || (a !== b && b === 2147483647)) ||
      merged.reduce((size, [a, b]) => size + b - a + 1, 0) > 1048576 ||
      hasCpu(ranges, 2147483647)
    )
      return null
    const known = cores.filter((core) => hasCpu(ranges, core.id) && core.capacity !== null)
    const size = merged.reduce((total, [a, b]) => total + b - a + 1, 0)
    incomplete ||= known.length < size
    const values = known.map((core) => core.capacity!).filter((value) => value > 0)
    if (values.length) capacity.push({ vcpu, value: Math.min(...values) })
  }
  const groups = new Map<number, number[]>()
  for (const entry of capacity) {
    const group = groups.get(entry.value) ?? []
    group.push(entry.vcpu)
    groups.set(entry.value, group)
  }
  const clusters = [...groups].sort((a, b) => a[0] - b[0]).map(([, members]) => members)
  if (clusters.length) {
    for (let vcpu = 0; vcpu < count; vcpu++) {
      if (!capacity.some((entry) => entry.vcpu === vcpu)) clusters[0]!.push(vcpu)
    }
    clusters[0]!.sort((a, b) => a - b)
  }
  return { capacity, clusters, incomplete }
}
export const guestCpuSet = (ids: readonly number[]) => compactCpuSet(ids.map((id) => [id, id]))

export function seedManualTopology(
  row: ConfigObject,
  preview: CpuPlacementPreview | null,
): ConfigObject {
  const result = cloneConfiguration(row)
  if (!preview) return result
  const empty = (key: string) =>
    row[key] === undefined || (typeof row[key] === 'string' && !row[key].trim())
  if (empty('cpu_capacity') && preview.capacity.every((entry) => entry.value <= 1024))
    result.cpu_capacity = preview.capacity.map((entry) => `${entry.vcpu}=${entry.value}`).join(',')
  if (empty('cpu_clusters') && preview.clusters.length > 1)
    result.cpu_clusters = preview.clusters.map(guestCpuSet).join(';')
  return result
}
// App flattenToOneToOne: each vCPU keeps its lowest core not already claimed,
// then the selected host indices determine the new ascending guest numbering.
export function simpleHostSelection(row: ConfigObject, cores: readonly HostCpuCore[]): string {
  const mapping = affinityRows(row.cpu_affinity)
  if (!mapping) return ''
  if (!mapping.size) return guestCpuSet(cores.slice(0, vcpuCount(row)).map((core) => core.id))
  const taken = new Set<number>()
  for (const [, text] of [...mapping].sort((a, b) => a[0] - b[0])) {
    for (const [first, last] of cpuSet(compactCpuSet(cpuSet(text)!))!) {
      let candidate = first
      while (candidate <= last && taken.has(candidate)) candidate++
      if (candidate > last) continue
      taken.add(candidate)
      break
    }
  }
  return guestCpuSet([...taken])
}
export function oneToOnePlacement(
  text: string,
): { count: number; affinity: string; hosts: string } | null {
  const parsed = cpuSet(text)
  if (!parsed) return null
  const hosts = compactCpuSet(parsed),
    ranges = cpuSet(hosts)!
  const count = ranges.reduce((total, [a, b]) => total + b - a + 1, 0)
  if (count < 1 || count > 64) return null
  const assignments: string[] = []
  for (const [a, b] of ranges)
    for (let host = a; host <= b; host++) assignments.push(`${assignments.length}=${host}`)
  return { count, affinity: assignments.join(':'), hosts }
}
