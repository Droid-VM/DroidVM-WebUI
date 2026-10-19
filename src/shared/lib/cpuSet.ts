export type CpuInterval = [number, number]
// Never expand ranges: a pasted 0-2147483647 must stay bounded in memory.
export function cpuSet(text: string, maximum = 2147483647): CpuInterval[] | null {
  const intervals: CpuInterval[] = []
  for (const part of text.split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part)
    if (!match) return null
    const first = Number(match[1]),
      last = Number(match[2] ?? match[1])
    if (
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(last) ||
      first > last ||
      last > maximum
    )
      return null
    intervals.push([first, last])
  }
  return intervals
}
export function compactCpuSet(ranges: readonly CpuInterval[]): string {
  const merged: CpuInterval[] = []
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const last = merged.at(-1)
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b)
    else merged.push([a, b])
  }
  return merged.map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(',')
}
export function hasCpu(ranges: readonly CpuInterval[], id: number): boolean {
  return ranges.some(([a, b]) => a <= id && id <= b)
}
export function toggleCpu(ranges: readonly CpuInterval[], id: number): CpuInterval[] {
  if (!hasCpu(ranges, id)) return [...ranges, [id, id]]
  return ranges.flatMap(([a, b]): CpuInterval[] => {
    if (id < a || id > b) return [[a, b]]
    const result: CpuInterval[] = []
    if (a < id) result.push([a, id - 1])
    if (id < b) result.push([id + 1, b])
    return result
  })
}
