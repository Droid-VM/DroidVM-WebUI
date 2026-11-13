<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, type DeepReadonly } from 'vue'
import { useVisiblePolling } from '../shared/model/visiblePolling'
import {
  useTaskMonitor,
  taskPercent,
  taskStateKeys,
  taskKindKeys,
  taskPhaseKeys,
  taskAge,
  type Task,
} from '../modules/tasks'
import EmptyState from '../shared/ui/EmptyState.vue'
import AppButton from '../shared/ui/AppButton.vue'
import AppNotice from '../shared/ui/AppNotice.vue'
import AppIcon from '../shared/ui/AppIcon.vue'
import ConfirmDialog from '../shared/ui/ConfirmDialog.vue'
const { t, n, locale } = useI18n()
const tasks = useTaskMonitor()
const kindName = (kind: string) => (taskKindKeys[kind] ? t(taskKindKeys[kind]) : kind)
const phaseName = (phase: string) =>
  taskPhaseKeys[phase] ? t(taskPhaseKeys[phase]) : phase || t('taskWaitingPhase')
const { items, status, problem, cancelProblem, pendingId, uncertainId, supported, canCancel } =
  tasks
const selected = ref<DeepReadonly<Task> | null>(null)
const active = (task: DeepReadonly<Task>) =>
  task.state === 'queued' || task.state === 'running' || task.state === 'cancelling'
const stateIcons: Record<Task['state'], string> = {
  queued: 'refresh',
  running: 'refresh',
  cancelling: 'refresh',
  succeeded: 'ok',
  failed: 'close',
  cancelled: 'close',
}
// The App's task row: target, then the phase and progress while running, or the
// outcome and when it finished.
function line(task: DeepReadonly<Task>) {
  const percent = taskPercent(task)
  const progress = active(task)
    ? [
        task.state === 'cancelling' ? t(taskStateKeys.cancelling) : phaseName(task.phase),
        percent === null ? '' : `${n(Math.round(percent))}%`,
      ]
    : task.state === 'succeeded' && task.finishedMs
      ? [t('taskFinishedAgo', { time: taskAge(task.finishedMs, locale.value) })]
      : [t(taskStateKeys[task.state]), task.errorCode ?? '']
  return [task.resource, ...progress].filter(Boolean).join(' · ')
}
useVisiblePolling(
  () => supported.value,
  async () => {
    if (status.value !== 'loading') await tasks.reload()
    return status.value !== 'error'
  },
  ['tasks'],
)
async function cancelSelected() {
  if (!selected.value) return
  const id = selected.value.id
  await tasks.cancel(id)
  selected.value = null
  await tasks.reload()
}
</script>

<template>
  <div class="page-heading desktop-only">
    <h1>{{ t('navTasks') }}</h1>
  </div>
  <EmptyState v-if="!supported" :title="t('tasksUnavailable')" icon="tasks" />
  <div v-else class="tasks">
    <AppNotice v-if="uncertainId" tone="warning" :title="t('taskCancelUnknown')">
      <AppButton :disabled="status === 'loading'" @click="tasks.reload">{{
        t('queryStatus')
      }}</AppButton>
    </AppNotice>
    <AppNotice v-else-if="cancelProblem" tone="warning" :title="t(cancelProblem.titleKey)"
      ><p>{{ t(cancelProblem.descriptionKey) }}</p></AppNotice
    >
    <AppNotice v-if="problem" tone="error" :title="t(problem.titleKey)"
      ><p>{{ t(problem.descriptionKey) }}</p></AppNotice
    >
    <EmptyState
      v-if="status === 'ready' && items.length === 0"
      :title="t('tasksEmpty')"
      icon="tasks"
    />
    <p v-if="status === 'loading' && items.length === 0" role="status">{{ t('processing') }}</p>
    <section class="list" :aria-label="t('navTasks')" :aria-busy="status === 'loading'">
      <article
        v-for="task in items"
        :key="task.id"
        class="card out task-card"
        :data-task="task.id"
        :title="task.id"
      >
        <div class="task-head">
          <span class="task-icon" :data-state="task.state"
            ><AppIcon :name="stateIcons[task.state]"
          /></span>
          <div class="task-text">
            <h2>{{ kindName(task.kind) }}</h2>
            <p :class="{ failed: task.state === 'failed' }">{{ line(task) }}</p>
          </div>
          <button
            v-if="canCancel && task.cancellable"
            type="button"
            class="btn text"
            :aria-label="t('taskCancel')"
            :disabled="status !== 'ready' || !!pendingId || !!uncertainId"
            @click="selected = task"
          >
            {{ pendingId === task.id ? t('processing') : t('cancel') }}
          </button>
        </div>
        <div
          v-if="active(task)"
          class="bar"
          role="progressbar"
          :aria-label="phaseName(task.phase)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="taskPercent(task) === null ? undefined : Math.round(taskPercent(task)!)"
        >
          <i :style="{ width: `${taskPercent(task) ?? 0}%` }" />
        </div>
      </article>
    </section>
    <ConfirmDialog
      :open="!!selected"
      :title="t('taskCancel')"
      :description="t('taskCancelConfirm', { name: selected ? kindName(selected.kind) : '' })"
      :confirm-label="t('taskCancel')"
      :busy="!!pendingId"
      @cancel="selected = null"
      @confirm="cancelSelected"
    />
  </div>
</template>

<style scoped>
.tasks {
  display: grid;
  gap: 12px;
  max-width: 880px;
}
.task-card {
  padding: 16px;
  min-width: 0;
}
.task-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.task-icon {
  display: grid;
  place-items: center;
  color: var(--md-sys-color-primary);
}
.task-icon[data-state='succeeded'] {
  color: var(--app-color-success);
}
.task-icon[data-state='failed'],
.task-icon[data-state='cancelled'] {
  color: var(--md-sys-color-error);
}
.task-text {
  flex: 1;
  min-width: 0;
}
.task-text h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}
.task-text p {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--md-sys-color-on-surface-variant);
  overflow-wrap: anywhere;
}
.task-text p.failed {
  color: var(--md-sys-color-error);
}
.task-head > .btn {
  align-self: center;
}
.bar {
  margin-top: 12px;
}
</style>
