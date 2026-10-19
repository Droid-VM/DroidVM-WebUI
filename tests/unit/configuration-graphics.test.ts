import { expect, it } from 'vitest'
import { parse } from 'lossless-json'
import {
  graphicsInactive,
  graphicsIssues,
  graphicsSections,
  graphicsValue,
  gpuCoreOverlap,
  normalizeGraphics,
} from '../../src/modules/configuration/model/graphics'
import { encodeDocument, type ConfigObject } from '../../src/modules/configuration/model/document'
import type { ConfigField } from '../../src/modules/configuration/model/fields'

const field = (key: string): ConfigField => ({
  path: [key],
  label: 'configGpuMode',
  type: 'select',
})
const row = (): ConfigObject => ({
  screens: { 'gpu-0': { enabled: true } },
  gpu_backend: 'gpu_virglrenderer',
  gpu_api: 'DRM2KGSL',
  protected_vm: 'protected_without_firmware',
})

it('projects legacy rendering without migration and synchronizes the actual native gpu_api when the renderer changes', () => {
  const vm = row()
  const before = encodeDocument(vm)
  expect(graphicsValue(field('gpu_mode'), vm)).toBe('native')
  expect(graphicsValue(field('gpu_provider'), vm)).toBe('drm2kgsl')
  graphicsSections(vm)
  expect(encodeDocument(vm)).toBe(before)
  vm.gpu_backend = 'gpu_gfxstream'
  normalizeGraphics(vm, 'gpu_backend')
  expect([vm.gpu_mode, vm.gpu_provider, vm.gpu_api]).toEqual([
    'vulkan',
    'vk_turnip',
    'vulkan_turnip',
  ])
  vm.gpu_provider = 'vk_system'
  normalizeGraphics(vm, 'gpu_provider')
  expect(vm.gpu_api).toBe('vulkan_system')
  vm.gpu_backend = 'gpu_2d'
  normalizeGraphics(vm, 'gpu_backend')
  expect([vm.gpu_mode, vm.gpu_provider, vm.gpu_api]).toEqual(['none', 'none', 'none'])
  vm.gpu_backend = 'gpu_virglrenderer'
  normalizeGraphics(vm, 'gpu_backend')
  expect([vm.gpu_mode, vm.gpu_provider, vm.gpu_api]).toEqual(['native', 'drm2kgsl', 'drm2kgsl'])
  vm.gpu_mode = 'opengl'
  expect(graphicsIssues(vm).gpu_mode).toBe('configGpuCombinationInvalid')
  vm.gpu_mode = 'future'
  vm.gpu_provider = 'future'
  expect(graphicsValue(field('gpu_mode'), vm)).toBe('future')
  vm.gpu_api = 'constructor'
  delete vm.gpu_mode
  expect(graphicsValue(field('gpu_mode'), vm)).toBeUndefined()
})

it('enforces guest growth bounds and writes the fully preallocated parameters consumed by the native launcher', () => {
  const vm = row()
  Object.assign(vm, {
    gpu_guest_pool_mb: parse('1024'),
    gpu_guest_prealloc_mb: 2048,
    gpu_guest_step_mb: 3,
    gpu_dynamic_vram: true,
  })
  expect(graphicsIssues(vm)).toMatchObject({
    gpu_guest_prealloc_mb: 'configGpuPreallocExceeds',
    gpu_guest_step_mb: 'configGpuStepInvalid',
  })
  vm.gpu_guest_prealloc_mb = 1024
  vm.gpu_guest_step_mb = 4
  expect(graphicsIssues(vm).gpu_guest_prealloc_mb).toBe('configGpuGrowthRoom')
  vm.gpu_dynamic_vram = false
  const result = normalizeGraphics(vm, 'gpu_dynamic_vram')
  expect(result.resetInputs).toContain('gpu_guest_step_mb')
  expect(encodeDocument(vm)).toContain('"gpu_guest_prealloc_mb":1024')
  expect(String(vm.gpu_guest_step_mb)).toBe('0')
  expect(String(vm.gpu_guest_max_grants)).toBe('0')
  expect(graphicsIssues(vm)).toEqual({})
  vm.protected_vm = 'pseudo_unprotected'
  expect(graphicsInactive(field('gpu_guest_pool_mb'), vm)).toBe(true)
  expect(encodeDocument(vm)).toContain('"gpu_guest_pool_mb":1024')
  vm.gpu_backend = 'gpu_gfxstream'
  vm.gpu_udmabuf = false
  vm.gpu_dynamic_vram = true
  expect(graphicsInactive(field('gpu_vram_quota_mb'), vm)).toBe(false)
  expect(graphicsInactive(field('gpu_guest_step_mb'), vm)).toBe(true)
})

it('requires a CPU set for realtime scheduling, clears it on explicit unbinding, and checks overlap without expanding ranges', () => {
  const vm = row()
  Object.assign(vm, {
    gpu_rt_prio: '97',
    gpu_cgroup_enabled: false,
    extension: parse('18446744073709551615'),
  })
  expect(graphicsIssues(vm).gpu_rt_prio).toBe('configGpuRtNeedsCores')
  vm.gpu_cgroup_enabled = true
  vm.gpu_cgroup_path = ' relative '
  vm.gpu_cgroup_cpus = '0-2147483647'
  vm.cpu_affinity = '0=1:1=4-7'
  expect(gpuCoreOverlap(vm)).toBe(true)
  expect(graphicsIssues(vm)).toEqual({ gpu_cgroup_path: 'configGpuCgroupPathInvalid' })
  vm.gpu_cgroup_path = '/dev/cpuset/gpuworker'
  expect(graphicsIssues(vm)).toEqual({})
  vm.gpu_cgroup_enabled = false
  normalizeGraphics(vm, 'gpu_cgroup_enabled')
  expect(vm.gpu_rt_prio).toBe('')
  expect(vm.gpu_cgroup_cpus).toBe('0-2147483647')
  expect(encodeDocument(vm)).toContain('18446744073709551615')
})
