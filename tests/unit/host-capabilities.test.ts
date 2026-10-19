import { expect, it, vi } from 'vitest'
import { createResourceGateway } from '../../src/modules/resources/api/http'
import { createResourceCatalog } from '../../src/modules/resources/model/catalog'
import type { HostDevices } from '../../src/modules/resources/api/gateway'
import { hostCapabilityHints } from '../../src/modules/configuration/model/hostCapabilities'

const host: HostDevices = {
  devices: {
    kvm: true,
    gunyah: false,
    geniezone: null,
    kgsl: false,
    turnip: false,
    systemVulkan: true,
  },
  systemBlit: {
    state: 'known',
    missingExtensions: ['VK_EXT_image_drm_format_modifier'],
    checkedAtMs: 1000,
  },
}
it('distinguishes unknown from absence and applies display-copy warnings only to active display copying', () => {
  const row = {
    backend: 'crosvm',
    hypervisor: 'gunyah',
    gpu_backend: 'gpu_virglrenderer',
    gpu_api: 'drm2kgsl',
    display_blit_provider: 'system',
    screens: { 'gpu-0': { enabled: true, exporter: 'native' } },
  }
  const original = JSON.stringify(row)
  expect(hostCapabilityHints(row, host, 'basic')).toEqual(['hostHypervisorMissing'])
  expect(hostCapabilityHints({ ...row, hypervisor: 'geniezone' }, host, 'basic')).toEqual([])
  expect(hostCapabilityHints(row, host, 'graphics')).toEqual([
    'hostKgslMissing',
    'hostSystemBlitFallback',
  ])
  expect(
    hostCapabilityHints(
      { ...row, gpu_api: 'vulkan_system', display_blit_provider: 'off' },
      host,
      'graphics',
    ),
  ).toEqual([])
  expect(
    hostCapabilityHints(
      { ...row, gpu_api: 'vulkan_turnip', display_blit_provider: 'off' },
      host,
      'graphics',
    ),
  ).toEqual(['hostTurnipMissing'])
  expect(hostCapabilityHints({ ...row, screens: {} }, host, 'graphics')).toEqual([])
  expect(
    hostCapabilityHints(
      row,
      {
        ...host,
        devices: { ...host.devices, kgsl: null },
        systemBlit: { state: 'unknown', missingExtensions: null, checkedAtMs: 1000 },
      },
      'graphics',
    ),
  ).toEqual([])
  expect(JSON.stringify(row)).toBe(original)
})
it('validates host context and extension states, resets failed reads, and ignores late responses', async () => {
  const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
  const getJson = vi.fn().mockResolvedValue({ context, ...host })
  let capabilities = ['host.devices.v1']
  const source = createResourceCatalog(
    createResourceGateway({ getJson }, () => ({ context, capabilities, administrator: true })),
  ).host
  expect(await source.refresh()).toBe(true)
  expect(source.data.value).toEqual(host)
  getJson.mockResolvedValue({
    context,
    ...host,
    systemBlit: { ...host.systemBlit, state: 'unknown' },
  })
  expect(await source.refresh()).toBe(false)
  expect(source.problem.value?.code).toBe('invalid-response')
  expect(source.data.value).toBeNull()
  getJson.mockResolvedValue({
    context,
    ...host,
    systemBlit: { state: 'pending', missingExtensions: null, checkedAtMs: null },
  })
  expect(await source.refresh()).toBe(true)
  expect(source.data.value?.systemBlit.state).toBe('pending')
  getJson.mockResolvedValue({ context: { ...context, daemonEpoch: 'changed' }, ...host })
  expect(await source.refresh()).toBe(false)
  expect(source.problem.value?.code).toBe('context-changed')
  let resolve!: (value: unknown) => void
  getJson.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const late = source.refresh()
  source.reset()
  resolve({ context, ...host })
  expect(await late).toBe(false)
  expect(source.data.value).toBeNull()
  capabilities = []
  expect(await source.refresh()).toBe(false)
  expect(source.status.value).toBe('idle')
})
