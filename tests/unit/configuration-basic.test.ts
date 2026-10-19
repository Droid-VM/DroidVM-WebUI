import { expect, it } from 'vitest'
import {
  basicIssue,
  normalizeProtection,
  stringLines,
  environmentValid,
  topologyIssues,
  lineArray,
} from '../../src/modules/configuration/model/basic'
import type { ConfigObject } from '../../src/modules/configuration/model/document'

it('checks backend combinations without resolving legacy AUTO and only downgrades incompatible pseudo protection', () => {
  const row: ConfigObject = {
    backend: 'CROSVM',
    hypervisor: 'GUNYAH',
    protected_vm: 'PSEUDO_UNPROTECTED',
  }
  expect(normalizeProtection(row)).toBe(false)
  row.backend = 'qemu'
  expect(normalizeProtection(row)).toBe(true)
  expect(row.protected_vm).toBe('protected_normal')
  row.hypervisor = 'soft'
  row.backend = 'crosvm'
  expect(basicIssue(row, 'hypervisor')).toBe('configHypervisorMismatch')
  row.hypervisor = 'auto'
  row.protected_vm = 'pseudo_unprotected'
  expect(normalizeProtection(row)).toBe(false)
  row.hypervisor = 'kvm'
  expect(normalizeProtection(row)).toBe(true)
  expect(stringLines('  --label\r\n two words \n\n NAME=a=b  ')).toEqual([
    '--label',
    'two words',
    'NAME=a=b',
  ])
  expect(environmentValid(['NAME=a=b', 'NAME=', ' WITH SPACE =ok'])).toBe(true)
  expect(environmentValid(['=value'])).toBe(false)
  expect(environmentValid(['NO_EQUALS'])).toBe(false)
  expect(lineArray(['one\ntwo'])).toBe(false)
  expect(lineArray(['ok', { extension: true }])).toBe(false)
})

it('checks effective CPU topology without expanding huge host ranges or erasing inactive and unknown formats', () => {
  const row: ConfigObject = {
    cpu_count: 4,
    cpu_affinity: '0=0-2147483647:1=2',
    cpu_topology_auto: false,
    cpu_capacity: '0=512,1=1024',
    cpu_clusters: '0-1;2-3',
  }
  expect(topologyIssues(row)).toEqual({})
  row.cpu_count = 1
  expect(topologyIssues(row)).toEqual({
    cpu_affinity: 'configAffinityInvalid',
    cpu_capacity: 'configCapacityInvalid',
    cpu_clusters: 'configClustersInvalid',
  })
  row.cpu_count = 4
  row.cpu_clusters = '0-2;2-3'
  row.cpu_capacity = '0=1025'
  expect(topologyIssues(row)).toEqual({
    cpu_capacity: 'configCapacityInvalid',
    cpu_clusters: 'configClustersInvalid',
  })
  row.cpu_topology_auto = true
  expect(topologyIssues(row)).toEqual({})
  row.cpu_affinity = '0=2147483648'
  expect(topologyIssues(row)).toEqual({ cpu_affinity: 'configAffinityInvalid' })
  row.cpu_affinity = ''
  row.cpu_topology_auto = false
  expect(topologyIssues(row)).toEqual({})
  row.cpu_affinity = { future: true }
  expect(topologyIssues(row)).toEqual({})
})
