import { expect, test, type Page, type APIRequestContext } from '@playwright/test'
import type { Task } from '../../src/modules/tasks'
import type { components } from '../../src/generated/api'

async function openVm(page: Page, request: APIRequestContext) {
  let context = { daemonEpoch: '', sessionId: '' }
  let vm: components['schemas']['Vm'] = {
    id: 'operation-vm',
    name: '手机虚拟机',
    state: 'STOPPED',
    backend: 'QEMU',
    cpuCount: 2,
    memoryMiB: 2048,
    lifecycle: {
      instanceId: 'a'.repeat(32),
      revision: '9007199254740993',
      configRevision: 'config-1',
      actions: ['start'],
      uncertain: false,
    },
  }
  await page.route('**/api/v1/session', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    if (data.server) {
      data.server.capabilities.push('vm.lifecycle.v1')
      context = { daemonEpoch: data.server.daemonEpoch, sessionId: data.id }
    }
    await route.fulfill({ response, json: data })
  })
  await page.route('**/api/v1/vms', (route) => route.fulfill({ json: { context, items: [vm] } }))
  const tokenResponse = await request.post('http://127.0.0.1:5189/__fixture/pairing')
  const { pairingToken } = await tokenResponse.json()
  await page.goto('/#/vms')
  await page.getByLabel('配对码', { exact: true }).fill(pairingToken)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.locator('[data-vm]')).toHaveCount(1)
  return {
    context: () => context,
    vm: () => vm,
    update: (value: typeof vm) => {
      vm = value
    },
  }
}
function task(requestId: string, extra: Partial<Task> = {}): Task {
  return {
    id: 'operation-task',
    requestId,
    kind: 'vm_start',
    resource: 'vm:operation-vm',
    state: 'running',
    revision: '2',
    cancellable: false,
    phase: '',
    unit: '',
    completed: '0',
    total: null,
    createdMs: '1',
    finishedMs: null,
    resultAvailable: false,
    errorCode: null,
    ...extra,
  }
}
test('320px confirms once, preserves large revision and distinguishes admission from VM state', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const source = await openVm(page, request)
  let writes = 0
  await page.route('**/api/v1/vm-operations', async (route) => {
    writes++
    const body = route.request().postDataJSON()
    expect(body.context).toEqual(source.context())
    expect(body.expected.revision).toBe('9007199254740993')
    expect(body.requestId).toMatch(/^[0-9a-f]{32}$/)
    expect(route.request().headers()['x-droidvm-csrf']).toMatch(/^[0-9a-f]{64}$/)
    source.update({
      ...source.vm(),
      state: 'STARTING',
      lifecycle: { ...source.vm().lifecycle!, actions: ['stop'], revision: '9007199254740994' },
    })
    await route.fulfill({
      status: 202,
      json: {
        context: source.context(),
        task: task(body.requestId, { state: 'succeeded', finishedMs: '2', phase: 'admitted' }),
      },
    })
  })
  const card = page.locator('[data-vm]')
  await card.getByRole('button', { name: '启动', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('手机虚拟机')
  await page.getByRole('dialog').getByRole('button', { name: '启动', exact: true }).click()
  await expect(card).toContainText('操作已接纳')
  await expect(card.locator('.badge')).toHaveText('启动中')
  expect(writes).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('lost response uses read recovery, missing tasks stay locked and session restore never resends', async ({
  page,
  request,
}) => {
  const source = await openVm(page, request)
  let writes = 0,
    requestId = '',
    complete = false,
    reads = 0
  await page.route('**/api/v1/vm-operations', async (route) => {
    writes++
    requestId = route.request().postDataJSON().requestId
    await route.abort('connectionfailed')
  })
  await page.route('**/api/v1/vm-operations/*', async (route) => {
    reads++
    await route.fulfill({
      json: {
        context: source.context(),
        task: complete
          ? task(requestId, { state: 'failed', finishedMs: '2', errorCode: 'CONFLICT' })
          : null,
      },
    })
  })
  const card = page.locator('[data-vm]')
  await card.getByRole('button', { name: '启动', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '启动', exact: true }).click()
  await expect(card).toContainText('操作结果待核实')
  await card.getByRole('button', { name: '查询当前状态', exact: true }).click()
  expect(reads).toBeGreaterThan(0)
  await expect(card.getByRole('button', { name: '启动', exact: true })).toBeDisabled()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(card).toContainText('操作结果待核实')
  await expect(card.getByRole('button', { name: '启动', exact: true })).toBeDisabled()
  complete = true
  await card.getByRole('button', { name: '查询当前状态', exact: true }).click()
  await expect(card).toContainText('CONFLICT')
  await expect(card.getByRole('button', { name: '启动', exact: true })).toBeEnabled()
  expect(writes).toBe(1)
})
test('details confirm suspend in a nested dialog and uncertainty allows only stop', async ({
  page,
  request,
}) => {
  const source = await openVm(page, request)
  source.update({
    ...source.vm(),
    state: 'RUNNING',
    lifecycle: { ...source.vm().lifecycle!, actions: ['stop', 'reboot', 'suspend'] },
  })
  await page.getByRole('button', { name: '刷新列表', exact: true }).click()
  await page.locator('[data-vm]').locator('.vm-specs').click()
  await page.route('**/api/v1/vm-operations', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.action).toBe('suspend')
    source.update({
      ...source.vm(),
      lifecycle: {
        ...source.vm().lifecycle!,
        revision: '9007199254740994',
        actions: ['stop'],
        uncertain: true,
      },
    })
    await route.fulfill({
      status: 202,
      json: {
        context: source.context(),
        task: task(body.requestId, {
          kind: 'vm_suspend',
          state: 'failed',
          finishedMs: '2',
          errorCode: 'COMMIT_UNCERTAIN',
        }),
      },
    })
  })
  const details = page.getByRole('region', { name: '手机虚拟机' })
  await details.getByRole('button', { name: '挂起', exact: true }).click()
  await page
    .getByRole('dialog', { name: '挂起', exact: true })
    .getByRole('button', { name: '挂起', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(details).toContainText('待核实')
  await expect(details.getByRole('button', { name: '停止', exact: true })).toBeEnabled()
  // The App keeps the button in place and disables what the host no longer offers.
  await expect(details.getByRole('button', { name: '挂起', exact: true })).toBeDisabled()
})
