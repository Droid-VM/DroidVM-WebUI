import { expect, it, vi } from 'vitest'
import { createConfigurationEditor } from '../../src/modules/configuration/model/editor'
import { parseDocument } from '../../src/modules/configuration/model/document'
import type { ConfigurationGateway } from '../../src/modules/configuration/api/gateway'
import type { Task } from '../../src/modules/tasks'

function gateway() {
  const original = '{"extension":18446744073709551615,"vms":[{"id":"existing","name":"New VM"}]}'
  const version = {
    revision: 'base',
    persisted: true,
    recovered: false,
    durabilityUncertain: false,
  }
  let saved = original
  const source: ConfigurationGateway = {
    supported: () => true,
    defaultsSupported: () => true,
    defaults: vi
      .fn()
      .mockResolvedValue(
        '{"id":"new-id","name":"","memory_mb":512,"backend":"crosvm","extension":9007199254740993}',
      ),
    read: vi.fn(async () => ({ json: saved, version })),
    stage: vi.fn(async (_revision, json) => {
      saved = json
      return 'upload'
    }),
    commit: vi.fn().mockResolvedValue({ id: 'task', state: 'succeeded' } as Task),
    abort: vi.fn(),
    status: vi.fn().mockResolvedValue({ task: { id: 'task', state: 'succeeded' }, version }),
  }
  return { source, saved: () => saved }
}

it('uses native defaults and appends once against the read version, retaining all existing rows', async () => {
  const fixture = gateway()
  const editor = createConfigurationEditor(fixture.source)
  await editor.create('New VM')
  expect(editor.creating.value).toBe(true)
  expect(editor.copying.value).toBe(false)
  expect(editor.draft.value?.name).toBe('New VM (2)')
  expect(editor.exportJson()).toContain('9007199254740993')
  await editor.save()
  expect(editor.state.value).toBe('saved')
  expect(editor.newDraft.value).toBe(false)
  expect(parseDocument(fixture.saved()).vms).toHaveLength(2)
  expect(parseDocument(fixture.saved()).vms[0]?.name).toBe('New VM')
  expect(fixture.saved()).toContain('18446744073709551615')
  expect(fixture.source.stage).toHaveBeenCalledWith(
    'base',
    expect.any(String),
    expect.any(AbortSignal),
  )
  await editor.reload()
  expect(editor.target.value).toBe('new-id')
  expect(fixture.source.defaults).toHaveBeenCalledTimes(1)
  editor.reset()
})

it('does not expose a stale defaults response after identity reset and does not create without capability', async () => {
  const fixture = gateway()
  let resolve!: (json: string) => void
  fixture.source.defaults = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done
      }),
  )
  const editor = createConfigurationEditor(fixture.source)
  const pending = editor.create('New VM')
  editor.reset()
  resolve('{"id":"late","name":""}')
  await pending
  expect(editor.draft.value).toBeNull()
  expect(editor.state.value).toBe('idle')
  fixture.source.defaultsSupported = () => false
  await editor.create('New VM')
  expect(fixture.source.defaults).toHaveBeenCalledTimes(1)
  expect(fixture.source.stage).not.toHaveBeenCalled()
})
