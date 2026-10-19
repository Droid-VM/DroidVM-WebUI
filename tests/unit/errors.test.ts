import { describe, expect, it } from 'vitest'
import { ApiError, describeApiError } from '../../src/shared/api/errors'
import { createInventory } from '../../src/modules/vm/model/inventory'

describe('error recovery policy', () => {
  it('does not disclose unexpected transport details in user feedback', () => {
    const result = describeApiError(new Error('credential=private-value'))
    expect(result.descriptionKey).toBe('errorUnavailableHint')
    expect(result.action).toBe('read')
  })
  it.each(['permission-denied', 'unauthenticated', 'unsupported', 'invalid-response'] as const)(
    '%s never suggests blind retry',
    (code) => {
      expect(describeApiError(new ApiError(code, 'internal')).action).toBe('none')
    },
  )
  it('unknown write results require reconciliation, not resubmission', () => {
    const result = describeApiError(new ApiError('commit-uncertain', 'internal'))
    expect(result.action).toBe('reconcile')
    expect(result.actionLabelKey).toBe('queryStatus')
  })
  it('reports access failure without retrying or keeping a previous inventory', async () => {
    let calls = 0
    const inventory = createInventory({
      mode: 'preview',
      async list() {
        calls++
        throw new ApiError('permission-denied', 'internal')
      },
    })
    await inventory.reload()
    expect(calls).toBe(1)
    expect(inventory.problem.value?.code).toBe('permission-denied')
    expect(inventory.items.value).toEqual([])
    inventory.dispose()
  })
})
