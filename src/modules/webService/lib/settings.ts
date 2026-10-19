import type { components } from '../../../generated/api'

export type WebServiceSettings = components['schemas']['WebServiceSettings']
export interface WebServiceDraft {
  enabled: boolean
  port: string
  scope: 'lan' | 'all'
  origins: string
  lanAutoLogin: boolean
}
export function validWebOrigin(value: string) {
  if (!value.startsWith('http://') || value.length < 8 || value.length > 262) return false
  return ![...value.slice(7)].some(
    (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) >= 127 || '/\\@?#'.includes(char),
  )
}
export function sameWebSettings(a: WebServiceSettings, b: WebServiceSettings) {
  return (
    a.enabled === b.enabled &&
    a.port === b.port &&
    a.scope === b.scope &&
    (a.lanAutoLogin ?? false) === (b.lanAutoLogin ?? false) &&
    a.publicOrigins.length === b.publicOrigins.length &&
    a.publicOrigins.every((origin, index) => origin === b.publicOrigins[index])
  )
}
export function cloneWebSettings(value: WebServiceSettings): WebServiceSettings {
  return { ...value, publicOrigins: [...value.publicOrigins] }
}
export function webServiceDraft(settings?: WebServiceSettings): WebServiceDraft {
  return {
    enabled: settings?.enabled ?? false,
    port: String(settings?.port ?? 8080),
    scope: settings?.scope ?? 'lan',
    origins: settings?.publicOrigins.join('\n') ?? '',
    lanAutoLogin: settings?.lanAutoLogin ?? false,
  }
}
export function parseWebSettings(draft: WebServiceDraft): WebServiceSettings | null {
  if (!/^[0-9]{4,5}$/.test(draft.port)) return null
  const port = Number(draft.port),
    publicOrigins = draft.origins.split(/\r?\n/).filter((value) => value.length > 0)
  if (
    port < 1024 ||
    port > 65535 ||
    publicOrigins.length > 8 ||
    publicOrigins.some((origin) => !validWebOrigin(origin)) ||
    (draft.scope !== 'lan' && draft.scope !== 'all')
  )
    return null
  // Keep exact origins, including duplicates and explicit :80, as the native service does.
  return {
    enabled: draft.enabled,
    port,
    scope: draft.scope,
    publicOrigins,
    lanAutoLogin: draft.lanAutoLogin,
  }
}
