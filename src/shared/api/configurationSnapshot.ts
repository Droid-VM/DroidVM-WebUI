import { ApiError } from './errors'
import { configurationChunkBytes as chunkBytes } from './stagedUpload'

interface Metadata {
  type: 'metadata'
  bytes: number
}
interface Page<M extends Metadata> {
  snapshotId: string
  total: number
  cursor: { epoch: string; sequence: string }
  next: number | null
  items: (M | { type: 'chunk'; offset: number; data: string })[]
}
// VM and network documents use the same TaskService fixed-snapshot protocol.
// The caller validates the domain contract and session on every page.
export async function readConfigurationSnapshot<M extends Metadata>(
  epoch: string,
  maximum: number,
  read: (snapshotId: string | null, offset: number) => Promise<Page<M>>,
  release: (snapshotId: string) => Promise<void>,
): Promise<{ json: string; metadata: M }> {
  const invalid = () => new ApiError('invalid-response', 'Invalid configuration snapshot')
  let page = await read(null, 0)
  const { snapshotId, total, cursor } = page
  try {
    if (
      cursor.epoch !== epoch ||
      !/^\d+$/.test(cursor.sequence) ||
      BigInt(cursor.sequence) > 18446744073709551615n
    )
      throw invalid()
    let metadata: M | undefined,
      bytes: Uint8Array | undefined,
      offset = 0,
      seen = 0
    for (;;) {
      if (
        page.snapshotId !== snapshotId ||
        page.total !== total ||
        page.cursor.epoch !== cursor.epoch ||
        page.cursor.sequence !== cursor.sequence ||
        !page.items.length
      )
        throw invalid()
      for (const row of page.items) {
        if (seen++ === 0) {
          if (
            row.type !== 'metadata' ||
            !Number.isSafeInteger(row.bytes) ||
            row.bytes < 1 ||
            row.bytes > maximum ||
            total !== 1 + Math.ceil(row.bytes / chunkBytes)
          )
            throw invalid()
          metadata = row
          bytes = new Uint8Array(row.bytes)
        } else {
          if (row.type !== 'chunk' || !bytes || row.offset !== offset) throw invalid()
          let raw: string
          try {
            raw = atob(row.data)
          } catch {
            throw invalid()
          }
          if (btoa(raw) !== row.data || raw.length !== Math.min(chunkBytes, bytes.length - offset))
            throw invalid()
          bytes.set(
            Uint8Array.from(raw, (c) => c.charCodeAt(0)),
            offset,
          )
          offset += raw.length
        }
      }
      if (seen > total) throw invalid()
      if (page.next === null) break
      if (page.next !== seen || seen >= total) throw invalid()
      page = await read(snapshotId, seen)
    }
    if (!metadata || !bytes || seen !== total || offset !== bytes.length) throw invalid()
    let json: string
    try {
      json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw invalid()
    }
    return { json, metadata }
  } finally {
    await release(snapshotId)
  }
}
