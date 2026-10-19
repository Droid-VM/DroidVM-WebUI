import { expect, it } from 'vitest'
import {
  bootDiskIndex,
  editAttachment,
  remapAttachmentInputs,
} from '../../src/modules/configuration/model/attachments'
import {
  encodeDocument,
  getPath,
  parseDocument,
} from '../../src/modules/configuration/model/document'

it('keeps the selected slot through reordering and clears only its stale boot entry on replacement', () => {
  const vm = parseDocument(
    '{"vms":[{"id":"vm","name":"VM","boot":{"linux":{"source":"image","image":{"disk":1,"entry":{"id":"old"},"extension":9007199254740993}}},"disks":[{"path":"same"},{"path":"same","extension":18446744073709551615},{"path":"third"}]}]}',
  ).vms[0]!
  const moved = editAttachment(vm, { collection: 'disks', index: 1 }, { type: 'move', to: 2 })
  expect(bootDiskIndex(moved.document)).toBe(2)
  expect(getPath(moved.document, ['boot', 'linux', 'image', 'entry', 'id'])).toBe('old')
  const removed = editAttachment(
    moved.document,
    { collection: 'disks', index: 0 },
    { type: 'remove' },
  )
  expect(bootDiskIndex(removed.document)).toBe(1)
  expect(getPath(removed.document, ['boot', 'linux', 'image', 'entry', 'id'])).toBe('old')
  const replaced = editAttachment(
    removed.document,
    { collection: 'disks', index: 1 },
    { type: 'replace', fields: { path: 'new' } },
  )
  expect(replaced.bootChanged).toBe(true)
  expect(getPath(replaced.document, ['boot', 'linux', 'image', 'entry'])).toBeUndefined()
  expect(encodeDocument(replaced.document)).toContain('18446744073709551615')
  expect(encodeDocument(replaced.document)).toContain('9007199254740993')
})

it('remaps invalid draft text and does not introduce unused image defaults', () => {
  const inputs = { 'networks.0.vlan_id': '-1', 'networks.1.vlan_id': '9999', memory_mb: '0' }
  expect(remapAttachmentInputs(inputs, 'networks', [1])).toEqual({
    'networks.0.vlan_id': '9999',
    memory_mb: '0',
  })
  const vm = { id: 'vm', name: 'VM', disks: [{ path: 'first' }, { path: 'second' }] }
  const removed = editAttachment(vm, { collection: 'disks', index: 0 }, { type: 'remove' })
  expect(removed.document).not.toHaveProperty('boot')
  const image = {
    ...vm,
    boot: { linux: { source: 'image', image: { disk: 1, entry: { id: 'old' } } } },
  }
  const first = editAttachment(image, { collection: 'disks', index: 1 }, { type: 'remove' })
  expect(bootDiskIndex(first.document)).toBe(0)
  expect(getPath(first.document, ['boot', 'linux', 'image', 'entry'])).toBeUndefined()
  const empty = editAttachment(
    first.document,
    { collection: 'disks', index: 0 },
    { type: 'remove' },
  )
  expect(bootDiskIndex(empty.document)).toBeNull()
})
