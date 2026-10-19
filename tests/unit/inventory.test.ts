import { describe, expect, it } from 'vitest'
import { createInventory } from '../../src/modules/vm/model/inventory'
import { parseSnapshot, type VmGateway, type VmSnapshot } from '../../src/modules/vm/api/gateway'

const snapshot = (name: string): VmSnapshot => ({
  items: [
    {
      id: '9007199254740993',
      name,
      state: 'RUNNING',
      backend: null,
      cpuCount: null,
      memoryMiB: null,
    },
  ],
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('VM contract boundary', () => {
  it('keeps opaque IDs intact and accepts unavailable measurements', () => {
    expect(parseSnapshot(snapshot('VM')).items[0]?.id).toBe('9007199254740993')
  })
  it('rejects incompatible states, numeric IDs and duplicate resource IDs', () => {
    const value = snapshot('VM')
    expect(() => parseSnapshot({ items: [{ ...value.items[0], state: 'FUTURE_STATE' }] })).toThrow()
    expect(() => parseSnapshot({ items: [{ ...value.items[0], id: 42 }] })).toThrow()
    expect(() => parseSnapshot({ items: [value.items[0], value.items[0]] })).toThrow()
  })
  it('rejects invalid response shapes instead of rendering a false empty inventory', () => {
    for (const value of [null, {}, { items: null }, { items: [{ id: 'vm' }] }])
      expect(() => parseSnapshot(value)).toThrow()
  })
})

describe('inventory lifecycle', () => {
  it('ignores stale responses even if an adapter does not honor cancellation', async () => {
    const old = deferred<VmSnapshot>()
    const fresh = deferred<VmSnapshot>()
    const signals: AbortSignal[] = []
    const gateway: VmGateway = {
      mode: 'preview',
      list(signal) {
        signals.push(signal)
        return signals.length === 1 ? old.promise : fresh.promise
      },
    }
    const inventory = createInventory(gateway)
    const first = inventory.reload()
    const second = inventory.reload()
    expect(signals[0]?.aborted).toBe(true)
    fresh.resolve(snapshot('最新'))
    await second
    old.resolve(snapshot('过期'))
    await first
    expect(inventory.items.value[0]?.name).toBe('最新')
    inventory.dispose()
  })
  it('does not restore state after disposal', async () => {
    const pending = deferred<VmSnapshot>()
    const inventory = createInventory({ mode: 'preview', list: () => pending.promise })
    const loading = inventory.reload()
    inventory.dispose()
    pending.resolve(snapshot('不应显示'))
    await loading
    expect(inventory.items.value).toEqual([])
  })
  it('clears stale data on failure and distinguishes failure from an empty response', async () => {
    let fail = false
    const inventory = createInventory({
      mode: 'preview',
      async list() {
        if (fail) throw new Error('internal')
        return snapshot('VM')
      },
    })
    await inventory.reload()
    fail = true
    await inventory.reload()
    expect(inventory.status.value).toBe('error')
    expect(inventory.items.value).toEqual([])
    expect(inventory.errorKey.value).toBe('errorUnavailableHint')
    inventory.dispose()
  })
})
