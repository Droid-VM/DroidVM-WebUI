import { expect, test, type Page, type APIRequestContext } from '@playwright/test'
import type { Task } from '../../src/modules/tasks'

async function openTasks(page: Page, request: APIRequestContext) {
  let context = { daemonEpoch: '', sessionId: '' }
  let items: Task[] = [
    {
      id: 'test-task',
      kind: 'disk_operation',
      resource: 'disk:手机任务与很长的磁盘名称'.repeat(4),
      state: 'running',
      cancellable: true,
      revision: '9007199254740993',
      phase: 'copy',
      unit: 'bytes',
      completed: '9007199254740993',
      total: null,
      createdMs: '1',
      finishedMs: null,
      resultAvailable: false,
      errorCode: null,
    },
  ]
  let reads = 0
  await page.route('**/api/v1/session', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    if (data.server) {
      data.server.capabilities.push('tasks.list.v1', 'tasks.cancel.v1')
      context = { daemonEpoch: data.server.daemonEpoch, sessionId: data.id }
    }
    await route.fulfill({ response, json: data })
  })
  await page.route('**/api/v1/tasks', async (route) => {
    reads++
    await route.fulfill({
      json: {
        context,
        cursor: { epoch: context.daemonEpoch, sequence: '9007199254740994' },
        items,
      },
    })
  })
  const tokenResponse = await request.post('http://127.0.0.1:5189/__fixture/pairing')
  const { pairingToken } = await tokenResponse.json()
  await page.goto('/#/tasks')
  await page.getByLabel('配对码', { exact: true }).fill(pairingToken)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.locator('[data-task]')).toHaveCount(1)
  return {
    update: (value: Task[]) => {
      items = value
    },
    items: () => items,
    reads: () => reads,
    context: () => context,
  }
}

test('mobile tasks show unknown progress and confirm cancellation once', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const state = await openTasks(page, request)
  await expect(page.getByRole('heading', { name: '磁盘操作', exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  let writes = 0
  await page.route('**/api/v1/tasks/cancel', async (route) => {
    writes++
    expect(route.request().headers()['x-droidvm-csrf']).toMatch(/^[0-9a-f]{64}$/)
    expect(route.request().postDataJSON()).toEqual({
      context: state.context(),
      taskId: 'test-task',
    })
    const task = { ...state.items()[0]!, state: 'cancelling' as const, cancellable: false }
    state.update([task])
    await route.fulfill({ json: { context: state.context(), task } })
  })
  await page.getByRole('button', { name: '取消任务', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('已提交的工作无法撤销')
  await page.getByRole('dialog').getByRole('button', { name: '取消任务', exact: true }).click()
  await expect(page.locator('[data-task]')).toContainText('正在取消')
  expect(writes).toBe(1)
  await expect(page.locator('[data-task]').getByRole('button', { name: '取消任务' })).toHaveCount(0)
})

test('lost cancellation stays locked after refresh and missing records without another POST', async ({
  page,
  request,
}) => {
  const state = await openTasks(page, request)
  let writes = 0
  await page.route('**/api/v1/tasks/cancel', async (route) => {
    writes++
    await route.abort('connectionfailed')
  })
  await page.getByRole('button', { name: '取消任务', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '取消任务', exact: true }).click()
  await expect(page.getByText('取消结果待核实', { exact: true })).toBeVisible()
  await expect(page.locator('[data-task]').getByRole('button', { name: '取消任务' })).toBeDisabled()
  const before = state.reads()
  await page.getByRole('button', { name: '查询当前状态', exact: true }).click()
  await expect.poll(state.reads).toBeGreaterThan(before)
  state.update([])
  await page.getByRole('button', { name: '查询当前状态', exact: true }).click()
  await expect(page.locator('[data-task]')).toHaveCount(0)
  await expect(page.getByText('取消结果待核实', { exact: true })).toBeVisible()
  expect(writes).toBe(1)
})

test('task response identity changes clear business state', async ({ page, request }) => {
  const state = await openTasks(page, request)
  await page.unroute('**/api/v1/tasks')
  await page.route('**/api/v1/tasks', async (route) => {
    await route.fulfill({
      json: {
        context: { ...state.context(), sessionId: 'f'.repeat(64) },
        cursor: { epoch: state.context().daemonEpoch, sequence: '1' },
        items: state.items(),
      },
    })
  })
  await page.getByRole('button', { name: '刷新列表', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('连接身份已变化')
  await expect(page.locator('[data-task]')).toHaveCount(0)
  await expect(page.locator('.app-shell')).toHaveCount(0)
})
