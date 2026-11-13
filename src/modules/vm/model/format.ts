type NumberFormat = (value: number, options: Intl.NumberFormatOptions) => string

// The App shows "4 GiB" / "512 MiB" rather than raw MiB counts.
export function formatVmMemory(mib: number, n: NumberFormat): string {
  if (mib < 1024) return `${n(mib, { maximumFractionDigits: 0 })} MiB`
  return `${n(mib / 1024, { maximumFractionDigits: 1 })} GiB`
}
