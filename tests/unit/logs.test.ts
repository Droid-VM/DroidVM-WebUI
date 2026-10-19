import { expect, it, vi } from 'vitest'
import { createHttpLogGateway } from '../../src/modules/logs/api/http'
import { createLogViewer } from '../../src/modules/logs/model/viewer'
import type { LogChunk, LogGateway, LogList, LogRead } from '../../src/modules/logs/api/gateway'
import type { HttpClient } from '../../src/shared/api/httpClient'

const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
const target: LogList = {
  context,
  vmId: 'vm',
  instanceId: 'b'.repeat(32),
  streams: ['stdio', 'stderr'],
}
const access = () => ({
  context,
  capabilities: ['vm.logs.v1'],
  csrfToken: 'c'.repeat(64),
  administrator: true,
})
const input: LogRead = {
  vmId: target.vmId,
  instanceId: target.instanceId,
  stream: 'stdio',
  cursor: null,
  tail: true,
}
function chunk(text: string, values: Partial<LogChunk> = {}): LogChunk {
  const bytes = new TextEncoder().encode(text)
  return {
    context,
    vmId: target.vmId,
    instanceId: target.instanceId,
    stream: 'stdio',
    generation: 'log-1',
    floor: '0',
    start: '0',
    next: String(bytes.length),
    end: String(bytes.length),
    reset: false,
    more: false,
    data: btoa(String.fromCharCode(...bytes)),
    bytes,
    ...values,
  }
}
function transport(value: unknown) {
  return {
    getJson: vi.fn<HttpClient['getJson']>().mockResolvedValue(value),
    postJson: vi.fn<HttpClient['postJson']>().mockResolvedValue(value),
    delete: vi.fn<HttpClient['delete']>(),
  }
}
it('checks log scope, canonical bytes and contiguous cursor while preserving uint64 offsets', async () => {
  const raw = chunk('中')
  const { bytes, ...value } = raw
  const client = transport(value),
    gateway = createHttpLogGateway(client, access),
    signal = new AbortController().signal
  expect((await gateway.read(input, signal)).bytes).toEqual(bytes)
  expect(client.postJson).toHaveBeenCalledWith(
    '/api/v1/vm-logs/read',
    { ...input, context },
    signal,
    { csrf: access().csrfToken, status: 200 },
  )
  for (const bad of [
    { ...value, data: 'AB==' },
    { ...value, next: '2' },
    { ...value, context: { ...context, daemonEpoch: 'other' } },
    { ...value, instanceId: 'd'.repeat(32) },
  ]) {
    client.postJson.mockResolvedValue(bad)
    await expect(gateway.read(input, signal)).rejects.toBeInstanceOf(Error)
  }
  client.postJson.mockResolvedValue({
    ...value,
    floor: '9007199254740993',
    start: '9007199254740993',
    next: '9007199254740996',
    end: '9007199254740996',
  })
  expect((await gateway.read(input, signal)).start).toBe('9007199254740993')
  await expect(
    gateway.read(
      { ...input, tail: false, cursor: { generation: 'log-1', offset: '9007199254740994' } },
      signal,
    ),
  ).rejects.toBeInstanceOf(Error)
})
it('reassembles split UTF-8 and replaces history after reset without treating logs as markup', async () => {
  const read = vi.fn<LogGateway['read']>()
  const raw = new TextEncoder().encode('中<script>')
  read.mockResolvedValueOnce(chunk('', { bytes: raw.slice(0, 1), next: '1', end: '1' }))
  read.mockResolvedValueOnce(
    chunk('', {
      bytes: raw.slice(1),
      start: '1',
      next: String(raw.length),
      end: String(raw.length),
    }),
  )
  const model = createLogViewer({ supported: () => true, list: async () => target, read })
  await model.open('vm')
  expect(model.text.value).toBe('')
  await model.refresh()
  expect(model.text.value).toBe('中<script>')
  read.mockResolvedValueOnce(chunk('fresh', { generation: 'log-2', reset: true }))
  await model.refresh()
  expect(model.text.value).toBe('fresh')
  expect(model.discontinuous.value).toBe(true)
  expect(new TextDecoder().decode(model.exportBytes())).toBe('fresh')
})
it('bounds retained browser bytes and catch-up work', async () => {
  const data = new Uint8Array(65536).fill(120)
  let offset = 0
  const read = vi.fn<LogGateway['read']>().mockImplementation(async () => {
    const start = offset
    offset += data.length
    return chunk('', {
      bytes: data,
      start: String(start),
      next: String(offset),
      end: String(offset + 1),
      more: true,
    })
  })
  const model = createLogViewer({ supported: () => true, list: async () => target, read })
  await model.open('vm')
  expect(read).toHaveBeenCalledTimes(16)
  expect(model.byteCount.value).toBe(1048576)
  await model.refresh()
  expect(model.byteCount.value).toBe(1048576)
  expect(model.partial.value).toBe(true)
})
it('fences old stream replies and clears data on identity reset', async () => {
  let finish!: (value: LogChunk) => void
  const read = vi.fn<LogGateway['read']>().mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  read.mockResolvedValue(chunk('new stream', { stream: 'stderr' }))
  const model = createLogViewer({ supported: () => true, list: async () => target, read })
  const opening = model.open('vm')
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1))
  await model.select('stderr')
  finish(chunk('old stream'))
  await opening
  expect(model.text.value).toBe('new stream')
  model.reset()
  expect(model.text.value).toBe('')
  expect(model.target.value).toBeNull()
})
