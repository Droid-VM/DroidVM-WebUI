import type { MessageKey } from '../../../shared/i18n'
import { cpuSet } from './basic'
import { cloneConfiguration, fieldText, getPath, object, type ConfigObject } from './document'
import type { ConfigField } from './fields'
import { screenIds } from './screens'

const token = (row: ConfigObject, key: string) => fieldText(row[key]).toLowerCase()
const gpuEnabled = (row: ConfigObject) => getPath(row, ['screens', 'gpu-0', 'enabled']) === true
const legacyModes: Record<string, string> = {
  egl: 'opengl',
  opengles: 'opengl',
  angle: 'opengl',
  drm2kgsl: 'native',
  vulkan: 'vulkan',
  vulkan_system: 'vulkan',
  vulkan_turnip: 'vulkan',
  vulkan_panvk: 'vulkan',
}
const legacyProviders: Record<string, string> = {
  egl: 'egl',
  opengles: 'gles',
  angle: 'gles',
  drm2kgsl: 'drm2kgsl',
  vulkan: 'vk_turnip',
  vulkan_system: 'vk_system',
  vulkan_turnip: 'vk_turnip',
  vulkan_panvk: 'vk_panvk',
}
const providerApis: Record<string, string> = {
  egl: 'egl',
  gles: 'opengles',
  drm2kgsl: 'drm2kgsl',
  vk_system: 'vulkan_system',
  vk_turnip: 'vulkan_turnip',
  vk_panvk: 'vulkan_panvk',
}
const lookup = (table: Record<string, string>, key: string) =>
  Object.hasOwn(table, key) ? table[key] : undefined
// Read-only projection for pre-split configs. Merely opening the tab does not migrate them.
export function graphicsValue(field: ConfigField, row: ConfigObject): unknown {
  const value = getPath(row, field.path)
  if (field.path.length !== 1) return value
  const key = field.path[0]!
  if (key !== 'gpu_mode' && key !== 'gpu_provider') return value
  if (value !== undefined && token(row, key) !== 'none') return value
  return lookup(key === 'gpu_mode' ? legacyModes : legacyProviders, token(row, 'gpu_api')) ?? value
}
const mode = (row: ConfigObject) =>
  fieldText(
    graphicsValue({ path: ['gpu_mode'], label: 'configGpuMode', type: 'select' }, row),
  ).toLowerCase()
const provider = (row: ConfigObject) =>
  fieldText(
    graphicsValue({ path: ['gpu_provider'], label: 'configGpuProvider', type: 'select' }, row),
  ).toLowerCase()
function allocation(row: ConfigObject) {
  const backend = token(row, 'gpu_backend')
  const gfxstream = backend === 'gpu_gfxstream'
  const drm = backend === 'gpu_virglrenderer' && mode(row) === 'native'
  const venus = backend === 'gpu_virglrenderer' && mode(row) === 'vulkan'
  const guest = drm || venus || (gfxstream && row.gpu_udmabuf !== false)
  const host = gfxstream && row.gpu_udmabuf === false
  const protectedRam = !['protected_normal', 'pseudo_unprotected'].includes(
    token(row, 'protected_vm'),
  )
  return { gfxstream, drm, venus, guest, host, guestPool: guest && protectedRam }
}
function blitBinding(row: ConfigObject) {
  return screenIds.some((id) => {
    const screen = getPath(row, ['screens', id])
    return (
      object(screen) &&
      screen.enabled === true &&
      (token(screen, 'exporter') === 'native' ||
        (['vnc', 'webrtc'].includes(token(screen, 'exporter')) &&
          token(screen, 'transport_cap') !== 'cpu'))
    )
  })
}
const modes = (row: ConfigObject) =>
  token(row, 'gpu_backend') === 'gpu_gfxstream' ? ['vulkan'] : ['native', 'opengl', 'vulkan']
const providers = (row: ConfigObject) =>
  mode(row) === 'native'
    ? ['drm2kgsl']
    : mode(row) === 'opengl'
      ? ['egl', 'gles']
      : ['vk_turnip', 'vk_panvk', 'vk_system']

