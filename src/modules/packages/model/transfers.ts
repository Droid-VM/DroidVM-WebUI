import { computed, inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../../../shared/api/errors'
import { requestId } from '../../../shared/api/requestId'
import { createChunkedUpload, type UploadPhase } from '../../../shared/model/chunkedUpload'
import type { PackageTransfer, PackageTransferGateway } from '../api/transfer'
import { uploadFiles } from './transferFiles'
import { createDownloadJournal, type DownloadRecord } from './downloadJournal'
import { JournalError, type RecoveryProblem } from '../../../shared/model/operationJournal'
export { packageDownloadHref } from './transferFiles'
const conflict = () => new ApiError('conflict', 'Package transfer offsets changed')
export function createPackageTransfers(
  gateway: PackageTransferGateway | undefined,
  newId = requestId,
) {
  const uploader = createChunkedUpload(gateway, {
    files: uploadFiles,
    ready: (value) => !!value.source,
    newId,
  })
  const supported = uploader.supported
  const journal = gateway?.downloadTracking
    ? createDownloadJournal(gateway.downloadTracking)
    : undefined
  const downloadRecord = shallowRef<DownloadRecord | null>(null)
  const downloadRestored = ref(false),
    downloadObserved = ref(false),
    downloadRecoveryProblem = ref<RecoveryProblem | null>(null)
  const download = shallowRef<PackageTransfer | null>(null),
    downloadId = ref<string | null>(null),
    downloadPhase = ref<UploadPhase>('idle')
  const downloadProblem = shallowRef<ApiProblem | null>(null),
    downloadBusy = ref(false)
  let downloadController: AbortController | undefined
  const identity = ref<string | null>(null),
    disposed = ref(false)
  let generation = 0
  const writable = () =>
    !disposed.value && !downloadRecoveryProblem.value && (!journal || identity.value !== null)
  const canPrepareDownload = computed(
    () => supported.value && writable() && !downloadId.value && !downloadBusy.value,
  )
  const canDeleteDownload = computed(
    () =>
      supported.value &&
      writable() &&
      !!downloadId.value &&
      !downloadBusy.value &&
      (!downloadRestored.value || downloadObserved.value),
  )
  const canAccessDownload = computed(
    () =>
      supported.value &&
      writable() &&
      downloadObserved.value &&
      !downloadBusy.value &&
      downloadPhase.value === 'ready' &&
      !!download.value &&
      downloadRecord.value?.step === null,
  )
  const downloadDeleteUnknown = computed(() => downloadRecord.value?.step === 'delete')
  function journalFailed(cause: unknown) {
    downloadRecoveryProblem.value = cause instanceof JournalError ? cause.problem : 'invalid'
  }
  function persistDownload(replace = false) {
    if (!journal) return
    if (!downloadRecord.value || identity.value === null) throw new JournalError('invalid')
    const snapshot = journal.snapshot(downloadRecord.value)
    downloadRecord.value = snapshot
    journal.save(identity.value, [{ key: 'download', request: snapshot }], replace)
  }
  function clearDownloadLocal() {
    downloadController?.abort()
    downloadRecord.value = null
    downloadRestored.value = false
    downloadObserved.value = false
    download.value = null
    downloadId.value = null
    downloadPhase.value = 'idle'
    downloadProblem.value = null
  }
  async function downloadWork(
    kind: 'begin' | 'inspect' | 'delete',
    work: (signal: AbortSignal) => Promise<PackageTransfer | void>,
  ) {
    if (!gateway || !supported.value || downloadBusy.value) return
    const current = new AbortController(),
      epoch = generation
    downloadController = current
    downloadBusy.value = true
    downloadProblem.value = null
    try {
      if (kind !== 'inspect') persistDownload()
      const value = await work(current.signal)
      if (current.signal.aborted || epoch !== generation) return
      if (value) {
        if (
          value.id !== downloadId.value ||
          value.kind !== 'download' ||
          value.state === 'receiving'
        )
          throw conflict()
        download.value = value
        downloadObserved.value = true
        if (downloadRecord.value?.step !== 'delete') {
          if (downloadRecord.value) downloadRecord.value = { ...downloadRecord.value, step: null }
          downloadPhase.value = value.state === 'ready' ? 'ready' : 'failed'
        } else downloadPhase.value = 'unknown'
        persistDownload()
      } else if (kind === 'delete') {
        journal?.clear(identity.value)
        clearDownloadLocal()
      } else throw conflict()
    } catch (cause) {
      if (!current.signal.aborted && epoch === generation) {
        if (cause instanceof JournalError) journalFailed(cause)
        const problem = describeApiError(cause)
        downloadProblem.value =
          kind === 'inspect' && problem.code === 'unavailable'
            ? {
                ...problem,
                titleKey: 'transferDownloadUnavailableTitle',
                descriptionKey: 'transferDownloadUnavailableHint',
              }
            : problem
        downloadPhase.value = 'unknown'
      }
    } finally {
      if (epoch === generation && downloadController === current) downloadBusy.value = false
    }
  }
  async function prepareDownload(exportRequestId: string) {
    if (!gateway || !canPrepareDownload.value) return
    downloadId.value = newId()
    downloadRecord.value = { downloadId: downloadId.value, exportRequestId, step: 'begin' }
    downloadPhase.value = 'running'
    await downloadWork('begin', (signal) =>
      gateway.beginDownload(downloadId.value!, exportRequestId, signal),
    )
  }
  async function inspectDownload() {
    if (!gateway || !downloadId.value) return
    await downloadWork('inspect', (signal) => gateway.downloadStatus(downloadId.value!, signal))
  }
  async function deleteDownload() {
    if (!gateway || !canDeleteDownload.value || !downloadRecord.value) return
    downloadRecord.value = { ...downloadRecord.value, step: 'delete' }
    await downloadWork('delete', (signal) => gateway.remove('download', downloadId.value!, signal))
  }
  function forgetDownload() {
    if (downloadBusy.value) return
    try {
      journal?.clear(identity.value, true)
      clearDownloadLocal()
      downloadRecoveryProblem.value = null
    } catch (cause) {
      journalFailed(cause)
    }
  }
  function clearDownloadTracking() {
    if (!journal || !downloadRecoveryProblem.value || downloadBusy.value) return
    try {
      if (downloadRecord.value) persistDownload(true)
      else journal.clear(identity.value, true)
      downloadRecoveryProblem.value = null
    } catch (cause) {
      journalFailed(cause)
    }
  }

  function pause() {
    uploader.pause()
    downloadController?.abort()
    if (downloadBusy.value) downloadPhase.value = 'unknown'
    downloadBusy.value = false
  }
  function clearState() {
    pause()
    generation++
    identity.value = null
    clearDownloadLocal()
    downloadRecoveryProblem.value = null
  }
  function reset() {
    clearState()
    uploader.reset()
    try {
      journal?.clear(null, true)
    } catch (cause) {
      journalFailed(cause)
    }
  }
  return {
    ...uploader,
    limits: computed(() => uploader.upload.value?.limits ?? download.value?.limits ?? null),
    download: readonly(download),
    downloadId: readonly(downloadId),
    downloadPhase: readonly(downloadPhase),
    downloadProblem: readonly(downloadProblem),
    downloadBusy: readonly(downloadBusy),
    downloadRestored: readonly(downloadRestored),
    downloadRecoveryProblem: readonly(downloadRecoveryProblem),
    canPrepareDownload,
    canDeleteDownload,
    canAccessDownload,
    downloadDeleteUnknown,
    clearDownloadTracking,
    pending: computed(
      () =>
        uploader.pending.value ||
        !!downloadRecoveryProblem.value ||
        (!!downloadId.value && ['unknown', 'running'].includes(downloadPhase.value)),
    ),
    prepareDownload,
    inspectDownload,
    deleteDownload,
    forgetDownload,
    pause,
    reset,
    dispose() {
      disposed.value = true
      clearState()
      uploader.dispose()
    },
    bind(value: string) {
      if (disposed.value || identity.value === value) return
      clearState()
      identity.value = value
      uploader.bind(value)
      if (journal) {
        try {
          const record = journal.load(value)[0]?.request
          if (record) {
            downloadRecord.value = record
            downloadId.value = record.downloadId
            downloadRestored.value = true
            downloadPhase.value = 'unknown'
          }
        } catch (cause) {
          journalFailed(cause)
        }
      }
    },
  }
}
export type PackageTransfers = ReturnType<typeof createPackageTransfers>
export const packageTransfersKey: InjectionKey<PackageTransfers> = Symbol('package-transfers')
export function usePackageTransfers() {
  const value = inject(packageTransfersKey)
  if (!value) throw new Error('Package transfers are not provided')
  return value
}
