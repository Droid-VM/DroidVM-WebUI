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
  taskUnitKeys,
  type Task,
} from '../modules/tasks'
import EmptyState from '../shared/ui/EmptyState.vue'
import AppButton from '../shared/ui/AppButton.vue'
import AppNotice from '../shared/ui/AppNotice.vue'
import AppProgress from '../shared/ui/AppProgress.vue'
import ConfirmDialog from '../shared/ui/ConfirmDialog.vue'
const { t } = useI18n()
const tasks = useTaskMonitor()
const kindName = (kind: string) => (taskKindKeys[kind] ? t(taskKindKeys[kind]) : kind)
const phaseName = (phase: string) =>
  taskPhaseKeys[phase] ? t(taskPhaseKeys[phase]) : phase || t('taskWaitingPhase')
const unitName = (unit: string) => (taskUnitKeys[unit] ? t(taskUnitKeys[unit]) : unit)
const { items, status, problem, cancelProblem, pendingId, uncertainId, supported, canCancel } =
  tasks
const selected = ref<DeepReadonly<Task> | null>(null)
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
  <div class="page-heading">
    <h1 class="desktop-only">{{ t('navTasks') }}</h1>
    <AppButton
      v-if="supported"
      :disabled="status === 'loading' || !!pendingId"
      @click="tasks.reload"
      >{{ t('refreshList') }}</AppButton
    >
  </div>
  <EmptyState
    v-if="!supported"
    :title="t('tasksUnavailable')"
    :description="t('tasksHint')"
    icon="tasks"
  />
  <template v-else>
    <p class="muted">{{ t('tasksLiveHint') }}</p>
    <AppNotice v-if="uncertainId" tone="warning" :title="t('taskCancelUnknown')">
      <p>{{ t('taskCancelUnknownHint') }}</p>
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
      :description="t('tasksRetentionHint')"
      icon="tasks"
    />
    <p v-if="status === 'loading' && items.length === 0" role="status">{{ t('processing') }}</p>
    <section class="task-list" :aria-label="t('navTasks')" :aria-busy="status === 'loading'">
      <article v-for="task in items" :key="task.id" class="task-card" :data-task="task.id">
        <div class="task-heading">
          <h2>{{ kindName(task.kind) }}</h2>
          <strong :class="{ failed: task.state === 'failed' }">{{
            t(taskStateKeys[task.state])
          }}</strong>
        </div>
        <p v-if="task.resource" class="task-resource">{{ task.resource }}</p>
        <AppProgress
          v-if="['queued', 'running', 'cancelling'].includes(task.state)"
          :label="phaseName(task.phase)"
          :value="taskPercent(task)"
        />
        <p v-if="task.phase || task.completed !== '0'" class="task-counts">
          {{ task.completed }}<template v-if="task.total !== null"> / {{ task.total }}</template>
          {{ unitName(task.unit) }}
        </p>
        <p v-if="task.errorCode" class="failed">
          {{ t('taskErrorCode', { code: task.errorCode }) }}
        </p>
        <details>
          <summary>{{ t('taskDetails') }}</summary>
          <p class="task-id">{{ task.id }}</p>
          <p>{{ t('taskResultHint') }}</p>
        </details>
        <AppButton
          v-if="canCancel && task.cancellable"
          :disabled="status !== 'ready' || !!pendingId || !!uncertainId"
          @click="selected = task"
          >{{ pendingId === task.id ? t('processing') : t('taskCancel') }}</AppButton
        >
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
  </template>
</template>

<style scoped>
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.page-heading h1 {
  font-size: var(--font-mobile-title);
}
.page-heading .btn {
  margin-left: auto;
}
.task-list {
  display: grid;
  gap: var(--space-3);
}
.task-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
}
.task-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.task-heading h2 {
  font-size: var(--font-body);
  margin: 0;
}
.task-heading strong {
  font-size: var(--font-sm);
}
.task-resource,
.task-counts,
details {
  color: var(--muted);
  font-size: var(--font-sm);
}
details {
  margin: var(--space-3) 0;
}
.failed {
  color: var(--danger);
}
.task-id {
  font-family: monospace;
}
@media (min-width: 1100px) {
  .task-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