export function graphicsInactive(field: ConfigField, row: ConfigObject): boolean {
  if (field.path.length !== 1) return false
  const key = field.path[0]!
  const alloc = allocation(row)
  if (key === 'display_blit_provider') return !blitBinding(row)
  if (key === 'gpu_cgroup_enabled' || key === 'vpu_enabled') return false
  if (key === 'gpu_cgroup_path' || key === 'gpu_cgroup_cpus') return row.gpu_cgroup_enabled !== true
  if (key === 'vpu_host_pool_mb') return row.vpu_enabled !== true
  if (key === 'vpu_guest_pool_mb')
    return (
      row.vpu_enabled !== true ||
      !['protected_protected', 'protected_without_firmware'].includes(token(row, 'protected_vm'))
    )
  if (!key.startsWith('gpu_')) return false
  if (!gpuEnabled(row)) return true
  switch (key) {
    case 'gpu_backend':
    case 'gpu_rt_prio':
      return false
    case 'gpu_mode':
    case 'gpu_provider':
      return !['gpu_gfxstream', 'gpu_virglrenderer'].includes(token(row, 'gpu_backend'))
    case 'gpu_udmabuf':
    case 'gpu_host_pool_mb':
      return !alloc.gfxstream
    case 'gpu_drm2kgsl_pool_mb':
      return !alloc.drm
    case 'gpu_venus_pool_mb':
      return !alloc.venus
    case 'gpu_guest_pool_mb':
      return !alloc.guestPool
    case 'gpu_dynamic_vram':
      return !alloc.host && !alloc.guestPool
    case 'gpu_guest_prealloc_mb':
    case 'gpu_guest_step_mb':
    case 'gpu_guest_max_grants':
      return !alloc.guestPool || row.gpu_dynamic_vram !== true
    case 'gpu_vram_quota_mb':
    case 'gpu_vram_folio_threshold_kb':
    case 'gpu_pool_blob_max_kb':
      return !alloc.host || row.gpu_dynamic_vram !== true
    default:
      return false
  }
}

// Called only after an explicit edit. Native launch still consumes gpu_api, and the
// guest-pool launcher consumes growth values even when the UI's dynamic switch is off.
export function normalizeGraphics(
  row: ConfigObject,
  changed: string,
): { adjusted: boolean; resetInputs: string[] } {
  let adjusted = false
  const resetInputs: string[] = []
  const set = (key: string, value: unknown) => {
    resetInputs.push(key)
    if (fieldText(row[key]) === fieldText(value)) return
    row[key] = cloneConfiguration(value)
    adjusted = true
  }
  if (['gpu_cgroup_path', 'gpu_cgroup_cpus'].includes(changed) && typeof row[changed] === 'string')
    set(changed, row[changed].trim())
  if (['gpu_backend', 'gpu_mode', 'gpu_provider'].includes(changed)) {
    const backend = token(row, 'gpu_backend')
    if (backend === 'gpu_2d') {
      set('gpu_mode', 'none')
      set('gpu_provider', 'none')
      set('gpu_api', 'none')
    } else if (['gpu_gfxstream', 'gpu_virglrenderer'].includes(backend)) {
      const selectedMode = mode(row)
      set(
        'gpu_mode',
        modes(row)
          .filter((value) => value !== 'opengl')
          .includes(selectedMode)
          ? selectedMode
          : modes(row)[0]!,
      )
      const selectedProvider = provider(row)
      set(
        'gpu_provider',
        providers(row)
          .filter((value) => value !== 'vk_panvk')
          .includes(selectedProvider)
          ? selectedProvider
          : providers(row)[0]!,
      )
      set('gpu_api', lookup(providerApis, token(row, 'gpu_provider')) ?? 'none')
    }
  }
  if (
    ['gpu_cgroup_enabled', 'gpu_cgroup_cpus'].includes(changed) &&
    (row.gpu_cgroup_enabled !== true || !fieldText(row.gpu_cgroup_cpus).trim()) &&
    token(row, 'gpu_rt_prio')
  )
    set('gpu_rt_prio', '')
  if (
    ['gpu_dynamic_vram', 'gpu_guest_pool_mb', 'gpu_backend', 'gpu_mode', 'gpu_udmabuf'].includes(
      changed,
    ) &&
    allocation(row).guest &&
    row.gpu_dynamic_vram === false
  ) {
    // Missing pool means zero in the native launcher. Unknown formats remain untouched.
    const pool = fieldText(row.gpu_guest_pool_mb) || '0'
    if (/^\d+$/.test(pool) && Number(pool) <= 65536) {
      set('gpu_guest_prealloc_mb', row.gpu_guest_pool_mb ?? 0)
      set('gpu_guest_step_mb', 0)
      set('gpu_guest_max_grants', 0)
    }
  }
  return { adjusted, resetInputs }
}

