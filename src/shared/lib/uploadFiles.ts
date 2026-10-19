export const uploadChunkBytes = 262144
export interface UploadFile {
  name: string
  sizeBytes: string
}
export function validUploadName(name: string) {
  return (
    !!name &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\') &&
    new TextEncoder().encode(name).length <= 255 &&
    ![...name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
}
export function browserUploadFiles(files: readonly File[], maxFiles = 1000): UploadFile[] | null {
  if (
    !files.length ||
    files.length > maxFiles ||
    new Set(files.map((file) => file.name)).size !== files.length
  )
    return null
  if (
    files.some(
      (file) => !validUploadName(file.name) || !Number.isSafeInteger(file.size) || file.size < 0,
    )
  )
    return null
  return files.map((file) => ({ name: file.name, sizeBytes: String(file.size) }))
}
export async function encodeChunk(file: File, offset: number, end: number) {
  const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer())
  if (bytes.byteLength !== end - offset) throw new Error('File changed while reading')
  let binary = ''
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
  return btoa(binary)
}
