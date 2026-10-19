// getRandomValues also works on HTTP LAN origins (randomUUID requires HTTPS).
export function newUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 15) | 64
  bytes[8] = (bytes[8]! & 63) | 128
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function newMacAddress() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  bytes[0] = (bytes[0]! | 2) & 254
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(':')
}
