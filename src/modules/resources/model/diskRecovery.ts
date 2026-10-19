import { computed, readonly, ref, shallowRef } from 'vue'
import { createOperations } from '../../tasks'
import { requestId } from '../../../shared/api/requestId'
import { describeApiError, type ApiProblem } from '../../../shared/api/errors'
import type { DiskRecoveryGateway } from '../api/diskOperations'

export function createDiskRecovery(
  gateway: DiskRecoveryGateway | undefined,
  refresh: () => Promise<boolean>,
  idle: () => boolean,
  diskRequest: () => string | null,
  newId = requestId,
) {
  const pending = ref<number | null>(null),
    loading = ref(false),
    recoveredRequest = ref<string | null>(null)
  const problem = shallowRef<ApiProblem | null>(null)
  let read: AbortController | undefined,
    identity: string | null = null,
    recoveringRequest: string | null = null
  let generation = 0
  const operations = createOperations(
    gateway,
    async () => {
      const entry = operations.entries.value.recovery,
        request = entry?.request.diskRequestId ?? recoveringRequest,
        epoch = generation
      const fresh = await refresh()
      const task = entry?.task
      if (
        fresh &&
        epoch === generation &&
        operations.entries.value.recovery === entry &&
        task?.state === 'succeeded' &&
        task.pendingRecords === 0
      )
        recoveredRequest.value = request
      return fresh
    },
    gateway?.tracking,
  )
  const allowed = computed(
    () => operations.supported.value && operations.allowed('recovery') && !loading.value && idle(),
  )
  const settled = computed(
    () => !operations.entries.value.recovery || operations.entries.value.recovery.state === 'done',
  )
  async function readStatus() {
    if (!gateway || !operations.supported.value) return
    read?.abort()
    const current = new AbortController()
    read = current
    loading.value = true
    problem.value = null
    try {
      const count = await gateway.status(current.signal)
      if (!current.signal.aborted) pending.value = count
    } catch (cause) {
      if (!current.signal.aborted) {
        pending.value = null
        problem.value = describeApiError(cause)
      }
    } finally {
      if (!current.signal.aborted) loading.value = false
    }
  }
  async function submit() {
    if (!allowed.value || pending.value === null) return
    recoveringRequest = diskRequest()
    const epoch = generation
    await operations.submit('recovery', { requestId: newId(), diskRequestId: recoveringRequest })
    if (epoch === generation) await readStatus()
  }
  async function reconcile() {
    const epoch = generation
    await operations.reconcile()
    if (epoch === generation) await readStatus()
  }
  function pause() {
    generation++
    read?.abort()
    loading.value = false
    operations.pause()
  }
  function reset(preserveTracking = false) {
    pause()
    operations.reset(preserveTracking)
    pending.value = null
    problem.value = null
    recoveredRequest.value = null
    recoveringRequest = null
    identity = null
  }
  return {
    ...operations,
    allowed,
    settled,
    pending: readonly(pending),
    loading: readonly(loading),
    problem: readonly(problem),
    recoveredRequest: readonly(recoveredRequest),
    readStatus,
    submit,
    reconcile,
    pause,
    reset,
    bind(value: string) {
      if (identity === value) return
      pause()
      pending.value = null
      problem.value = null
      recoveredRequest.value = null
      recoveringRequest = null
      identity = value
      operations.bind(value)
    },
    dispose() {
      pause()
      operations.dispose()
    },
  }
}
