import { browserUploadFiles } from '../../../shared/lib/uploadFiles'
export { uploadChunkBytes as packageChunkBytes, encodeChunk } from '../../../shared/lib/uploadFiles'

export function uploadFiles(files: readonly File[]) {
  const metadata = browserUploadFiles(files)
  if (!metadata) return null
  const main = files.filter((file) => file.name.endsWith('.vmpkg'))
  if (main.length !== 1) return null
  const names = new Set(files.map((file) => file.name))
  for (let index = 1; index < files.length; index++)
    if (!names.has(`${main[0]!.name}.${String(index).padStart(3, '0')}`)) return null
  return metadata
}

export function packageDownloadHref(id: string, index: number) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !Number.isSafeInteger(index) || index < 0)
    return undefined
  return `/api/v1/package-downloads/${encodeURIComponent(id)}/files/${index}`
}
