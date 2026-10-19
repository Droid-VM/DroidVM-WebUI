import type { MessageKey } from '../../../shared/i18n'
import { fieldText, getPath, object, type ConfigObject } from './document'
import type { ConfigField } from './fields'
import { ipLiteral } from './ip'

export const screenIds = ['gpu-0', 'simplefb'] as const
const token = (value: unknown) => fieldText(value).toLowerCase()

// Same literal grammar as App VncHostOptions; never resolve names or accept URL syntax.
export function vncHostValid(text: string): boolean {
  return !text || ipLiteral(text) !== null
}

export function screenInactive(field: ConfigField, row: ConfigObject): boolean {
  if (field.path[0] !== 'screens') return false
  const screen = getPath(row, field.path.slice(0, 2))
  if (!object(screen)) return field.path[2] !== 'enabled' || screen !== undefined
  if (field.path[2] === 'enabled') return false
  if (screen.enabled !== true) return true
  const exporter = token(screen.exporter)
  if (field.path[2] === 'transport_cap') return !['native', 'vnc'].includes(exporter)
  if (field.path[2] === 'vnc') {
    if (exporter !== 'vnc' || (screen.vnc !== undefined && !object(screen.vnc))) return true
    return field.path[3] === 'password' && getPath(screen, ['vnc', 'password_auth']) !== true
  }
  return false
}

export function screenIssues(row: ConfigObject): Record<string, MessageKey> {
  const errors: Record<string, MessageKey> = {}
  const ports = new Set<string>()
  for (const id of screenIds) {
    const screen = getPath(row, ['screens', id])
    if (!object(screen) || screen.enabled !== true) continue
    const prefix = `screens.${id}.`
    const exporter = token(screen.exporter)
    if (exporter === 'native' && token(row.backend) === 'qemu')
      errors[prefix + 'exporter'] = 'configNativeCrosvmOnly'
    if (exporter !== 'vnc' || !object(screen.vnc)) continue
    const host = screen.vnc.host
    if (typeof host === 'string' && !vncHostValid(host))
      errors[prefix + 'vnc.host'] = 'configVncHostInvalid'
    const port = fieldText(screen.vnc.port)
    if (!port || port === '-1') continue // App's unassigned port; resolved at VM start.
    if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
      errors[prefix + 'vnc.port'] = 'configVncPortInvalid'
      continue
    }
    const normalized = String(Number(port))
    if (ports.has(normalized)) errors[prefix + 'vnc.port'] = 'configVncPortConflict'
    ports.add(normalized)
  }
  return errors
}

export function screenFields(id: string, row: ConfigObject): ConfigField[] {
  const exporter = token(getPath(row, ['screens', id, 'exporter']))
  const field = (
    key: string,
    label: MessageKey,
    type: ConfigField['type'] = 'text',
    extra: Partial<ConfigField> = {},
  ): ConfigField => ({ path: ['screens', id, ...key.split('.')], label, type, ...extra })
  return [
    field('enabled', 'configScreenEnabled', 'boolean'),
    field('exporter', 'configDisplayExporter', 'select', {
      options: ['none', 'native', 'vnc'],
      hint: 'configExporterHint',
      optionLabels: {
        none: 'configExporterNone',
        native: 'configExporterNative',
        vnc: 'configExporterVnc',
      },
    }),
    field('transport_cap', 'configTransportCap', 'select', {
      options:
        exporter === 'vnc'
          ? ['cpu', 'gpu', 'gpu-hw']
          : exporter === 'native'
            ? id === 'gpu-0'
              ? ['cpu', 'gpu', 'zero']
              : ['cpu', 'gpu']
            : [],
      disabledOptions: ['zero'],
      optionLabels: {
        cpu: 'configTransportCpu',
        gpu: 'configTransportGpu',
        zero: 'configTransportZero',
        'gpu-hw': 'configTransportHardware',
      },
      hint: 'configTransportHint',
    }),
    field('input_enabled', 'configScreenInput', 'boolean'),
    field('width', 'configScreenWidth', 'number', { min: 320, max: 8192 }),
    field('height', 'configScreenHeight', 'number', { min: 320, max: 8192 }),
    ...(id === 'gpu-0'
      ? [
          field('refresh_rate', 'configScreenRefresh', 'number', { min: 1, max: 400 }),
          field('dpi_h', 'configScreenDpiH', 'number', { min: 100, max: 800 }),
          field('dpi_v', 'configScreenDpiV', 'number', { min: 100, max: 800 }),
        ]
      : [field('poll_hz', 'configScreenPoll', 'number', { min: 1, max: 240 })]),
    field('vnc.host', 'configVncHost', 'text', { hint: 'configVncHostHint' }),
    field('vnc.port', 'configVncPort', 'number', {
      min: 1024,
      max: 65535,
      emptyValue: -1,
      hint: 'configVncAutoPortHint',
    }),
    field('vnc.password_auth', 'configVncPasswordAuth', 'boolean'),
    field('vnc.password', 'configVncPassword', 'password'),
  ]
}
