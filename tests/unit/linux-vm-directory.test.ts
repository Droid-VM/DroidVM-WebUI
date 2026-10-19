import { expect, it } from 'vitest'
import { buildDiskOperation, diskForm } from '../../src/modules/resources/model/diskForm'

const diskId = '11111111-1111-4111-8111-111111111111'
it('creates only the named VM directory for wizard clones while preserving ordinary clone and retry behavior', () => {
  const form = diskForm('/images/template.img')
  form.name = 'root.img'
  const ordinary = buildDiskOperation('clone', diskId, form)
  expect(ordinary).toMatchObject({ action: 'clone', folder: '/images', name: 'root.img' })
  expect(ordinary).not.toHaveProperty('createFolder')
  const wizard = buildDiskOperation('clone', diskId, form, 'Linux 主机')
  expect(wizard).toMatchObject({
    action: 'clone',
    folder: '/images/Linux 主机',
    name: 'root.img',
    createFolder: true,
  })
  expect(form.folder).toBe('/images')
  expect(form.createFolder).toBe(false)
  const retry = diskForm('/images/template.img', wizard)
  expect(buildDiskOperation('clone', diskId, retry)).toEqual(wizard)
  form.folder = '/'
  expect(buildDiskOperation('clone', diskId, form, 'Linux')).toMatchObject({
    folder: '/Linux',
    createFolder: true,
  })
  expect(buildDiskOperation('create', null, form)).not.toHaveProperty('createFolder')
})

it('rejects empty or noncanonical parents, path-like names and oversized complete targets before review', () => {
  const form = diskForm('/images/template.img')
  form.name = 'root.img'
  for (const parent of [
    '',
    'relative',
    '/images/',
    '/images//nested',
    '/images/../other',
    '/images\nother',
  ]) {
    form.folder = parent
    expect(buildDiskOperation('clone', diskId, form, 'Linux')).toBeNull()
  }
  form.folder = '/images'
  for (const name of ['', '.', '..', 'a/b', 'a\\b', '.dvm-private', '字'.repeat(86)])
    expect(buildDiskOperation('clone', diskId, form, name)).toBeNull()
  for (const name of ['../root.img', 'sub\\root.img', 'root\n.img', '.dvm-private']) {
    form.name = name
    expect(buildDiskOperation('clone', diskId, form, 'Linux')).toBeNull()
  }
  form.name = 'root.img'
  form.folder = '/' + 'a'.repeat(4088)
  expect(buildDiskOperation('clone', diskId, form, 'Linux')).toBeNull()
  form.folder = '/images'
  expect(buildDiskOperation('convert', diskId, form, 'Linux')).toBeNull()
})
