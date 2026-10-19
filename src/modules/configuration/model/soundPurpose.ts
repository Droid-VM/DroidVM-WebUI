import type { MessageKey } from '../../../shared/i18n'

export type SoundAttribute = 'usage' | 'content' | 'preset'
interface SoundChoice {
  value: string
  label: MessageKey
}
// Keep values and order aligned with the App's SoundPurpose / AAudio names.
export const soundChoices: Record<SoundAttribute, readonly SoundChoice[]> = {
  usage: [
    { value: 'media', label: 'soundUsageMedia' },
    { value: 'voice_communication', label: 'soundUsageCall' },
    { value: 'voice_communication_signalling', label: 'soundUsageSignalling' },
    { value: 'game', label: 'soundUsageGame' },
    { value: 'alarm', label: 'soundUsageAlarm' },
    { value: 'notification', label: 'soundUsageNotification' },
    { value: 'notification_ringtone', label: 'soundUsageRingtone' },
    { value: 'notification_event', label: 'soundUsageEvent' },
    { value: 'assistant', label: 'soundUsageAssistant' },
    { value: 'assistance_accessibility', label: 'soundUsageAccessibility' },
    { value: 'assistance_navigation_guidance', label: 'soundUsageNavigation' },
    { value: 'assistance_sonification', label: 'soundUsageInterface' },
  ],
  content: [
    { value: 'speech', label: 'soundContentSpeech' },
    { value: 'music', label: 'soundContentMusic' },
    { value: 'movie', label: 'soundContentMovie' },
    { value: 'sonification', label: 'soundContentEffects' },
  ],
  preset: [
    { value: 'generic', label: 'soundPresetGeneric' },
    { value: 'camcorder', label: 'soundPresetCamcorder' },
    { value: 'voice_recognition', label: 'soundPresetRecognition' },
    { value: 'voice_communication', label: 'soundPresetCall' },
    { value: 'unprocessed', label: 'soundPresetUnprocessed' },
    { value: 'voice_performance', label: 'soundPresetPerformance' },
  ],
}
export const soundTitles: Record<SoundAttribute, MessageKey> = {
  usage: 'soundPurposeUsage',
  content: 'soundPurposeContent',
  preset: 'soundPurposePreset',
}
export const soundAttributes = (input: boolean): SoundAttribute[] =>
  input ? ['preset'] : ['usage', 'content']

function parts(key: string): string[] {
  const marker = key.indexOf('#')
  return marker < 0 ? [] : key.slice(marker + 1).split(',')
}
function name(pair: string): string {
  const equals = pair.indexOf('=')
  return equals > 0 ? pair.slice(0, equals).trim() : ''
}
export function soundValue(key: string, attribute: SoundAttribute): string {
  const pair = parts(key).find((pair) => name(pair) === attribute)
  return pair === undefined ? '' : pair.slice(pair.indexOf('=') + 1).trim()
}
export function withSoundValue(key: string, attribute: SoundAttribute, value: string): string {
  // Unknown existing values are displayable, but cannot be created by this editor.
  if (value && !soundChoices[attribute].some((choice) => choice.value === value))
    throw new Error('Unsupported sound purpose')
  const marker = key.indexOf('#')
  const device = (marker < 0 ? key : key.slice(0, marker)) || 'DEFAULT|system default'
  // Preserve other attributes and opaque fragments verbatim. Remove all occurrences
  // of the edited attribute so resetting it cannot uncover a stale duplicate.
  const remaining = parts(key).filter((pair) => name(pair) !== attribute)
  if (value) remaining.push(`${attribute}=${value}`)
  const suffix = remaining.join(',')
  return suffix ? `${device}#${suffix}` : device
}
