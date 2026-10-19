import { expect, it, vi } from 'vitest'
import { createNetworkEditor } from '../../src/modules/networks/model/editor'
import {
  editField,
  networkIssues,
  newNetwork,
  newVlan,
  parseNetworks,
  vlanFields,
} from '../../src/modules/networks/model/document'
import { encodeDocument, getPath } from '../../src/shared/model/configurationDocument'
import type { NetworkConfigurationGateway } from '../../src/modules/networks/api/gateway'
import type { Task } from '../../src/modules/tasks'

const json =
  '{"networks":[{"schema":2,"id":"old","name":"old","bridge_name":"br0","bridge_type":"linux","uplink_mode":"l3","extension":18446744073709551615,"l3":{"vlans":[{"vlan_id":0,"ipv6":{"cidr":"fd00:50::1/64","dhcp":{"enabled":true,"offset_start":9007199254740994,"offset_end":9007199254740995,"opaque":123}}}]}}]}'
function gateway(): NetworkConfigurationGateway {
  return {
    supported: () => true,
    read: vi.fn().mockResolvedValue(json),
    stage: vi.fn().mockResolvedValue('upload'),
    abort: vi.fn(),
    submit: vi.fn().mockRejectedValue(new Error('lost')),
    find: vi.fn().mockResolvedValue(null),
  }
}
it('preserves full expected objects and exact offsets, keeps uncertain saves locked and failed drafts intact', async () => {
  const source = gateway(),
    editor = createNetworkEditor(source, () => 'request')
  editor.bind('session')
  await editor.open('old')
  editor.update({ key: 'name', label: 'name' }, 'changed')
  const field = vlanFields(editor.draft.value!, 0).find((item) =>
    item.key.endsWith('ipv6.dhcp.offset_end'),
  )!
  editor.update(field, '9007199254740996')
  await editor.save()
  await editor.save()
  await editor.reconcile()
  expect(source.submit).toHaveBeenCalledTimes(1)
  expect(editor.entry.value?.state).toBe('unknown')
  expect(editor.canSave.value).toBe(false)
  const envelope = vi.mocked(source.stage).mock.calls[0]![0]
  expect(envelope).toContain('"expected":{"schema":2,"id":"old","name":"old"')
  expect(envelope).toContain('18446744073709551615')
  expect(envelope).toContain('"offset_end":9007199254740996,"opaque":123')
  vi.mocked(source.find).mockResolvedValue({
    id: 'task',
    revision: '1',
    state: 'failed',
    errorCode: 'CONFLICT',
  } as Task)
  await editor.reconcile()
  expect(editor.blocked.value).toBe(true)
  expect(editor.draft.value?.name).toBe('changed')
  expect(editor.entry.value?.state).toBe('done')
  editor.dispose()
})
it('isolates late uploads from a new session and cleans up an upload never submitted', async () => {
  const source = gateway(),
    editor = createNetworkEditor(source)
  let finish!: (id: string) => void
  vi.mocked(source.stage).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  editor.bind('first')
  await editor.open('old')
  editor.update({ key: 'name', label: 'name' }, 'draft')
  const saving = editor.save()
  editor.bind('second')
  await editor.open('old')
  finish('late')
  await saving
  expect(source.submit).not.toHaveBeenCalled()
  expect(source.abort).toHaveBeenCalledWith('late', expect.any(AbortSignal))
  expect(editor.draft.value?.name).toBe('old')
  expect(editor.problem.value).toBe(null)
  editor.dispose()
})
it('keeps inactive fields, blocks incompatible combinations and rejects lossy integer input', () => {
  const row = parseNetworks(json)[0]!
  const original = encodeDocument(row)
  const field = vlanFields(row, 0).find((item) => item.key.endsWith('ipv6.dhcp.offset_end'))!
  expect(editField(row, field, '9223372036854775808')).toBe(false)
  expect(encodeDocument(row)).toBe(original)
  editField(row, { key: 'uplink_mode', label: 'networkUplinkMode' }, 'l2')
  editField(row, { key: 'bridge_type', label: 'networkBridgeType' }, 'gvisor')
  expect(networkIssues(row, []).map((issue) => issue.message)).toContain('networkL2Linux')
  expect(getPath(row, ['l3', 'vlans', '0', 'ipv6', 'dhcp', 'offset_end'])?.toString()).toBe(
    '9007199254740995',
  )
})
it('creates App-compatible presets avoiding same-backend subnets and existing names', () => {
  const existing = parseNetworks(json)
  existing[0]!.name = 'net0'
  const row = newNetwork(existing)
  expect(row.name).toBe('net1')
  expect(row.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
  expect(getPath(row, ['l3', 'vlans', '0', 'ipv6', 'cidr'])).toBe('fd00:51::1/64')
  expect(getPath(row, ['l3', 'vlans', '0', 'ipv6', 'dhcp', 'enabled'])).toBe(false)
  expect(networkIssues(row, existing)).toEqual([])
  const gvisor = newVlan(0, 'gvisor', existing)
  expect(getPath(gvisor, ['ipv6', 'snat'])).toBe(true)
  expect(getPath(gvisor, ['ipv6', 'dhcp', 'enabled'])).toBe(true)
})
it('only replaces a successful draft after the saved network is read back', async () => {
  const source = gateway(),
    editor = createNetworkEditor(source)
  await editor.open('new')
  const saved = editor.exportJson()
  vi.mocked(source.submit).mockResolvedValue({
    id: 'task',
    state: 'succeeded',
    revision: '1',
  } as Task)
  vi.mocked(source.read).mockResolvedValue(`{"networks":[${saved}]}`)
  await editor.save()
  expect(editor.saved.value).toBe(true)
  expect(editor.dirty.value).toBe(false)
  expect(vi.mocked(source.stage).mock.calls[0]![0]).toContain('"expected":null')
  editor.dispose()
})
