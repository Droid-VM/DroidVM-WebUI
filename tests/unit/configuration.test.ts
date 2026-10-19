import { expect, it, vi } from 'vitest'
import {
  cloneConfiguration,
  encodeDocument,
  parseDocument,
  getPath,
  setPath,
} from '../../src/modules/configuration/model/document'
import { createConfigurationEditor } from '../../src/modules/configuration/model/editor'
import type { ConfigurationGateway } from '../../src/modules/configuration/api/gateway'
import type { Task } from '../../src/modules/tasks'

const json =
  '{"rootExtension":18446744073709551615,"vms":[{"id":"vm","name":"before","opaque":{"integer":9007199254740993,"decimal":0.12345678901234567890123456789}}]}'
it('preserves untouched extensions and exact numeric tokens while editing a known field', () => {
  const document = parseDocument(json)
  const vm = cloneConfiguration(document.vms[0]!)
  vm.name = 'after'
  document.vms[0] = vm
  const saved = encodeDocument(document)
  expect(saved).toContain('18446744073709551615')
  expect(saved).toContain('9007199254740993')
  expect(saved).toContain('0.12345678901234567890123456789')
  expect(saved).toContain('"name":"after"')
})
it('preserves resource arrays and extensions without following inherited object properties', () => {
  const vm = parseDocument(
    '{"vms":[{"id":"vm","name":"VM","disks":[{"path":"before","counter":18446744073709551615},{"path":"other"}]}]}',
  ).vms[0]!
  setPath(vm, ['disks', '0', 'path'], 'after')
  setPath(vm, ['screens', '__proto__', 'width'], 800)
  expect(Array.isArray(vm.disks)).toBe(true)
  expect(getPath(vm, ['disks', '1', 'path'])).toBe('other')
  expect(getPath(vm, ['screens', '__proto__', 'width'])).toBe(800)
  expect(Object.hasOwn(Object.prototype, 'width')).toBe(false)
  expect(encodeDocument(vm)).toContain('"path":"after","counter":18446744073709551615')
})
it('keeps an unknown commit locked without replay, then retains the draft after a conflict', async () => {
  const failed = {
    id: 'task',
    kind: 'vm_configuration',
    state: 'failed',
    errorCode: 'CONFLICT',
  } as Task
  const gateway: ConfigurationGateway = {
    supported: () => true,
    defaultsSupported: () => false,
    defaults: vi.fn(),
    read: vi.fn().mockResolvedValue({
      json,
      version: {
        revision: 'base',
        persisted: true,
        recovered: false,
        durabilityUncertain: false,
      },
    }),
    stage: vi.fn().mockResolvedValue('upload'),
    abort: vi.fn(),
    commit: vi.fn().mockRejectedValue(new Error('response lost')),
    status: vi.fn().mockResolvedValue({ task: null, version: null }),
  }
  const editor = createConfigurationEditor(gateway)
  await editor.open('vm')
  editor.replace({ ...cloneConfiguration(editor.draft.value!), name: 'my edit' })
  await editor.save()
  expect(editor.state.value).toBe('unknown')
  await editor.save()
  expect(gateway.commit).toHaveBeenCalledTimes(1)
  vi.mocked(gateway.status).mockResolvedValue({ task: failed, version: null })
  await editor.reconcile()
  expect(editor.state.value).toBe('blocked')
  expect(editor.draft.value?.name).toBe('my edit')
  expect(editor.exportJson()).toContain('9007199254740993')
  editor.reset()
})
