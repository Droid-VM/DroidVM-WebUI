export function validHostPath(value: string, directory = false) {
  if (
    !value.startsWith('/') ||
    value.length > 4096 ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    return false
  if (directory) return true
  const name = value.slice(value.lastIndexOf('/') + 1)
  return !!name && name !== '.' && name !== '..'
}
