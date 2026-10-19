import { ApiError } from './errors'

export const configurationChunkBytes = 48 * 1024

// VM configuration and USB rules share the same bounded upload protocol.
export async function stageConfiguration(
  json: string,
  maximum: number,
  transport: {
    begin(bytes: number): Promise<{ uploadId: string }>
    append(uploadId: string, offset: number, data: string): Promise<{ received: number }>
    abort(uploadId: string): Promise<void>
  },
) {
  const bytes = new TextEncoder().encode(json)
  if (!bytes.length || bytes.length > maximum)
    throw new ApiError('invalid-response', 'Configuration exceeds storage limit')
  const { uploadId } = await transport.begin(bytes.length)
  try {
    for (let offset = 0; offset < bytes.length; offset += configurationChunkBytes) {
      const chunk = bytes.subarray(offset, offset + configurationChunkBytes)
      const result = await transport.append(uploadId, offset, btoa(String.fromCharCode(...chunk)))
      if (result.received !== offset + chunk.length)
        throw new ApiError('invalid-response', 'Invalid upload acknowledgement')
    }
    return uploadId
  } catch (cause) {
    try {
      await transport.abort(uploadId)
    } catch {
      // The bounded lease expires if cleanup cannot reach its owner.
    }
    throw cause
  }
}
