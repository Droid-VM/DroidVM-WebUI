import { expect, it } from 'vitest'
import { parse } from 'lossless-json'
import {
  storageInactive,
  storageIssues,
  storageValue,
} from '../../src/modules/configuration/model/storage'
import { encodeDocument, type ConfigObject } from '../../src/modules/configuration/model/document'
import type { ConfigField } from '../../src/modules/configuration/model/fields'

const field = (key: string): ConfigField => ({
  path: ['shared_dirs', '0', key],
  label: 'configDirectoryCache',
  type: 'text',
})
it('projects native share defaults without modifying legacy or unknown stored values', () => {
  const row: ConfigObject = {
    backend: 'CROSVM',
    shared_dirs: [
      {
        path: '/data/share',
        tag: 'shared',
        type: 'P9',
        dax: true,
        extra: parse('18446744073709551615'),
      },
    ],
  }
  const before = encodeDocument(row)
  expect(storageValue(field('cache'), row)).toBe('auto')
  expect(storageValue(field('posix_acl'), row)).toBe(true)
  expect(storageValue(field('root_access'), row)).toBe(false)
  expect(storageValue(field('timeout'), row)).toBe(5)
  expect(storageInactive(field('readonly'), row)).toBe(true)
  expect(storageInactive(field('writeback'), row)).toBe(false)
  expect(storageIssues(row)).toEqual({})
  expect(encodeDocument(row)).toBe(before)
  row.backend = 'QEMU'
  expect(storageInactive(field('readonly'), row)).toBe(false)
  expect(storageInactive(field('timeout'), row)).toBe(true)
  ;(row.shared_dirs as ConfigObject[])[0]!.cache = 'future_cache'
  expect(storageValue(field('cache'), row)).toBe('future_cache')
})

it('rejects unusable paths, duplicate or invalid tags and active invalid timeouts', () => {
  const row: ConfigObject = {
    backend: 'crosvm',
    shared_dirs: [
      { path: '/data/share', tag: 'shared' },
      { path: '/data/../other', tag: 'shared', timeout: parse('9223372036854775808') },
      { path: '/data/valid', tag: '.hidden' },
    ],
  }
  expect(storageIssues(row)).toEqual({
    'shared_dirs.1.path': 'configDirectoryPathInvalid',
    'shared_dirs.1.tag': 'configDirectoryTagDuplicate',
    'shared_dirs.1.timeout': 'configInvalid',
    'shared_dirs.2.tag': 'configDirectoryTagInvalid',
  })
  row.backend = 'qemu'
  expect(storageIssues(row)['shared_dirs.1.timeout']).toBeUndefined()
  for (const path of [
    'relative',
    '/data/',
    '/data//a',
    '/data/./a',
    '/data/colon:a',
    '/data/line\nbreak',
  ]) {
    expect(
      storageIssues({ shared_dirs: [{ path, tag: 'valid' }] })['shared_dirs.0.path'],
    ).toBeTruthy()
  }
  const comma = { shared_dirs: [{ path: '/data/a,b', tag: 'share,b' }] }
  expect(storageIssues({ ...comma, backend: 'crosvm' })).toEqual({})
  expect(storageIssues({ ...comma, backend: 'qemu' })).toEqual({
    'shared_dirs.0.path': 'configDirectoryQemuComma',
    'shared_dirs.0.tag': 'configDirectoryQemuComma',
  })
})
