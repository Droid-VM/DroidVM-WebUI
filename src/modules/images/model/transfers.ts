import { computed, inject, reactive, ref, watch, type InjectionKey } from 'vue'
import { createChunkedUpload } from '../../../shared/model/chunkedUpload'
import { browserUploadFiles } from '../../../shared/lib/uploadFiles'
import { requestId } from '../../../shared/api/requestId'
import { createOperations } from '../../tasks'
import { validImageDestination, type ImageTransferGateway } from '../api/transfers'
export { validImageDestination } from '../api/transfers'
export function createImageTransfers(
  gateway: ImageTransferGateway | undefined,
  acceptSource: (path: string) => boolean,
  newId = requestId,
) {
  let identity: string | null = null
  const uploader = createChunkedUpload(gateway?.upload, {
    newId,
    files(files) {
      const result = browserUploadFiles(files, 1)
      return result && files[0]!.size > 0 ? result : null
    },
  })
  const operations = createOperations(gateway?.install, async () => true, gateway?.install.tracking)
  const draft = reactive({ folder: '', name: '' }),
    acknowledged = ref(false),
    outcomeAcknowledged = ref(false),
    handedOff = ref(false),
    handoffBlocked = ref(false)
  const entry = computed(() => operations.entries.value.install ?? null)
  const result = computed(() => entry.value?.task?.imageInstall ?? null)
  const succeeded = computed(
    () =>
      entry.value?.state === 'done' &&
      entry.value.task?.state === 'succeeded' &&
      !!result.value?.installed &&
      result.value.durabilityConfirmed &&
      !result.value.installationUncertain &&
      !result.value.recoveryRequired,
  )
  const recoveryRequired = computed(
    () => !!(result.value?.installationUncertain || result.value?.recoveryRequired),
  )
  const pending = computed(
    () =>
      uploader.pending.value ||
      !!operations.recoveryProblem.value ||
      (!!entry.value && entry.value.state !== 'done'),
  )
  const editable = computed(
    () =>
      !entry.value &&
      !uploader.uploadBusy.value &&
      !uploader.hashBusy.value &&
      !uploader.recoveryProblem.value &&
      !operations.recoveryProblem.value,
  )
  const canInstall = computed(
    () =>
      operations.supported.value &&
      operations.allowed('install') &&
      uploader.uploadPhase.value === 'ready' &&
      !!uploader.uploadId.value &&
      editable.value &&
      acknowledged.value &&
      validImageDestination(draft.folder, draft.name),
  )
  const canRemove = computed(
    () =>
      uploader.canDelete.value &&
      !operations.recoveryProblem.value &&
      (!entry.value || (entry.value.state === 'done' && !recoveryRequired.value)),
  )
  const canReset = computed(
    () =>
      !uploader.uploadBusy.value &&
      !uploader.hashBusy.value &&
      !uploader.recoveryProblem.value &&
      !operations.recoveryProblem.value &&
      outcomeAcknowledged.value &&
      (!entry.value || (entry.value.state === 'done' && !recoveryRequired.value)),
  )
  const stopDraft = watch(
    draft,
    () => {
      acknowledged.value = false
    },
    { flush: 'sync' },
  )
  function select(files: File[]) {
    if (entry.value) return
    uploader.select(files)
    if (uploader.metadata.value) draft.name = uploader.metadata.value[0]!.name
    acknowledged.value = false
    handoffBlocked.value = false
  }
  async function install() {
    if (!canInstall.value || !uploader.uploadId.value) return
    const request = {
      requestId: newId(),
      uploadId: uploader.uploadId.value,
      folder: draft.folder,
      name: draft.name,
    }
    acknowledged.value = false
    outcomeAcknowledged.value = false
    await operations.submit('install', request)
  }
  function handoff() {
    if (!succeeded.value || !result.value) return false
    const accepted = acceptSource(result.value.source)
    handoffBlocked.value = !accepted
    handedOff.value = accepted
    return accepted
  }
  async function remove() {
    if (canRemove.value) await uploader.deleteUpload()
  }
  function startNew() {
    if (!canReset.value) return
    operations.reset()
    uploader.reset()
    if (identity) {
      uploader.bind(identity)
      operations.bind(identity)
    }
    acknowledged.value = false
    outcomeAcknowledged.value = false
    handedOff.value = false
    handoffBlocked.value = false
    draft.name = ''
  }
  function pause() {
    uploader.pause()
    operations.pause()
    acknowledged.value = false
    outcomeAcknowledged.value = false
  }
  function clearState() {
    pause()
    identity = null
    draft.folder = ''
    draft.name = ''
    handedOff.value = false
    handoffBlocked.value = false
  }
  function reset() {
    clearState()
    uploader.reset()
    operations.reset()
  }
  return {
    uploader,
    draft,
    acknowledged,
    outcomeAcknowledged,
    entry,
    result,
    succeeded,
    recoveryRequired,
    pending,
    editable,
    canInstall,
    canRemove,
    canReset,
    handedOff,
    handoffBlocked,
    supported: operations.supported,
    checking: operations.checking,
    recoveryProblem: operations.recoveryProblem,
    clearInstallTracking() {
      if (recoveryRequired.value || (entry.value && entry.value.state !== 'done')) return
      acknowledged.value = false
      operations.clearTracking()
    },
    clearUploadTracking() {
      if (recoveryRequired.value || (entry.value && entry.value.state !== 'done')) return
      acknowledged.value = false
      uploader.clearTracking()
    },
    select,
    install,
    handoff,
    remove,
    startNew,
    pause,
    reset,
    async reconcile() {
      await operations.reconcile()
      return !entry.value?.problem
    },
    bind(value: string) {
      if (identity === value) return
      clearState()
      identity = value
      uploader.bind(value)
      operations.bind(value)
    },
    leave() {
      uploader.pause()
      acknowledged.value = false
      outcomeAcknowledged.value = false
    },
    dispose() {
      clearState()
      stopDraft()
      uploader.dispose()
      operations.dispose()
    },
  }
}
export type ImageTransfers = ReturnType<typeof createImageTransfers>
export const imageTransfersKey: InjectionKey<ImageTransfers> = Symbol('image-transfers')
export function useImageTransfers() {
  const value = inject(imageTransfersKey)
  if (!value) throw new Error('Image transfers are not provided')
  return value
}
