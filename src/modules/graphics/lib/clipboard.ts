export type ClipboardMode = 'unavailable' | 'latin1' | 'utf8'
export type ClipboardSendResult = 'sent' | 'unavailable' | 'too-large' | 'encoding' | 'invalid'
export const CLIPBOARD_LIMIT = 65536

/** Validate without allocating an encoded copy of untrusted clipboard text. */
export function validateClipboard(
  text: string,
  mode: ClipboardMode,
): Exclude<ClipboardSendResult, 'sent'> | null {
  if (mode === 'unavailable') return 'unavailable'
  if (text.length > CLIPBOARD_LIMIT) return 'too-large'
  let bytes = 0
  let latin1 = true
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code === 0) return 'invalid'
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++index)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return 'invalid'
      bytes += 4
    } else if (code >= 0xdc00 && code <= 0xdfff) return 'invalid'
    else bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3
    if (code > 255) latin1 = false
    if (bytes > CLIPBOARD_LIMIT) return 'too-large'
  }
  return mode === 'latin1' && !latin1 ? 'encoding' : null
}
