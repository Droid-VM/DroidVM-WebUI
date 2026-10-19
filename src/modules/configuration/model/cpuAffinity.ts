import { cpuSet } from '../../../shared/lib/cpuSet'

export function affinityRows(value: unknown): Map<number, string> | null {
  if (value === undefined || value === '') return new Map()
  if (typeof value !== 'string') return null
  const result = new Map<number, string>()
  if (!value.trim()) return result
  for (const part of value.split(':')) {
    const match = /^\s*(\d+)\s*=\s*(.+)$/.exec(part)
    if (
      !match ||
      !Number.isSafeInteger(Number(match[1])) ||
      Number(match[1]) > 2147483647 ||
      !cpuSet(match[2]!)
    )
      return null
    result.set(Number(match[1]), match[2]!.trim()) // App/native: last duplicate wins.
  }
  return result
}
export function setCpuAffinity(value: unknown, vcpu: number, cores: string): string | null {
  if (!affinityRows(value) || (cores && !cpuSet(cores))) return null
  // Preserve all untouched assignments, including out-of-count legacy entries.
  const parts =
    typeof value === 'string' && value.trim()
      ? value.split(':').filter((part) => Number(part.split('=')[0]) !== vcpu)
      : []
  if (cores) parts.push(`${vcpu}=${cores}`)
  return parts.join(':')
}