export function graphicsIssues(row: ConfigObject): Record<string, MessageKey> {
  const errors: Record<string, MessageKey> = {}
  const cores = typeof row.gpu_cgroup_cpus === 'string' ? row.gpu_cgroup_cpus.trim() : ''
  if (row.gpu_cgroup_enabled === true) {
    const path = fieldText(row.gpu_cgroup_path).trim()
    if (!path.startsWith('/') || path.includes('\0'))
      errors.gpu_cgroup_path = 'configGpuCgroupPathInvalid'
    if (!cpuSet(cores, 2147483647)) errors.gpu_cgroup_cpus = 'configGpuCoresInvalid'
  }
  if (!gpuEnabled(row)) return errors
  if (['gpu_gfxstream', 'gpu_virglrenderer'].includes(token(row, 'gpu_backend'))) {
    if (
      ['native', 'opengl', 'vulkan'].includes(mode(row)) &&
      (!modes(row).includes(mode(row)) || mode(row) === 'opengl')
    )
      errors.gpu_mode = 'configGpuCombinationInvalid'
    if (
      ['drm2kgsl', 'egl', 'gles', 'vk_turnip', 'vk_system', 'vk_panvk'].includes(provider(row)) &&
      (!providers(row).includes(provider(row)) || provider(row) === 'vk_panvk')
    )
      errors.gpu_provider = 'configGpuCombinationInvalid'
  }
  if (token(row, 'gpu_rt_prio') && (row.gpu_cgroup_enabled !== true || !cpuSet(cores, 2147483647)))
    errors.gpu_rt_prio = 'configGpuRtNeedsCores'
  const alloc = allocation(row)
  if (alloc.guestPool && row.gpu_dynamic_vram === true) {
    const pool = Number(fieldText(row.gpu_guest_pool_mb) || '0')
    const prealloc = Number(fieldText(row.gpu_guest_prealloc_mb) || pool)
    const step = Number(fieldText(row.gpu_guest_step_mb) || '0')
    if (prealloc > pool) errors.gpu_guest_prealloc_mb = 'configGpuPreallocExceeds'
    else if (step > 0 && prealloc >= pool) errors.gpu_guest_prealloc_mb = 'configGpuGrowthRoom'
    if (
      step > 0 &&
      (!Number.isInteger(step) || step < 2 || step > 65536 || !Number.isInteger(Math.log2(step)))
    )
      errors.gpu_guest_step_mb = 'configGpuStepInvalid'
  }
  return errors
}

export function gpuCoreOverlap(row: ConfigObject): boolean {
  if (row.gpu_cgroup_enabled !== true || typeof row.cpu_affinity !== 'string') return false
  const gpu = cpuSet(fieldText(row.gpu_cgroup_cpus), 2147483647)
  if (!gpu) return false
  return row.cpu_affinity.split(':').some((assignment) => {
    const hosts = cpuSet(assignment.split('=')[1] ?? '', 2147483647)
    return hosts?.some(([a, b]) => gpu.some(([c, d]) => a <= d && c <= b)) ?? false
  })
}

const field = (
  key: string,
  label: MessageKey,
  type: ConfigField['type'],
  extra: Partial<ConfigField> = {},
): ConfigField => ({ path: [key], label, type, ...extra })
const memory = (key: string, label: MessageKey, max = 65536) =>
  field(key, label, 'number', { min: 0, max })
