import { describe, expect, it, vi } from 'vitest'
import { createHttpVmGateway } from '../../src/modules/vm/api/http'
import type { ReadClient } from '../../src/shared/api/readClient'

const context = { daemonEpoch: 'process-a', sessionId: 'a'.repeat(64) }
const access = () => ({ context, capabilities: ['vm.list.v1'] })
const signal = () => new AbortController().signal

describe('authenticated VM capability and response context', () => {
  it('rejects absent identity or capability before requesting the resource', async () => {
    const getJson = vi.fn<ReadClient['getJson']>()
    await expect(createHttpVmGateway({ getJson }, () => null).list(signal())).rejects.toMatchObject(
      { code: 'unauthenticated' },
    )
    await expect(
      createHttpVmGateway({ getJson }, () => ({ context, capabilities: [] })).list(signal()),
    ).rejects.toMatchObject({ code: 'unsupported' })
    expect(getJson).not.toHaveBeenCalled()
  })
  it.each([
    { daemonEpoch: 'process-b', sessionId: context.sessionId },
    { daemonEpoch: context.daemonEpoch, sessionId: 'b'.repeat(64) },
  ])('rejects a different process or browser identity: %o', async (received) => {
    const getJson = vi
      .fn<ReadClient['getJson']>()
      .mockResolvedValue({ items: [], context: received })
    await expect(createHttpVmGateway({ getJson }, access).list(signal())).rejects.toMatchObject({
      code: 'context-changed',
    })
    expect(getJson).toHaveBeenCalledTimes(1)
  })
  it('requires typed context even for an empty snapshot', async () => {
    for (const received of [
      undefined,
      { ...context, daemonEpoch: 1 },
      { ...context, sessionId: '' },
    ]) {
      const getJson = vi
        .fn<ReadClient['getJson']>()
        .mockResolvedValue({ items: [], context: received })
      await expect(createHttpVmGateway({ getJson }, access).list(signal())).rejects.toMatchObject({
        code: 'invalid-response',
      })
    }
  })
  it('returns a compatible bound snapshot and preserves string identities', async () => {
    const snapshot = { items: [], context }
    const getJson = vi.fn<ReadClient['getJson']>().mockResolvedValue(snapshot)
    await expect(createHttpVmGateway({ getJson }, access).list(signal())).resolves.toEqual(snapshot)
  })
})
