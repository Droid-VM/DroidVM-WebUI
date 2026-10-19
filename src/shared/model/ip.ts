// Literal-only parsing shared by VNC and static lease validation. No DNS or URL syntax.
function ipv4(text: string): bigint | null {
  const parts = text.split('.')
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255))
    return null
  return parts.reduce((value, part) => (value << 8n) | BigInt(part), 0n)
}

export function ipLiteral(text: string): { bits: 32 | 128; value: bigint } | null {
  const v4 = ipv4(text)
  if (v4 !== null) return { bits: 32, value: v4 }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const words: bigint[][] = []
  for (const [index, half] of halves.entries()) {
    const values: bigint[] = []
    const groups = half ? half.split(':') : []
    for (const [position, group] of groups.entries()) {
      if (group.includes('.')) {
        const tail = ipv4(group)
        if (index !== halves.length - 1 || position !== groups.length - 1 || tail === null)
          return null
        values.push(tail >> 16n, tail & 65535n)
      } else {
        if (!/^[\da-f]{1,4}$/i.test(group)) return null
        values.push(BigInt('0x' + group))
      }
    }
    words.push(values)
  }
  const count = words.flat().length
  if (halves.length === 2 ? count >= 8 : count !== 8) return null
  const expanded =
    halves.length === 2
      ? [...words[0]!, ...Array<bigint>(8 - count).fill(0n), ...words[1]!]
      : words[0]!
  return { bits: 128, value: expanded.reduce((value, part) => (value << 16n) | part, 0n) }
}

export function addressRange(cidr: string | null, bits: 32 | 128) {
  if (!cidr) return null
  const parts = cidr.trim().split('/')
  if (parts.length !== 2 || !/^\d{1,3}$/.test(parts[1]!)) return null
  const ip = ipLiteral(parts[0]!),
    prefix = Number(parts[1])
  if (!ip || ip.bits !== bits || prefix > bits) return null
  const size = 1n << BigInt(bits - prefix)
  return { maximum: size - (bits === 32 ? 2n : 1n), gateway: ip.value & (size - 1n) }
}
