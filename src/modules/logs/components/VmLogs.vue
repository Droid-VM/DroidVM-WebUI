<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLogViewer } from '../model/viewer'
import { useVisiblePolling } from '../../../shared/model/visiblePolling'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import EmptyState from '../../../shared/ui/EmptyState.vue'
// docs/webui/app-style/app.html vmConsole: stream chips with a status line, then the
// console text filling the page. Save / share / clear live in the top bar (VmLogActions).
// stateText / stateTone describe the VM (running, suspended...) for the status line.
const props = defineProps<{
  vmId: string
  instanceId?: string
  stateText?: string
  stateTone?: string
}>()
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
  () => void viewer.open(props.vmId, false),
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
// Reading back up pauses following; returning to the bottom resumes it.
function scrolled() {
  const element = output.value
  if (element) follow.value = element.scrollHeight - element.scrollTop - element.clientHeight < 24
}
const size = computed(() =>
  byteCount.value >= 1048576
    ? `${n(byteCount.value / 1048576, { maximumFractionDigits: 1 })} MiB`
    : `${n(byteCount.value / 1024, { maximumFractionDigits: 1 })} KiB`,
)
const statusLine = computed(() =>
  [
    props.stateText,
    t('vmLogHistorySize', { size: size.value }),
    partial.value ? '' : t('vmLogReplayed'),
    t(follow.value ? 'vmLogFollowing' : 'vmLogPaused'),
  ]
    .filter(Boolean)
    .join(' · '),
)
onUnmounted(viewer.reset)
</script>

<template>
  <EmptyState v-if="!supported" :title="t('vmLogsUnavailable')" />
  <section v-else class="console-page" :aria-busy="busy">
    <div class="console-bar">
      <div class="streams" role="group" :aria-label="t('vmLogStream')">
        <button
          v-for="name in target?.streams"
          :key="name"
          type="button"
          class="chip"
          :aria-pressed="stream === name"
          @click="viewer.select(name, false)"
        >
          <AppIcon v-if="stream === name" name="ok" />{{ name }}
        </button>
      </div>
      <span class="status"
        ><span v-if="stateText" class="dot" :data-tone="stateTone" />{{ statusLine }}</span
      >
    </div>
    <AppNotice v-if="problem" tone="warning" :title="t(problem.titleKey)"
      ><p>{{ t(problem.descriptionKey) }}</p></AppNotice
    >
    <p v-if="discontinuous" class="log-note" role="status">{{ t('vmLogReset') }}</p>
    <p v-else-if="partial" class="log-note">{{ t('vmLogPartial') }}</p>
    <pre
      ref="output"
      tabindex="0"
      :aria-label="t('vmLogs')"
      class="term"
      @scroll.passive="scrolled"
      >{{ text || (status === 'loading' ? t('processing') : t('vmLogEmpty')) }}</pre
    >
    <button
      v-if="more"
      type="button"
      class="btn tonal more"
      :disabled="busy"
      @click="viewer.refresh"
    >
      {{ t('vmLogContinue') }}
    </button>
  </section>
</template>

<style scoped>
.console-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  margin: 0 calc(-1 * var(--console-inset, 0px));
}
.console-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
}
.streams {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.status {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  font-size: 12px;
  line-height: 16px;
  color: var(--md-sys-color-on-surface-variant);
}
.status .dot {
  margin-right: 6px;
  background: var(--md-sys-color-outline);
}
.status .dot[data-tone='success'] {
  background: var(--app-color-success);
}
.status .dot[data-tone='warning'] {
  background: var(--app-color-warning);
}
.log-note {
  margin: 0;
  padding: 0 16px 8px;
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
}
.term {
  flex: 1;
  min-height: 240px;
  border-radius: 0;
  tab-size: 4;
}
.more {
  align-self: center;
  margin: 8px;
}
</style>
