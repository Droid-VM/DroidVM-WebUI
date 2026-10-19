import { expect, it, vi } from 'vitest'
import { copyConfiguration } from '../../src/modules/configuration/model/copy'
import {
  cloneConfiguration,
  encodeDocument,
  getPath,
  parseDocument,
} from '../../src/modules/configuration/model/document'
import { createConfigurationEditor } from '../../src/modules/configuration/model/editor'
import type { ConfigurationGateway } from '../../src/modules/configuration/api/gateway'
import type { Task } from '../../src/modules/tasks'
import { leaseScope } from '../../src/modules/configuration/model/leases'

it('copies exact extensions but detaches writable disks and exclusive identities without changing the source', () => {
  const source = parseDocument(`{"vms":[{"id":"source","name":"VM","opaque":18446744073709551615,
    "auto_up":true,"boot":{"uefi":{"vars":"/source/vars","extra":true},"linux":{"image":{"disk":0,"entry":"old"}}},
    "disks":[{"path":"/rw","readonly":false,"extra":9007199254740993},{"path":"/ro","readonly":true}],
    "shared_dirs":[{"path":"/share","tag":"data"}],
    "networks":[{"mac_address":"02:00:00:00:00:01","network_id":"net","dhcp4_lease":{"enabled":true,"offset":64,"forwards":[{"host":"22"}],"extra":true}}],
    "port_forwards":[{}],"screens":{"simplefb":{"enabled":true,"exporter":"VNC","vnc":{"port":5900}},"gpu-0":{"enabled":true,"exporter":"native"}},
    "serial_ports":[{"backend":"FILE","path":"/serial","extra":true},{"backend":"usb_acm","usb_slot":2},{"backend":"app_console","console":true}]}]}`)
    .vms[0]!
  const before = encodeDocument(source)
  const copy = copyConfiguration(source, [source, { id: 'other', name: 'VM copy' }], 'VM copy')
  expect(encodeDocument(source)).toBe(before)
  expect(copy.id).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/)
  expect(copy.name).toBe('VM copy (2)')
  expect(copy.created_at).toBeGreaterThan(0)
  expect(copy.auto_up).toBe(false)
  expect(getPath(copy, ['disks', '0', 'path'])).toBe('')
  expect(getPath(copy, ['disks', '1', 'path'])).toBe('/ro')
  expect(getPath(copy, ['boot', 'uefi', 'vars'])).toBe('')
  expect(getPath(copy, ['boot', 'linux', 'image', 'entry'])).toBeUndefined()
  expect(getPath(copy, ['networks', '0', 'dhcp4_lease'])).toEqual({ enabled: false, extra: true })
  const mac = String(getPath(copy, ['networks', '0', 'mac_address']))
  expect(mac).not.toBe('02:00:00:00:00:01')
  expect(parseInt(mac.slice(0, 2), 16) & 3).toBe(2)
  expect(copy.port_forwards).toBeUndefined()
  expect(getPath(copy, ['screens', 'simplefb', 'enabled'])).toBe(false)
  expect(getPath(copy, ['screens', 'gpu-0', 'enabled'])).toBe(true)
  expect(getPath(copy, ['serial_ports', '0'])).toEqual({ backend: 'sink', path: '', extra: true })
  expect(getPath(copy, ['serial_ports', '1'])).toEqual({ backend: 'sink' })
  expect(getPath(copy, ['serial_ports', '2', 'backend'])).toBe('app_console')
  expect(copy.shared_dirs).toEqual(source.shared_dirs)
  expect(encodeDocument(copy)).toContain('18446744073709551615')
  expect(encodeDocument(copy)).toContain('9007199254740993')
})

it('appends a copy once, reconciles a lost reply, then reloads the saved target instead of copying again', async () => {
  const original =
    '{"root":18446744073709551615,"vms":[{"id":"source","name":"VM","networks":[{"network_id":"net","dhcp4_lease":{"enabled":true,"offset":64}}]}]}'
  let saved = original
  const version = {
    revision: 'base',
    persisted: true,
    recovered: false,
    durabilityUncertain: false,
  }
  const succeeded = { id: 'task', kind: 'vm_configuration', state: 'succeeded' } as Task
  const gateway: ConfigurationGateway = {
    supported: () => true,
    defaultsSupported: () => false,
    defaults: vi.fn(),
    read: vi.fn(async () => ({ json: saved, version })),
    stage: vi.fn(async (_revision, json) => {
      saved = json
      return 'upload'
    }),
    abort: vi.fn(),
    commit: vi.fn().mockRejectedValue(new Error('lost response')),
    status: vi.fn().mockResolvedValue({ task: null, version: null }),
  }
  const editor = createConfigurationEditor(gateway)
  await editor.open('source')
  expect(editor.peerLeases.value.size).toBe(0)
  await editor.open('source', (name) => `${name} copy`)
  expect(editor.peerLeases.value.get(leaseScope({ network_id: 'net' }, 'dhcp4_lease'))).toEqual(
    new Set([64n]),
  )
  const firstId = editor.target.value
  await editor.reload()
  expect(editor.target.value).not.toBe(firstId)
  expect(editor.copying.value).toBe(true)
  const target = editor.target.value
  editor.replace({ ...cloneConfiguration(editor.draft.value!), name: 'Ready copy' })
  await editor.save()
  expect(editor.state.value).toBe('unknown')
  expect(parseDocument(saved).vms).toHaveLength(2)
  expect(parseDocument(saved).vms[0]).toEqual(parseDocument(original).vms[0])
  expect(gateway.stage).toHaveBeenCalledWith(
    'base',
    expect.stringContaining('18446744073709551615'),
    expect.any(AbortSignal),
  )
  await editor.save()
  expect(gateway.commit).toHaveBeenCalledTimes(1)
  vi.mocked(gateway.status).mockResolvedValue({ task: succeeded, version })
  await editor.reconcile()
  expect(editor.state.value).toBe('saved')
  expect(editor.copying.value).toBe(false)
  expect(editor.dirty.value).toBe(false)
  await editor.reload()
  expect(editor.target.value).toBe(target)
  expect(editor.draft.value?.name).toBe('Ready copy')
  editor.reset()
  expect(editor.peerLeases.value.size).toBe(0)
})
