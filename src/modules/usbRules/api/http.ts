import type { components } from '../../../generated/api'
import { compileContract } from '../../../shared/api/contract'
import { ApiError } from '../../../shared/api/errors'
import type { HttpClient } from '../../../shared/api/httpClient'
import { stageConfiguration, configurationChunkBytes } from '../../../shared/api/stagedUpload'
import { checkTask, type Task } from '../../tasks'
import type { UsbRulesGateway } from './gateway'

type Schemas = components['schemas']
interface Access {
  context: Schemas['ServerContext']
  csrfToken: string
  capabilities: readonly string[]
  administrator: boolean
  manageTasks: boolean
}
const pageValid = compileContract<Schemas['UsbRulesPage']>('UsbRulesPage')
const documentValid = compileContract<Schemas['UsbRulesDocument']>('UsbRulesDocument')
const targetsValid = compileContract<Schemas['UsbRuleTargets']>('UsbRuleTargets')
const previewValid = compileContract<Schemas['UsbRulesPreview']>('UsbRulesPreview')
const uploadValid = compileContract<Schemas['ConfigUpload']>('ConfigUpload')
const appendValid = compileContract<Schemas['ConfigAppend']>('ConfigAppend')
const emptyValid = compileContract<Schemas['ConfigEmpty']>('ConfigEmpty')
const taskValid = compileContract<Schemas['TaskResponse']>('TaskResponse')
const statusValid = compileContract<Schemas['UsbRulesStatus']>('UsbRulesStatus')
const maximum = 8 * 1024 * 1024
const invalid = () => new ApiError('invalid-response', 'Invalid USB rules response')

export function createUsbRulesGateway(
  client: HttpClient,
  access: () => Access | null,
): UsbRulesGateway {
  const permits = (value: Access | null) =>
    !!value?.administrator && value.manageTasks && value.capabilities.includes('usb.rules.v1')
  function requireAccess() {
    const value = access()
    if (!value) throw new ApiError('unauthenticated', 'Session required')
    if (!permits(value)) throw new ApiError('unsupported', 'USB rules unavailable')
    return value
  }
  async function request<T extends { context: Access['context'] }>(
    current: Access,
    operation: string,
    input: object,
    signal: AbortSignal,
    validate: (value: unknown) => value is T,
    status: 200 | 202 = 200,
  ): Promise<T> {
    const result = await client.postJson(
      `/api/v1/usb-rules/${operation}`,
      { ...input, context: current.context },
      signal,
      { csrf: current.csrfToken, status },
    )
    if (!validate(result)) throw invalid()
    if (
      result.context.daemonEpoch !== current.context.daemonEpoch ||
      result.context.sessionId !== current.context.sessionId
    )
      throw new ApiError('context-changed', 'USB rules identity changed')
    return result
  }
  function task(task: Task, requestId: string) {
    if (task.kind !== 'usb_rules' || task.resource !== 'usb-rules' || task.requestId !== requestId)
      throw invalid()
    checkTask(task)
    return task
  }
  return {
    supported: () => permits(access()),
    previewSupported: () =>
      permits(access()) && !!access()?.capabilities.includes('usb.rules.preview.v1'),
    async preview(revision, signal) {
      const current = requireAccess()
      if (!current.capabilities.includes('usb.rules.preview.v1'))
        throw new ApiError('unsupported', 'USB rule preview unavailable')
      const result = await request(current, 'preview', { revision }, signal, previewValid)
      if (
        result.revision !== revision ||
        new Set(result.items.map((item) => item.device.id)).size !== result.items.length
      )
        throw invalid()
      for (const { device, eligible, match } of result.items) {
        if (
          device.id !== `${device.sysfs}#${device.deviceNumber}` ||
          device.state === 'unknown' ||
          eligible !== (result.enabled && device.state !== 'claimed' && !device.locked) ||
          result.enabled !== !!match
        )
          throw invalid()
        if (
          match &&
          ((match.layer === null
            ? match.index !== -1 || match.target !== 'host'
            : match.index < 0) ||
            (match.target === 'vm'
              ? !match.vmId
              : match.vmId !== null || match.controllerId !== null))
        )
          throw invalid()
      }
      return result
    },
    async read(signal) {
      const current = requireAccess()
      let page = await request(current, 'read', { revision: null, offset: 0 }, signal, pageValid)
      const { revision, total, persistence } = page
      if (!Number.isSafeInteger(total) || total <= 0 || total > maximum) throw invalid()
      const bytes = new Uint8Array(total)
      let offset = 0
      for (;;) {
        if (
          page.revision !== revision ||
          page.total !== total ||
          page.persistence !== persistence ||
          page.offset !== offset
        )
          throw invalid()
        let raw: string
        try {
          raw = atob(page.data)
        } catch {
          throw invalid()
        }
        if (
          btoa(raw) !== page.data ||
          raw.length !== Math.min(configurationChunkBytes, total - offset)
        )
          throw invalid()
        bytes.set(
          Uint8Array.from(raw, (c) => c.charCodeAt(0)),
          offset,
        )
        offset += raw.length
        if (page.next !== (offset === total ? null : offset)) throw invalid()
        if (page.next === null) break
        page = await request(current, 'read', { revision, offset }, signal, pageValid)
      }
      let rules: unknown
      try {
        rules = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      } catch {
        throw invalid()
      }
      if (!documentValid(rules)) throw invalid()
      return { revision, persistence, rules }
    },
    async targets(signal) {
      const result = await request(requireAccess(), 'targets', {}, signal, targetsValid)
      if (new Set(result.items.map((item) => item.vmId)).size !== result.items.length)
        throw invalid()
      return result.items
    },
    async stage(revision, json, signal) {
      const current = requireAccess()
      return stageConfiguration(json, maximum, {
        begin: (bytes) => request(current, 'begin', { revision, bytes }, signal, uploadValid),
        append: (uploadId, offset, data) =>
          request(current, 'append', { uploadId, offset, data }, signal, appendValid),
        abort: async (uploadId) => {
          await request(current, 'abort', { uploadId }, new AbortController().signal, emptyValid)
        },
      })
    },
    async abort(uploadId, signal) {
      await request(requireAccess(), 'abort', { uploadId }, signal, emptyValid)
    },
    async submit(input, signal) {
      const result = await request(requireAccess(), 'commit', input, signal, taskValid, 202)
      return task(result.task, input.requestId)
    },
    async find(input, signal) {
      const result = await request(
        requireAccess(),
        'status',
        { requestId: input.requestId },
        signal,
        statusValid,
      )
      if ((result.task?.state === 'succeeded') !== !!result.version) throw invalid()
      return result.task ? task(result.task, input.requestId) : null
    },
  }
}
