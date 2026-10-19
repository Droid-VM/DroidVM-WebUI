import { expect, it, vi } from 'vitest'
import { compactCpuSet, cpuSet, toggleCpu } from '../../src/shared/lib/cpuSet'
import { affinityRows, setCpuAffinity } from '../../src/modules/configuration/model/cpuAffinity'
import { bigCpuSet, missingCpuSet } from '../../src/modules/resources/model/cpus'
import { createResourceGateway } from '../../src/modules/resources/api/http'
import { createResourceCatalog } from '../../src/modules/resources/model/catalog'

const core = (id: number, maxFrequencyKHz: number | null) => ({
  id,
  maxFrequencyKHz,
  capacity: null,
  capacityEstimated: false,
  online: null,
})
it('edits huge sparse bindings without expansion, preserves other assignments, and matches App big-core grouping', () => {
  const ranges = cpuSet('0-2147483647,4-7')!
  expect(compactCpuSet(toggleCpu(ranges, 4))).toBe('0-3,5-2147483647')
  const cores = [core(0, 1800000), core(4, 2800000), core(7, 3200000), core(9, null)]
  expect(bigCpuSet(cores)).toBe('4,7')
  expect(bigCpuSet([core(0, null), core(9, null)])).toBe('0,9')
  expect(missingCpuSet('0-2147483647', cores)).toBe('1-3,5-6,8,10-2147483647')
  const saved = '0=0:7=99:0=4-7:1= 100-2147483647'
  expect(affinityRows(saved)?.get(0)).toBe('4-7')
  expect(setCpuAffinity(saved, 0, '4,99')).toBe('7=99:1= 100-2147483647:0=4,99')
  expect(setCpuAffinity(saved, 0, '')).toBe('7=99:1= 100-2147483647')
  expect(setCpuAffinity('future syntax', 0, '1')).toBeNull()
  expect(affinityRows({ extension: true })).toBeNull()
})
it('rejects duplicate/stale CPU catalogues, clears failed reads, and discards a response after reset', async () => {
  const context = { daemonEpoch: 'epoch', sessionId: 'a'.repeat(64) }
  const items = [core(4, 2800000), core(0, null)]
  const getJson = vi.fn().mockResolvedValue({ context, items })
  let capabilities = ['host.cpu.v1']
  const cpus = createResourceCatalog(
    createResourceGateway({ getJson }, () => ({ context, capabilities, administrator: true })),
  ).cpus
  expect(await cpus.refresh()).toBe(true)
  expect(cpus.items.value.map((item) => item.id)).toEqual([0, 4])
  getJson.mockResolvedValue({ context, items: [items[0], items[0]] })
  expect(await cpus.refresh()).toBe(false)
  expect(cpus.problem.value?.code).toBe('invalid-response')
  expect(cpus.items.value).toEqual([])
  getJson.mockResolvedValue({ context: { ...context, daemonEpoch: 'changed' }, items })
  expect(await cpus.refresh()).toBe(false)
  expect(cpus.problem.value?.code).toBe('context-changed')
  let resolve!: (value: unknown) => void
  getJson.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const late = cpus.refresh()
  cpus.reset()
  resolve({ context, items })
  expect(await late).toBe(false)
  expect(cpus.items.value).toEqual([])
  capabilities = []
  expect(await cpus.refresh()).toBe(false)
  expect(cpus.status.value).toBe('idle')
})
