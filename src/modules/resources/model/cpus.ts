import type { HostCpuCore } from '../api/gateway'
import { compactCpuSet, cpuSet, toggleCpu } from '../../../shared/lib/cpuSet'

export function cpuFrequencies(cores: readonly HostCpuCore[]) {
  return [
    ...new Set(
      cores.flatMap((core) => (core.maxFrequencyKHz === null ? [] : [core.maxFrequencyKHz])),
    ),
  ].sort((a, b) => a - b)
}
export function bigCpuSet(cores: readonly HostCpuCore[]) {
  const frequencies = cpuFrequencies(cores)
  // App CpuUtils: one group (or unknown frequency) falls back to all cores.
  return compactCpuSet(
    cores
      .filter(
        (core) =>
          frequencies.length < 2 ||
          (core.maxFrequencyKHz !== null && core.maxFrequencyKHz > frequencies[0]!),
      )
      .map((core) => [core.id, core.id]),
  )
}
export function missingCpuSet(text: string, cores: readonly HostCpuCore[]) {
  let ranges = text.trim() ? cpuSet(text) : []
  if (!ranges) return ''
  for (const core of cores) {
    // Remove known identities without enumerating unbounded legacy ranges.
    ranges = ranges.flatMap(([a, b]) =>
      a <= core.id && core.id <= b ? toggleCpu([[a, b]], core.id) : [[a, b]],
    )
  }
  return compactCpuSet(ranges)
}
