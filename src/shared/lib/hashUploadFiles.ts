import { sha256 } from '@noble/hashes/sha2.js'
import { uploadChunkBytes } from './uploadFiles'

// Works on ordinary HTTP origins without SubtleCrypto. Only a bounded slice is
// held in memory, and yielding between slices keeps pause/navigation responsive.
export async function hashUploadFiles(files: readonly File[], signal: AbortSignal) {
  const result: string[] = []
  for (const file of files) {
    const hash = sha256.create()
    try {
      signal.throwIfAborted()
      for (let offset = 0; offset < file.size; offset += uploadChunkBytes) {
        signal.throwIfAborted()
        const end = Math.min(file.size, offset + uploadChunkBytes)
        const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer())
        signal.throwIfAborted()
        if (bytes.length !== end - offset) throw new Error('File changed while hashing')
        hash.update(bytes)
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
      signal.throwIfAborted()
      result.push(Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join(''))
    } finally {
      hash.destroy()
    }
  }
  return result
}
