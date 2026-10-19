import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import { createOperations } from '../../tasks'
import {
  backupMaximumBytes,
  type ConfigurationBackupGateway,
  type ConfigurationBackupPreview,
} from '../api/http'
export { backupMaximumBytes } from '../api/http'
export const configurationBackupDownloadHref = '/api/v1/configuration-backup/file'
export const backupCategories = ['networks', 'disks', 'vms'] as const

export function createConfigurationBackup(
  gateway: ConfigurationBackupGateway | undefined,
  refresh: () => Promise<boolean>,
  newId = requestId,
) {
  const operations = createOperations(gateway, refresh)
  const name = ref(''),
    size = ref(0),
    raw = shallowRef<string | null>(null)
  const preview = shallowRef<ConfigurationBackupPreview | null>(null)
  const uploadId = ref<string | null>(null),
    problem = shallowRef<ApiProblem | null>(null)
  const reading = ref(false),
    staging = ref(false),
    acknowledged = ref(false),
    recoveryAcknowledged = ref(false)
  const reviewedFor = ref<string | null>(null)
  let controller: AbortController | undefined,
    generation = 0,
    identity: string | null = null
  let cleanup = Promise.resolve()
  const entry = computed(() => operations.entries.value.import ?? null)
  const pending = computed(() => !!entry.value && entry.value.state !== 'done')
  const result = computed(() => entry.value?.task?.configurationBackup ?? null)
  const recoveryRequired = computed(() => {
    const current = entry.value,
      task = current?.task
    if (
      !current ||
      !task ||
      task.state === 'succeeded' ||
      reviewedFor.value === current.request.requestId
    )
      return false
    if (result.value)
      return !!(
        result.value.completed.length ||
        result.value.uncertainStage ||
        result.value.recoveryRequired
      )
    // Missing receipts after an internal/uncertain failure do not prove that no category changed.
    return (
      ['failed', 'cancelled'].includes(task.state) &&
      ![
        'CONFLICT',
        'INVALID_ARGUMENT',
        'PERMISSION_DENIED',
        'UNAUTHENTICATED',
        'UNSUPPORTED',
      ].includes(task.errorCode ?? '')
    )
  })
  const busy = computed(() => reading.value || staging.value || pending.value)
  const canPreview = computed(
    () =>
      operations.supported.value && !busy.value && !recoveryRequired.value && raw.value !== null,
  )
  const canCommit = computed(
    () =>
      operations.supported.value &&
      !busy.value &&
      !recoveryRequired.value &&
      !!preview.value &&
      !!uploadId.value &&
      acknowledged.value,
  )
  function clearConfirmation() {
    acknowledged.value = false
    recoveryAcknowledged.value = false
  }
  async function release(id: string | null) {
    if (!id || !gateway) return
    try {
      await gateway.abort(id, new AbortController().signal)
    } catch {
      /* The bounded upload lease expires if cleanup cannot reach the host. */
    }
  }
  function clearPreview() {
    const previous = uploadId.value
    preview.value = null
    uploadId.value = null
    clearConfirmation()
    if (previous) cleanup = cleanup.then(() => release(previous))
  }
  function cancelPreparation() {
    generation++
    controller?.abort()
    reading.value = false
    staging.value = false
    clearPreview()
  }
  async function select(file: File | null) {
    if (pending.value || recoveryRequired.value) return
    cancelPreparation()
    raw.value = null
    name.value = file?.name ?? ''
    size.value = file?.size ?? 0
    problem.value = null
    if (!file) return
    const epoch = generation
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > backupMaximumBytes) {
      problem.value = describeApiError(
        new ApiError('invalid-response', 'Backup file exceeds input limit'),
      )
      return
    }
    reading.value = true
    try {
      const bytes = await file.arrayBuffer()
      if (epoch !== generation) return
      if (bytes.byteLength !== file.size)
        throw new ApiError('invalid-response', 'Backup file changed')
      // Keep the exact valid UTF-8 text, including a BOM. Do not round-trip JSON numbers.
      raw.value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    } catch (cause) {
      if (epoch === generation) problem.value = describeApiError(cause)
    } finally {
      if (epoch === generation) reading.value = false
    }
  }
  async function prepare() {
    if (!gateway || !canPreview.value || raw.value === null) return
    cancelPreparation()
    const current = new AbortController(),
      epoch = generation,
      document = raw.value
    controller = current
    staging.value = true
    problem.value = null
    let staged: string | null = null
    try {
      await cleanup
      if (current.signal.aborted || epoch !== generation) return
      staged = await gateway.stage(document, current.signal)
      if (current.signal.aborted || epoch !== generation) {
        void release(staged)
        return
      }
      const value = await gateway.preview(staged, current.signal)
      if (current.signal.aborted || epoch !== generation) {
        void release(staged)
        return
      }
      uploadId.value = staged
      preview.value = value
      acknowledged.value = false
      staged = null
    } catch (cause) {
      if (staged) void release(staged)
      if (!current.signal.aborted && epoch === generation) problem.value = describeApiError(cause)
    } finally {
      if (epoch === generation) staging.value = false
    }
  }
  async function commit() {
    if (!canCommit.value || !uploadId.value || !preview.value) return
    const request = {
      requestId: newId(),
      uploadId: uploadId.value,
      previewToken: preview.value.previewToken,
    }
    // The commit owns this upload now, including when its receipt is lost.
    uploadId.value = null
    preview.value = null
    clearConfirmation()
    raw.value = null
    await operations.submit('import', request)
  }
  function restartAfterReview() {
    if (entry.value?.state !== 'done' || !recoveryRequired.value || !recoveryAcknowledged.value)
      return
    reviewedFor.value = entry.value.request.requestId
    raw.value = null
    name.value = ''
    size.value = 0
    cancelPreparation()
  }
  function pause() {
    cancelPreparation()
    operations.pause()
  }
  function reset() {
    pause()
    operations.reset()
    identity = null
    raw.value = null
    name.value = ''
    size.value = 0
    problem.value = null
    reviewedFor.value = null
  }
  return {
    supported: operations.supported,
    name: readonly(name),
    size: readonly(size),
    preview: readonly(preview),
    problem: readonly(problem),
    reading: readonly(reading),
    staging: readonly(staging),
    hasFile: computed(() => raw.value !== null),
    acknowledged,
    recoveryAcknowledged,
    entry,
    result,
    pending,
    busy,
    canPreview,
    canCommit,
    recoveryRequired,
    checking: operations.checking,
    select,
    prepare,
    commit,
    restartAfterReview,
    reconcile: operations.reconcile,
    leave: clearConfirmation,
    pause,
    reset,
    bind(value: string) {
      if (identity !== value) reset()
      identity = value
      operations.bind(value)
    },
    dispose() {
      reset()
      operations.dispose()
    },
  }
}
export type ConfigurationBackup = ReturnType<typeof createConfigurationBackup>
export const configurationBackupKey: InjectionKey<ConfigurationBackup> =
  Symbol('configuration-backup')
export function useConfigurationBackup() {
  const value = inject(configurationBackupKey)
  if (!value) throw new Error('Configuration backup is not provided')
  return value
}
