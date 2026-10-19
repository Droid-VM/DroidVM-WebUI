// Available on HTTP LAN origins, where crypto.randomUUID may be unavailable.
export function requestId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
