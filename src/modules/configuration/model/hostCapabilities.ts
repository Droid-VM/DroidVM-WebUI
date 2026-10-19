import type { HostDevices } from '../../resources'
import type { MessageKey } from '../../../shared/i18n'
import type { ConfigObject } from './document'
import { fieldText, getPath } from './document'
import { graphicsInactive, graphicsValue } from './graphics'

export function hostCapabilityHints(
  row: ConfigObject,
  host: HostDevices,
  section: 'basic' | 'graphics',
): MessageKey[] {
  const hints: MessageKey[] = []
  const lower = (key: string) => fieldText(row[key]).toLowerCase()
  if (section === 'basic') {
    const hypervisor = lower('hypervisor')
    if (
      ['kvm', 'gunyah', 'geniezone'].includes(hypervisor) &&
      host.devices[hypervisor as 'kvm' | 'gunyah' | 'geniezone'] === false
    )
      hints.push('hostHypervisorMissing')
    return hints
  }
  if ((lower('backend') || 'crosvm') !== 'crosvm') return hints
  const gpu = getPath(row, ['screens', 'gpu-0', 'enabled']) === true
  const provider = fieldText(
    graphicsValue({ path: ['gpu_provider'], label: 'configGpuProvider', type: 'select' }, row),
  ).toLowerCase()
  const renderer = gpu && ['gpu_gfxstream', 'gpu_virglrenderer'].includes(lower('gpu_backend'))
  const blit = !graphicsInactive(
    { path: ['display_blit_provider'], label: 'configGpuBlit', type: 'select' },
    row,
  )
  if (renderer && provider === 'drm2kgsl' && host.devices.kgsl === false)
    hints.push('hostKgslMissing')
  if (
    ((renderer && provider === 'vk_turnip') ||
      (blit && lower('display_blit_provider') === 'turnip')) &&
    host.devices.turnip === false
  )
    hints.push('hostTurnipMissing')
  // These are display-copy requirements, not general Vulkan rendering requirements.
  if (
    blit &&
    lower('display_blit_provider') === 'system' &&
    host.systemBlit.state === 'known' &&
    host.systemBlit.missingExtensions?.length
  )
    hints.push('hostSystemBlitFallback')
  return hints
}
