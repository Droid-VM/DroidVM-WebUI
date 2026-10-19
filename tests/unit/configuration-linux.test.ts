import { expect, it, vi } from 'vitest'
import { createConfigurationEditor } from '../../src/modules/configuration/model/editor'
import { fieldText, getPath, parseDocument } from '../../src/modules/configuration/model/document'
import type { ConfigurationGateway } from '../../src/modules/configuration/api/gateway'
import type { Task } from '../../src/modules/tasks'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function fixture() {
  const version = {
    revision: 'base',
    persisted: true,
    recovered: false,
    durabilityUncertain: false,
  }
  const task = { id: 'task', state: 'succeeded' } as Task
  let saved = '{"extension":18446744073709551615,"vms":[]}'
  const gateway: ConfigurationGateway = {
    supported: () => true,
    defaultsSupported: () => true,
    defaults: vi
      .fn()
      .mockResolvedValue(
        '{"id":"native-id","name":"","backend":"crosvm","hypervisor":"gunyah",' +
          '"boot":{"protocol":"uefi","extension":9007199254740993},"hostExtension":true}',
      ),
    read: vi.fn(async () => ({ json: saved, version })),
    stage: vi.fn(async (_revision, json) => {
      saved = json
      return 'upload'
    }),
    abort: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(task),
    status: vi.fn().mockResolvedValue({ task, version }),
  }
  return { gateway, task, saved: () => saved }
}

it('seeds Linux from host defaults, keeps its identity across reload, then reloads the saved VM', async () => {
  const { gateway, saved } = fixture()
  const editor = createConfigurationEditor(gateway)
  await editor.createLinux('Linux', {
    diskPath: '/images/prepared.qcow2',
    cpuCount: 4,
    memoryMb: 2048,
    networkId: 'network',
  })
  const id = editor.target.value
  const mac = getPath(editor.draft.value!, ['networks', '0', 'mac_address'])
  expect(id).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/)
  expect(editor.draft.value).toMatchObject({
    backend: 'crosvm',
    hypervisor: 'gunyah',
    hostExtension: true,
    disks: [{ path: '/images/prepared.qcow2', bus: 'virtio', readonly: false }],
  })
  expect(fieldText(editor.draft.value?.cpu_count)).toBe('4')
  expect(fieldText(editor.draft.value?.memory_mb)).toBe('2048')
  expect(getPath(editor.draft.value!, ['boot', 'protocol'])).toBe('uefi')
  expect(editor.exportJson()).toContain('9007199254740993')
  expect(parseInt(String(mac).slice(0, 2), 16) & 3).toBe(2)
  expect(gateway.stage).not.toHaveBeenCalled()
  await editor.reload()
  expect(editor.target.value).toBe(id)
  expect(getPath(editor.draft.value!, ['networks', '0', 'mac_address'])).toBe(mac)
  await editor.save()
  expect(editor.state.value).toBe('saved')
  expect(saved()).toContain('18446744073709551615')
  expect(parseDocument(saved()).vms).toHaveLength(1)
  await editor.reload()
  expect(editor.target.value).toBe(id)
  expect(editor.creating.value).toBe(false)
  expect(gateway.defaults).toHaveBeenCalledTimes(2)
})

it('blocks interrupted staging without treating it as a committed request or losing the seed', async () => {
  const { gateway } = fixture()
  const stage = deferred<string>()
  gateway.stage = vi.fn().mockReturnValue(stage.promise)
  const editor = createConfigurationEditor(gateway)
  await editor.createLinux('Linux', { diskPath: '/images/prepared.qcow2' })
  const id = editor.target.value
  expect(fieldText(editor.draft.value?.cpu_count)).toBe('1')
  expect(fieldText(editor.draft.value?.memory_mb)).toBe('512')
  expect(editor.draft.value?.networks).toEqual([])
  const saving = editor.save()
  expect(editor.state.value).toBe('staging')
  editor.pause()
  expect(editor.state.value).toBe('blocked')
  stage.resolve('late-upload')
  await saving
  expect(gateway.abort).toHaveBeenCalledWith('late-upload', expect.any(AbortSignal))
  expect(gateway.commit).not.toHaveBeenCalled()
  expect(gateway.status).not.toHaveBeenCalled()
  await editor.reload()
  expect(editor.target.value).toBe(id)
  expect(getPath(editor.draft.value!, ['disks', '0', 'path'])).toBe('/images/prepared.qcow2')
})

it('retains a paused commit request and reconciles it without creating another UUID or write', async () => {
  const { gateway, task } = fixture()
  const commit = deferred<Task>()
  gateway.commit = vi.fn().mockReturnValue(commit.promise)
  gateway.status = vi.fn().mockResolvedValue({ task: null, version: null })
  const editor = createConfigurationEditor(gateway)
  await editor.createLinux('Linux', { diskPath: '/images/prepared.qcow2' })
  const id = editor.target.value
  const saving = editor.save()
  await Promise.resolve()
  expect(editor.state.value).toBe('pending')
  const request = vi.mocked(gateway.commit).mock.calls[0]![1]
  editor.pause()
  expect(editor.state.value).toBe('unknown')
  commit.resolve(task)
  await saving
  await editor.reload()
  await editor.save()
  expect(gateway.status).toHaveBeenCalledWith(request, expect.any(AbortSignal))
  expect(gateway.defaults).toHaveBeenCalledTimes(1)
  expect(gateway.commit).toHaveBeenCalledTimes(1)
  expect(editor.target.value).toBe(id)
  expect(editor.state.value).toBe('unknown')
})

it('ignores an interrupted defaults response and restores the seed on explicit reload', async () => {
  const { gateway } = fixture()
  const defaults = deferred<string>()
  vi.mocked(gateway.defaults).mockReturnValueOnce(defaults.promise)
  const editor = createConfigurationEditor(gateway)
  const loading = editor.createLinux('Linux', { diskPath: '/images/prepared.qcow2' })
  editor.pause()
  defaults.resolve('{"id":"late-id","name":""}')
  await loading
  expect(editor.state.value).toBe('blocked')
  expect(editor.draft.value).toBeNull()
  await editor.reload()
  expect(editor.state.value).toBe('editing')
  expect(getPath(editor.draft.value!, ['disks', '0', 'path'])).toBe('/images/prepared.qcow2')
  expect(editor.target.value).not.toBe('late-id')
})
