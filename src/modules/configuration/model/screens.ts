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
// crosvm compares ?token= raw, so only URL-safe characters survive the round trip.
export function webrtcTokenValid(text: string): boolean {
  return text.length <= 128 && /^[A-Za-z0-9._~-]*$/.test(text)
}

export function screenInactive(field: ConfigField, row: ConfigObject): boolean {
  if (field.path[0] !== 'screens') return false
  const screen = getPath(row, field.path.slice(0, 2))
  if (!object(screen)) return field.path[2] !== 'enabled' || screen !== undefined
  if (field.path[2] === 'enabled') return false
  if (screen.enabled !== true) return true
  const exporter = token(screen.exporter)
  if (field.path[2] === 'transport_cap') return !['native', 'vnc', 'webrtc'].includes(exporter)
  if (field.path[2] === 'vnc') {
    if (exporter !== 'vnc' || (screen.vnc !== undefined && !object(screen.vnc))) return true
    return field.path[3] === 'password' && getPath(screen, ['vnc', 'password_auth']) !== true
  }
  if (field.path[2] === 'webrtc') {
    if (exporter !== 'webrtc' || (screen.webrtc !== undefined && !object(screen.webrtc)))
      return true
    return field.path[3] === 'token' && getPath(screen, ['webrtc', 'token_auth']) === false
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
    if (exporter === 'webrtc' && token(row.backend) === 'qemu')
      errors[prefix + 'exporter'] = 'configWebrtcCrosvmOnly'
    // VNC and WebRTC listeners draw from one port space.
    const key = exporter === 'vnc' ? 'vnc' : exporter === 'webrtc' ? 'webrtc' : ''
    const listener = key ? screen[key] : undefined
    if (!key || !object(listener)) continue
    const host = listener.host
    if (typeof host === 'string' && !vncHostValid(host))
      errors[prefix + key + '.host'] = 'configVncHostInvalid'
    if (key === 'webrtc') {
      if (listener.token_auth !== false && !webrtcTokenValid(fieldText(listener.token)))
        errors[prefix + 'webrtc.token'] = 'configWebrtcTokenInvalid'
      const bitrate = fieldText(listener.bitrate)
      if (
        bitrate &&
        bitrate !== '0' &&
        (!/^\d+$/.test(bitrate) || Number(bitrate) < 500 || Number(bitrate) > 100000)
      )
        errors[prefix + 'webrtc.bitrate'] = 'configWebrtcBitrateInvalid'
    }
    const port = fieldText(listener.port)
    if (!port || port === '-1') continue // App's unassigned port; resolved at VM start.
    if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
      errors[prefix + key + '.port'] = 'configVncPortInvalid'
      continue
    }
    const normalized = String(Number(port))
    if (ports.has(normalized)) errors[prefix + key + '.port'] = 'configVncPortConflict'
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
      options: ['none', 'native', 'vnc', 'webrtc'],
      hint: 'configExporterHint',
      optionLabels: {
        none: 'configExporterNone',
        native: 'configExporterNative',
        vnc: 'configExporterVnc',
        webrtc: 'configExporterWebrtc',
      },
    }),
    field('transport_cap', 'configTransportCap', 'select', {
      options:
        exporter === 'vnc'
          ? ['cpu', 'gpu', 'gpu-hw']
          : exporter === 'webrtc'
            ? ['cpu', 'gpu-hw']
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
    field('webrtc.host', 'configWebrtcHost', 'text', { hint: 'configVncHostHint' }),
    field('webrtc.port', 'configWebrtcPort', 'number', {
      min: 1024,
      max: 65535,
      emptyValue: -1,
      hint: 'configVncAutoPortHint',
    }),
    field('webrtc.token_auth', 'configWebrtcTokenAuth', 'boolean'),
    field('webrtc.token', 'configWebrtcToken', 'password', { hint: 'configWebrtcTokenHint' }),
    field('webrtc.codec', 'configWebrtcCodec', 'select', {
      options: ['auto', 'h264'],
      optionLabels: { auto: 'configWebrtcCodecAuto', h264: 'configWebrtcCodecH264' },
    }),
    field('webrtc.bitrate', 'configWebrtcBitrate', 'number', {
      min: 0,
      max: 100000,
      emptyValue: 0,
      hint: 'configWebrtcBitrateHint',
    }),
    field('webrtc.adapt', 'configWebrtcAdapt', 'boolean'),
  ]
}
