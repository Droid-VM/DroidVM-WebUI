import type { MessageKey } from '../../../shared/i18n'
import { fieldText, getPath, object, type ConfigObject } from './document'
import type { ConfigField } from './fields'

const backend = (row: ConfigObject) => fieldText(row.backend).toLowerCase() || 'crosvm'
const defaults: Record<string, unknown> = {
  cache: 'auto',
  timeout: 5,
  writeback: false,
  posix_acl: true,
  root_access: false,
  readonly: false,
}
// Read-only projection of native command defaults. Opening a share does not
// migrate legacy keys or add defaults to the saved document.
export function storageValue(field: ConfigField, row: ConfigObject): unknown {
  const value = getPath(row, field.path)
  return value === undefined && field.path[0] === 'shared_dirs' && field.path.length === 3
    ? defaults[field.path[2]!]
    : value
}
export function storageInactive(field: ConfigField, row: ConfigObject): boolean {
  if (field.path[0] !== 'shared_dirs') return false
  const key = field.path[2]
  return backend(row) === 'qemu'
    ? ['timeout', 'writeback', 'posix_acl', 'root_access'].includes(key ?? '')
    : backend(row) === 'crosvm' && key === 'readonly'
}
export function storageHint(row: ConfigObject): MessageKey | undefined {
  if (backend(row) === 'qemu') return 'configDirectoryQemuHint'
  if (backend(row) === 'crosvm') return 'configDirectoryCrosvmHint'
  return undefined
}
// App FileUtils.checkFilePath / checkFileName, without a browser-side claim
// that the host path exists. QEMU's unescaped comma-delimited -virtfs also
// requires rejecting commas in its path and tag.
function validPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.endsWith('/') &&
    !/[\\:*?"<>|]/.test(value) &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    !value.includes('//') &&
    !value.split('/').some((part) => part === '.' || part === '..')
  )
}
function validTag(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !/^[.@ ]|[. ]$|[\\/:*?"<>|]/.test(value) &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
}
export function storageIssues(row: ConfigObject): Record<string, MessageKey> {
  const issues: Record<string, MessageKey> = {}
  if (!Array.isArray(row.shared_dirs)) return issues
  const tags = new Set<string>()
  row.shared_dirs.forEach((directory, index) => {
    if (!object(directory)) return
    const at = `shared_dirs.${index}.`
    if (!validPath(directory.path)) issues[at + 'path'] = 'configDirectoryPathInvalid'
    if (!validTag(directory.tag)) issues[at + 'tag'] = 'configDirectoryTagInvalid'
    else if (tags.has(directory.tag)) issues[at + 'tag'] = 'configDirectoryTagDuplicate'
    else tags.add(directory.tag)
    if (backend(row) === 'qemu') {
      for (const key of ['path', 'tag'])
        if (typeof directory[key] === 'string' && directory[key].includes(','))
          issues[at + key] = 'configDirectoryQemuComma'
    } else if (backend(row) === 'crosvm' && directory.timeout !== undefined) {
      const value = fieldText(directory.timeout)
      if (!/^\d+$/.test(value) || BigInt(value) > 9223372036854775807n)
        issues[at + 'timeout'] = 'configInvalid'
    }
  })
  return issues
}
