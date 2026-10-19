import { computed, readonly, ref, shallowRef, type ShallowRef } from 'vue'
import { ApiError, describeApiError, type ApiProblem } from '../api/errors'
import { requestId } from '../api/requestId'
import { encodeChunk, uploadChunkBytes, type UploadFile } from '../lib/uploadFiles'
import { hashUploadFiles } from '../lib/hashUploadFiles'
import { JournalError, type RecoveryProblem } from './operationJournal'
import {
  createUploadJournal,
  type UploadRecord,
  type UploadStep,
  type UploadTracking,
} from './uploadJournal'
export type UploadPhase = 'idle' | 'running' | 'paused' | 'unknown' | 'retry' | 'ready' | 'failed'
export interface UploadSnapshot {
  id: string
  kind: string
  state: string
  files: { index: number; name: string; sizeBytes: string; offsetBytes: string }[]
  limits: { chunkBytes: number }
}
export interface UploadGateway<T extends UploadSnapshot> {
  tracking?: UploadTracking
  supported(): boolean
  beginUpload(id: string, files: UploadFile[], signal: AbortSignal): Promise<T>
  uploadStatus(id: string, signal: AbortSignal): Promise<T>
  chunk(id: string, index: number, offset: string, data: string, signal: AbortSignal): Promise<T>
  finish(id: string, signal: AbortSignal): Promise<T>
  remove(kind: 'upload', id: string, signal: AbortSignal): Promise<void>
}
const conflict = () => new ApiError('conflict', 'Upload identity or offsets changed')
const fileMismatch = (): ApiProblem => ({
  ...describeApiError(conflict()),
  titleKey: 'transferFileMismatch',
  descriptionKey: 'transferFileMismatchHint',
})
// Domain adapters validate contracts. This engine retains original File references
// and reconciles exact offsets before any explicitly requested continuation.
export function createChunkedUpload<T extends UploadSnapshot>(
  gateway: UploadGateway<T> | undefined,
  options: {
    files(files: readonly File[]): UploadFile[] | null
    ready?(value: T): boolean
    newId?: () => string
  },
) {
  const newId = options.newId ?? requestId,
    ready = options.ready ?? (() => true)
  const supported = computed(() => !disposed && !!gateway?.supported())
  const journal = gateway?.tracking ? createUploadJournal(gateway.tracking) : undefined
  const record = shallowRef<UploadRecord | null>(null)
  const restored = ref(false),
    observed = ref(false),
    hashBusy = ref(false),
    recoveryProblem = ref<RecoveryProblem | null>(null)
  const selected = shallowRef<File[]>([])
  const upload: ShallowRef<T | null> = shallowRef(null)
  const uploadId = ref<string | null>(null)
  const uploadPhase = ref<UploadPhase>('idle'),
    uploadProblem = shallowRef<ApiProblem | null>(null),
    uploadBusy = ref(false)
  let uploadController: AbortController | undefined
  let disposed = false
  let generation = 0,
    identity: string | null = null,
    step: UploadStep | null = null
  const metadata = computed(
    () =>
      record.value?.files.map(({ name, sizeBytes }) => ({ name, sizeBytes })) ??
      options.files(selected.value),
  )
  const needsFiles = computed(
    () =>
      !!record.value &&
      !selected.value.length &&
      uploadPhase.value !== 'ready' &&
      record.value.files.some((file, index) => file.sizeBytes !== record.value!.offsets[index]),
  )
  const writable = () => !recoveryProblem.value && (!journal || identity !== null)
  const totalBytes = computed(() =>
    (upload.value?.files ?? metadata.value ?? []).reduce(
      (sum, file) => sum + BigInt(file.sizeBytes),
      0n,
    ),
  )
  const doneBytes = computed(
    () => upload.value?.files.reduce((sum, file) => sum + BigInt(file.offsetBytes), 0n) ?? 0n,
  )
  const percent = computed(() =>
    totalBytes.value
      ? Number((doneBytes.value * 10000n) / totalBytes.value) / 100
      : uploadPhase.value === 'ready'
        ? 100
        : 0,
  )
  const pending = computed(() => !!uploadId.value && uploadPhase.value !== 'ready')
  const canStart = computed(
    () =>
      supported.value &&
      writable() &&
      !uploadId.value &&
      !uploadBusy.value &&
      !hashBusy.value &&
      !!metadata.value,
  )
  const canResume = computed(
    () =>
      supported.value &&
      writable() &&
      !!uploadId.value &&
      upload.value?.state === 'receiving' &&
      !uploadBusy.value &&
      !hashBusy.value &&
      !needsFiles.value &&
      ['paused', 'retry'].includes(uploadPhase.value),
  )
  const canDelete = computed(
    () =>
      supported.value &&
      writable() &&
      !!uploadId.value &&
      !uploadBusy.value &&
      !hashBusy.value &&
      (!restored.value || observed.value),
  )
  function journalFailed(cause: unknown) {
    recoveryProblem.value = cause instanceof JournalError ? cause.problem : 'invalid'
  }
  function persist(replace = false) {
    if (!journal) return
    if (!record.value || identity === null) throw new JournalError('invalid')
    const next = journal.snapshot({ ...record.value, step })
    // Store the exact attempted write before transport, including a failed local save.
    record.value = next
    journal.save(identity, [{ key: 'upload', request: next }], replace)
  }
  function acknowledge(value: T) {
    if (record.value)
      record.value = { ...record.value, offsets: value.files.map((file) => file.offsetBytes) }
    persist()
  }
  function select(files: File[]) {
    if (uploadId.value || uploadBusy.value || hashBusy.value) return
    selected.value = [...files]
    uploadProblem.value = null
  }
  function verify(value: T) {
    const files = metadata.value
    if (
      value.id !== uploadId.value ||
      value.kind !== 'upload' ||
      !files ||
      value.files.length !== files.length ||
      value.files.some(
        (file, index) =>
          file.index !== index ||
          file.name !== files[index]?.name ||
          file.sizeBytes !== files[index]?.sizeBytes,
      )
    )
      throw conflict()
    if (
      !Number.isSafeInteger(value.limits.chunkBytes) ||
      value.limits.chunkBytes <= 0 ||
      value.files.some(
        (file) =>
          !/^(0|[1-9][0-9]*)$/.test(file.offsetBytes) ||
          BigInt(file.offsetBytes) > BigInt(file.sizeBytes),
      )
    )
      throw conflict()
    if (
      value.state === 'ready' &&
      (!ready(value) || value.files.some((file) => file.offsetBytes !== file.sizeBytes))
    )
      throw conflict()
  }
  function adopt(value: T) {
    verify(value)
    upload.value = value
    if (value.state === 'ready') {
      step = null
      uploadPhase.value = 'ready'
    } else if (value.state !== 'receiving') {
      step = null
      uploadPhase.value = 'failed'
    }
  }
  function verifyChunk(
    value: T,
    pending: Extract<UploadStep, { kind: 'chunk' }>,
    allowOld: boolean,
  ) {
    verify(value)
    if (
      value.state !== 'receiving' ||
      value.files.some(
        (file, index) => index !== pending.index && file.offsetBytes !== pending.offsets[index],
      )
    )
      throw conflict()
    const offset = value.files[pending.index]?.offsetBytes
    if (offset !== pending.end && (!allowOld || offset !== pending.oldOffset)) throw conflict()
    return offset === pending.end
  }
  async function pump(current: AbortController, epoch: number) {
    if (!gateway || !uploadId.value) return
    while (!current.signal.aborted && epoch === generation && uploadPhase.value === 'running') {
      const value = upload.value
      if (!value || value.state !== 'receiving') return
      const next = value.files.find((file) => BigInt(file.offsetBytes) < BigInt(file.sizeBytes))
      if (!next) {
        step = { kind: 'finish' }
        persist()
        const finished = await gateway.finish(uploadId.value, current.signal)
        if (current.signal.aborted || epoch !== generation) return
        if (finished.files.some((file) => file.offsetBytes !== file.sizeBytes)) throw conflict()
        adopt(finished)
        if (finished.state === 'receiving') {
          uploadPhase.value = 'retry'
          step = { kind: 'finish' }
        }
        acknowledge(finished)
        return
      }
      const file = selected.value[next.index]
      if (!file) throw conflict()
      const offset = Number(next.offsetBytes),
        end = Math.min(file.size, offset + Math.min(uploadChunkBytes, value.limits.chunkBytes))
      const data = await encodeChunk(file, offset, end)
      if (current.signal.aborted || epoch !== generation) return
      const pending: Extract<UploadStep, { kind: 'chunk' }> = {
        kind: 'chunk',
        index: next.index,
        oldOffset: next.offsetBytes,
        end: String(end),
        offsets: value.files.map((row) => row.offsetBytes),
      }
      step = pending
      persist()
      const updated = await gateway.chunk(
        uploadId.value,
        next.index,
        next.offsetBytes,
        data,
        current.signal,
      )
      if (current.signal.aborted || epoch !== generation) return
      verifyChunk(updated, pending, false)
      upload.value = updated
      step = null
      acknowledge(updated)
    }
  }
  async function run(work: (current: AbortController, epoch: number) => Promise<void>) {
    if (!gateway || !supported.value || uploadBusy.value || hashBusy.value) return
    const current = new AbortController(),
      epoch = generation
    uploadController = current
    uploadBusy.value = true
    uploadProblem.value = null
    try {
      await work(current, epoch)
    } catch (cause) {
      if (!current.signal.aborted && epoch === generation) {
        if (cause instanceof JournalError) journalFailed(cause)
        uploadProblem.value = describeApiError(cause)
        uploadPhase.value = step ? 'unknown' : 'failed'
      }
    } finally {
      if (epoch === generation && uploadController === current) {
        uploadBusy.value = false
        hashBusy.value = false
      }
    }
  }
  async function start() {
    if (!canStart.value || !metadata.value || !gateway) return
    const files = metadata.value
    const chosen = [...selected.value]
    await run(async (current, epoch) => {
      uploadPhase.value = 'running'
      let digests: string[] = []
      if (journal) {
        hashBusy.value = true
        digests = await hashUploadFiles(chosen, current.signal)
        if (current.signal.aborted || epoch !== generation) return
        hashBusy.value = false
      }
      uploadId.value = newId()
      step = { kind: 'begin' }
      if (journal)
        record.value = {
          uploadId: uploadId.value,
          files: files.map((file, index) => ({ ...file, sha256: digests[index]! })),
          offsets: files.map(() => '0'),
          step,
        }
      persist()
      const value = await gateway.beginUpload(uploadId.value!, files, current.signal)
      if (current.signal.aborted || epoch !== generation) return
      if (value.files.some((file) => file.offsetBytes !== '0')) throw conflict()
      adopt(value)
      observed.value = true
      if (value.state === 'receiving') {
        step = null
        acknowledge(value)
        await pump(current, epoch)
      } else acknowledge(value)
    })
  }
  function pauseUpload() {
    generation++
    uploadController?.abort()
    uploadBusy.value = false
    hashBusy.value = false
    if (uploadPhase.value === 'running') uploadPhase.value = step ? 'unknown' : 'paused'
  }
  async function inspectUpload() {
    if (!gateway || !uploadId.value || uploadBusy.value) return
    await run(async (current, epoch) => {
      const value = await gateway.uploadStatus(uploadId.value!, current.signal)
      if (current.signal.aborted || epoch !== generation) return
      verify(value)
      const pendingStep = step
      if (pendingStep?.kind === 'begin' && value.files.some((file) => file.offsetBytes !== '0'))
        throw conflict()
      if (pendingStep?.kind === 'chunk') {
        const advanced = verifyChunk(value, pendingStep, true)
        upload.value = value
        uploadPhase.value = advanced ? 'paused' : 'retry'
        if (advanced) step = null
      } else if (pendingStep?.kind === 'delete') {
        // A surviving ready upload is not proof that an interrupted DELETE
        // completed. Keep the deletion unresolved until explicit retry/forget.
        upload.value = value
        uploadPhase.value = 'unknown'
      } else {
        if (
          record.value &&
          value.files.some((file, index) => file.offsetBytes !== record.value!.offsets[index])
        )
          throw conflict()
        adopt(value)
        if (value.state === 'receiving') {
          if (pendingStep?.kind === 'finish') {
            if (value.files.some((file) => file.offsetBytes !== file.sizeBytes)) throw conflict()
            uploadPhase.value = 'retry'
          } else {
            step = null
            uploadPhase.value = 'paused'
          }
        }
      }
      observed.value = true
      acknowledge(value)
    })
  }
  async function resumeUpload() {
    if (!gateway || !canResume.value) return
    uploadPhase.value = 'running'
    step = null
    await run(pump)
  }
  async function deleteUpload() {
    if (!gateway || !uploadId.value || !canDelete.value) return
    step = { kind: 'delete' }
    await run(async (current, epoch) => {
      persist()
      await gateway.remove('upload', uploadId.value!, current.signal)
      if (current.signal.aborted || epoch !== generation) return
      journal?.clear(identity)
      clearLocal()
    })
  }
  function forgetUpload() {
    if (uploadBusy.value || hashBusy.value) return
    try {
      journal?.clear(identity, true)
      clearLocal()
      recoveryProblem.value = null
    } catch (cause) {
      journalFailed(cause)
    }
  }

  function clearLocal() {
    pauseUpload()
    step = null
    record.value = null
    restored.value = false
    observed.value = false
    selected.value = []
    upload.value = null
    uploadId.value = null
    uploadPhase.value = 'idle'
    uploadProblem.value = null
  }
  function reset() {
    clearLocal()
    identity = null
    try {
      journal?.clear(null, true)
      recoveryProblem.value = null
    } catch (cause) {
      journalFailed(cause)
    }
  }
  function clearTracking() {
    if (!journal || !recoveryProblem.value || uploadBusy.value || hashBusy.value) return
    try {
      if (record.value) persist(true)
      else journal.clear(identity, true)
      recoveryProblem.value = null
    } catch (cause) {
      journalFailed(cause)
    }
  }
  async function reselect(files: File[]) {
    if (!record.value || !uploadId.value || uploadBusy.value || hashBusy.value) return
    const original = record.value,
      candidate = options.files(files)
    selected.value = []
    if (
      !candidate ||
      JSON.stringify(candidate) !==
        JSON.stringify(original.files.map(({ name, sizeBytes }) => ({ name, sizeBytes })))
    ) {
      uploadProblem.value = fileMismatch()
      return
    }
    await run(async (current, epoch) => {
      hashBusy.value = true
      const digests = await hashUploadFiles(files, current.signal)
      if (current.signal.aborted || epoch !== generation) return
      if (digests.some((digest, index) => digest !== original.files[index]?.sha256)) {
        uploadProblem.value = fileMismatch()
        return
      }
      selected.value = [...files]
    })
  }
  return {
    supported,
    metadata,
    canStart,
    canResume,
    canDelete,
    restored: readonly(restored),
    needsFiles,
    hashBusy: readonly(hashBusy),
    recoveryProblem: readonly(recoveryProblem),
    clearTracking,
    reselect,
    upload: readonly(upload),
    uploadId: readonly(uploadId),
    uploadPhase: readonly(uploadPhase),
    uploadProblem: readonly(uploadProblem),
    uploadBusy: readonly(uploadBusy),
    totalBytes,
    doneBytes,
    percent,
    pending,
    select,
    start,
    pauseUpload,
    inspectUpload,
    resumeUpload,
    deleteUpload,
    forgetUpload,
    pause: pauseUpload,
    reset,
    dispose() {
      clearLocal()
      identity = null
      disposed = true
    },
    bind(value: string) {
      if (disposed || identity === value) return
      clearLocal()
      identity = value
      recoveryProblem.value = null
      if (journal) {
        try {
          const saved = journal.load(value)[0]?.request
          if (saved) {
            record.value = saved
            uploadId.value = saved.uploadId
            step = saved.step
            restored.value = true
            uploadPhase.value = 'unknown'
          }
        } catch (cause) {
          journalFailed(cause)
        }
      }
    },
  }
}
