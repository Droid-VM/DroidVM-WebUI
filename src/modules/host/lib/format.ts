export function formatHostBytes(value: string | null | undefined, locale: string): string {
  if (value === null || value === undefined) return '—'
  const bytes = BigInt(value),
    units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB']
  let factor = 1n,
    index = 0
  while (index < units.length - 1 && bytes >= factor * 1024n) {
    factor *= 1024n
    index++
  }
  const tenths = (bytes * 10n + factor / 2n) / factor
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: index ? 1 : 0 }).format(Number(tenths) / 10)} ${units[index]}`
}
export function usedBytes(
  total: string | null | undefined,
  free: string | null | undefined,
): string | null {
  if (total == null || free == null) return null
  return (BigInt(total) - BigInt(free)).toString()
}
export function usedPercent(
  total: string | null | undefined,
  free: string | null | undefined,
): number | null {
  if (total == null || free == null || BigInt(total) === 0n) return null
  return Number(((BigInt(total) - BigInt(free)) * 1000n) / BigInt(total)) / 10
}
