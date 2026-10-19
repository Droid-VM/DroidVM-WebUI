import { expect, it } from 'vitest'
import {
  cpuPlacementPreview,
  oneToOnePlacement,
  seedManualTopology,
  simpleHostSelection,
} from '../../src/modules/configuration/model/cpuPlacement'
import { parseConfiguration, encodeDocument } from '../../src/modules/configuration/model/document'

const cores = [
  { id: 0, capacity: 512, maxFrequencyKHz: 1800000, capacityEstimated: false, online: true },
  { id: 4, capacity: 896, maxFrequencyKHz: 2800000, capacityEstimated: true, online: true },
  { id: 7, capacity: 1024, maxFrequencyKHz: 3200000, capacityEstimated: false, online: false },
  { id: 9, capacity: null, maxFrequencyKHz: null, capacityEstimated: false, online: null },
]
it('matches native minimum capacity, ordered clusters, unknown/unbound placement and offline observations', () => {
  const row = { cpu_count: 5, cpu_affinity: '0=7:0=0,4:1=7:2=9,99:3=4' }
  const preview = cpuPlacementPreview(row, cores)!
  expect(preview.capacity).toEqual([
    { vcpu: 0, value: 512 },
    { vcpu: 1, value: 1024 },
    { vcpu: 3, value: 896 },
  ])
  expect(preview.clusters).toEqual([[0, 2, 4], [3], [1]])
  expect(preview.incomplete).toBe(true)
  expect(cpuPlacementPreview({ cpu_count: 3, cpu_affinity: '0=7:1=7' }, cores)?.clusters).toEqual([
    [0, 1, 2],
  ])
  expect(cpuPlacementPreview({ cpu_count: 2, cpu_affinity: '0=9,99' }, cores)).toEqual({
    capacity: [],
    clusters: [],
    incomplete: true,
  })
  expect(cpuPlacementPreview({ cpu_count: 1, cpu_affinity: '0=0-2147483647' }, cores)).toBeNull()
  expect(cpuPlacementPreview({ cpu_count: 1, cpu_affinity: '1=4' }, cores)).toBeNull()
  expect(cpuPlacementPreview({ cpu_count: '4', cpu_affinity: '0=0' }, cores)).toBeNull()
  expect(
    cpuPlacementPreview(
      parseConfiguration('{"id":"vm","name":"vm","cpu_count":4.0,"cpu_affinity":"0=0"}'),
      cores,
    ),
  ).toBeNull()
  expect(cpuPlacementPreview({ cpu_count: 2, cpu_affinity: { future: true } }, cores)).toBeNull()
})
it('seeds only blank manual fields, preserves lossless extensions, and bounds one-to-one conversion before expansion', () => {
  const row = parseConfiguration(
    '{"id":"vm","name":"vm","cpu_count":4,"cpu_affinity":"0=0:1=4","cpu_capacity":"1=700","cpu_clusters":"","future":18446744073709551615}',
  )
  const before = encodeDocument(row)
  const preview = cpuPlacementPreview(row, cores)
  const seeded = seedManualTopology(row, preview)
  expect(seeded.cpu_capacity).toBe('1=700')
  expect(seeded.cpu_clusters).toBe('0,2-3;1')
  expect(encodeDocument(seeded)).toContain('18446744073709551615')
  expect(encodeDocument(row)).toBe(before)
  const unknown = { ...row, cpu_capacity: { future: true }, cpu_clusters: '0-3' }
  expect(seedManualTopology(unknown, preview)).toEqual(unknown)
  expect(
    seedManualTopology(
      { cpu_count: 2, cpu_affinity: '0=0', cpu_capacity: '' },
      cpuPlacementPreview({ cpu_count: 2, cpu_affinity: '0=0' }, cores),
    ).cpu_clusters,
  ).toBeUndefined()
  expect(simpleHostSelection({ cpu_count: 4, cpu_affinity: '0=4-7:1=4,99:2=99' }, cores)).toBe(
    '4,99',
  )
  expect(simpleHostSelection({ cpu_count: 2 }, cores)).toBe('0,4')
  expect(oneToOnePlacement('7,4,4')).toEqual({ count: 2, hosts: '4,7', affinity: '0=4:1=7' })
  expect(oneToOnePlacement('0-2147483647')).toBeNull()
  expect(oneToOnePlacement('')).toBeNull()
})
