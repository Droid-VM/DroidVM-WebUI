import { access, readdir, readFile } from 'node:fs/promises'

const root = new URL('../dist/', import.meta.url)
for (const file of ['dev.html', 'dev/main.ts', 'dev/vms.json']) {
  const exists = await access(new URL(file, root)).then(
    () => true,
    () => false,
  )
  if (exists) throw new Error(`正式产物包含开发入口: ${file}`)
}
for (const file of await readdir(new URL('assets/', root))) {
  if (!file.endsWith('.js')) continue
  const source = await readFile(new URL(`assets/${file}`, root), 'utf8')
  if (
    [
      'demo-debian',
      'demo-windows',
      '确认操作示例',
      '开发场景',
      'http-contract-vm',
      'fixture-private-detail',
      'fixture_case',
      'DROIDVM_DEV_API_TARGET',
      '127.0.0.1:5189',
    ].some((marker) => source.includes(marker))
  ) {
    throw new Error('正式产物包含开发示例数据')
  }
}
console.log('正式产物开发入口与样本隔离检查通过')