export function graphicsSections(
  row: ConfigObject,
): { key: string; label: MessageKey; fields: ConfigField[] }[] {
  return [
    ...(gpuEnabled(row)
      ? [
          {
            key: 'gpu-renderer',
            label: 'configGpuRenderer' as const,
            fields: [
              field('gpu_backend', 'configGpuBackend', 'select', {
                options: ['gpu_2d', 'gpu_gfxstream', 'gpu_virglrenderer'],
                optionLabels: {
                  gpu_2d: 'configGpu2d',
                  gpu_gfxstream: 'configGpuGfxstream',
                  gpu_virglrenderer: 'configGpuVirgl',
                },
              }),
              field('gpu_mode', 'configGpuMode', 'select', {
                options: modes(row),
                disabledOptions: ['opengl'],
                optionLabels: {
                  native: 'configGpuNative',
                  vulkan: 'configGpuVulkan',
                  opengl: 'configGpuGlUnavailable',
                },
              }),
              field('gpu_provider', 'configGpuProvider', 'select', {
                options: providers(row),
                disabledOptions: ['vk_panvk'],
                optionLabels: {
                  drm2kgsl: 'configGpuDrm',
                  vk_turnip: 'configGpuTurnip',
                  vk_system: 'configGpuSystem',
                  vk_panvk: 'configGpuPanvkUnavailable',
                },
              }),
              field('gpu_udmabuf', 'configGpuUdmabuf', 'boolean'),
              memory('gpu_drm2kgsl_pool_mb', 'configGpuDrmPool'),
              memory('gpu_host_pool_mb', 'configGpuHostPool'),
              memory('gpu_venus_pool_mb', 'configGpuVenusPool'),
              memory('gpu_guest_pool_mb', 'configGpuGuestPool'),
              field('gpu_dynamic_vram', 'configGpuDynamic', 'boolean', {
                hint: 'configGpuDynamicHint',
              }),
              memory('gpu_guest_prealloc_mb', 'configGpuPrealloc'),
              memory('gpu_guest_step_mb', 'configGpuStep'),
              memory('gpu_guest_max_grants', 'configGpuMaxGrants'),
              memory('gpu_vram_quota_mb', 'configGpuQuota'),
              memory('gpu_vram_folio_threshold_kb', 'configGpuFolio', 1048576),
              memory('gpu_pool_blob_max_kb', 'configGpuBlob', 1048576),
            ],
          },
        ]
      : []),
    ...(blitBinding(row)
      ? [
          {
            key: 'display-blit',
            label: 'configGpuBlit' as const,
            fields: [
              field('display_blit_provider', 'configGpuBlit', 'select', {
                options: ['turnip', 'panvk', 'system', 'off'],
                disabledOptions: ['panvk'],
                optionLabels: {
                  turnip: 'configGpuTurnip',
                  panvk: 'configGpuPanvkUnavailable',
                  system: 'configGpuSystem',
                  off: 'configTransportCpu',
                },
                hint: 'configGpuBlitHint',
              }),
            ],
          },
        ]
      : []),
    {
      key: 'gpu-worker',
      label: 'configGpuWorker',
      fields: [
        field('gpu_cgroup_enabled', 'configGpuCgroup', 'boolean'),
        field('gpu_cgroup_path', 'configGpuCgroupPath', 'text'),
        field('gpu_cgroup_cpus', 'configGpuCores', 'text', { hint: 'configGpuCoresHint' }),
        field('gpu_rt_prio', 'configGpuRt', 'select', {
          options: ['', '97'],
          optionLabels: { '': 'configGpuRtOff', '97': 'configGpuRtOn' },
          hint: 'configGpuRtHint',
        }),
      ],
    },
    {
      key: 'vpu',
      label: 'configVpu',
      fields: [
        field('vpu_enabled', 'configVpuEnabled', 'boolean', { hint: 'configVpuHint' }),
        memory('vpu_host_pool_mb', 'configVpuHostPool'),
        memory('vpu_guest_pool_mb', 'configVpuGuestPool'),
      ],
    },
  ]
}
