<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLogViewer } from '../model/viewer'
import { useVisiblePolling } from '../../../shared/model/visiblePolling'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import EmptyState from '../../../shared/ui/EmptyState.vue'
const props = defineProps<{ vmId: string; instanceId?: string }>()
const { t, n } = useI18n()
const viewer = useLogViewer()
const {
  target,
  stream,
  status,
  problem,
  busy,
  more,
  partial,
  discontinuous,
  supported,
  follow,
  text,
  byteCount,
} = viewer
const output = ref<HTMLElement>()
watch(
  () => [props.vmId, props.instanceId],
  () => void viewer.open(props.vmId),
  { immediate: true },
)
useVisiblePolling(
  () => supported.value && follow.value,
  async () => {
    if (target.value && status.value !== 'loading') await viewer.refresh()
    return status.value !== 'error'
  },
)
watch(text, async () => {
  if (follow.value) {
    await nextTick()
    output.value?.scrollTo({ top: output.value.scrollHeight })
  }
})
onUnmounted(viewer.reset)
function download() {
  const url = URL.createObjectURL(
    new Blob([viewer.exportBytes()], { type: 'text/plain;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `droidvm-${props.vmId}-${stream.value}.log`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <EmptyState
    v-if="!supported"
    :title="t('vmLogsUnavailable')"
    :description="t('vmLogsUnavailableHint')"
  />
  <section v-else class="log-viewer" :aria-busy="busy">
    <div class="toolbar">
      <label class="stream"
        ><span>{{ t('vmLogStream') }}</span
        ><select
          :value="stream"
          :disabled="!target"
          @change="viewer.select(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="name in target?.streams" :key="name" :value="name">{{ name }}</option>
        </select></label
      >
      <label class="follow"><input v-model="follow" type="checkbox" />{{ t('vmLogFollow') }}</label>
      <AppButton
        :disabled="busy"
        @click="target && problem?.code !== 'conflict' ? viewer.refresh() : viewer.open(vmId)"
        >{{ t('refreshList') }}</AppButton
      >
      <AppButton :disabled="busy || !target || !stream" @click="viewer.history">{{
        t('vmLogHistory')
      }}</AppButton>
      <AppButton :disabled="!byteCount" @click="download">{{ t('vmLogDownload') }}</AppButton>
    </div>
    <AppNotice v-if="problem" tone="warning" :title="t(problem.titleKey)"
      ><p>{{ t(problem.descriptionKey) }}</p></AppNotice
    >
    <p v-if="discontinuous" class="log-note" role="status">{{ t('vmLogReset') }}</p>
    <p v-else-if="partial" class="log-note">{{ t('vmLogPartial') }}</p>
    <p class="log-note">
      {{ t('vmLogBytes', { count: n(byteCount) }) }} · {{ t('vmLogTextHint') }}
    </p>
    <p v-if="status === 'loading' && !text" role="status">{{ t('processing') }}</p>
    <p v-else-if="!text && !problem" role="status">{{ t('vmLogEmpty') }}</p>
    <pre ref="output" tabindex="0" :aria-label="t('vmLogs')" class="log-output">{{ text }}</pre>
    <AppButton v-if="more" :disabled="busy" @click="viewer.refresh">{{
      t('vmLogContinue')
    }}</AppButton>
  </section>
</template>

<style scoped>
.log-viewer {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  height: 100%;
}
.toolbar {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.stream {
  display: grid;
  gap: var(--space-1);
  min-width: 120px;
}
select {
  min-height: var(--touch-target);
  padding: var(--space-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
.follow {
  display: flex;
  align-items: center;
  min-height: var(--touch-target);
  gap: var(--space-2);
}
.log-note {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--muted);
}
.log-output {
  flex: 1;
  min-height: 200px;
  max-height: 65dvh;
  overflow: auto;
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--soft);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font:
    13px/1.6 ui-monospace,
    monospace;
  tab-size: 4;
}
</style>
