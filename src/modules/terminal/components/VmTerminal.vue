<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useVmTerminal } from '../model/terminal'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import EmptyState from '../../../shared/ui/EmptyState.vue'

const props = defineProps<{ vmId: string; instanceId?: string }>()
const model = useVmTerminal(),
  { t, locale } = useI18n()
const root = ref<HTMLElement>(),
  host = ref<HTMLElement>(),
  control = ref(false)
const availableHeight = ref<number | null>(null),
  columns = ref(80),
  rows = ref(24)
let terminal: Terminal | undefined, fit: FitAddon | undefined, observer: ResizeObserver | undefined
let observedHost: HTMLElement | undefined
let detach: (() => void) | undefined,
  resizeFrame = 0,
  mounted = false
const pendingWrites = new Set<() => void>()
const keys = [
  { label: 'Ctrl+C', value: '\u0003' },
  { label: 'Tab', value: '\t' },
  { label: 'Esc', value: '\u001b' },
  { label: '←', value: '\u001b[D' },
  { label: '↑', value: '\u001b[A' },
  { label: '↓', value: '\u001b[B' },
  { label: '→', value: '\u001b[C' },
]
function disposeTerminal() {
  for (const finish of pendingWrites) finish()
  pendingWrites.clear()
  terminal?.dispose()
  terminal = undefined
  fit = undefined
}
function send(value: string) {
  if (
    control.value &&
    value.length === 1 &&
    value.charCodeAt(0) >= 32 &&
    value.charCodeAt(0) <= 126
  ) {
    value = String.fromCharCode(value.toUpperCase().charCodeAt(0) & 31)
    control.value = false
  }
  model.text(value)
}
function createTerminal() {
  if (!mounted || !host.value) return
  disposeTerminal()
  host.value.replaceChildren()
  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    scrollback: 2000,
    screenReaderMode: true,
    convertEol: false,
    allowProposedApi: false,
    disableStdin: !model.connected.value,
    logLevel: 'off',
    linkHandler: { activate: () => undefined },
    theme: {
      background: '#11151c',
      foreground: '#e6edf5',
      cursor: '#9ecbff',
      selectionBackground: '#42556f',
    },
  })
  fit = new FitAddon()
  terminal.loadAddon(fit)
  // A guest must never write to the browser clipboard or activate links.
  terminal.parser.registerOscHandler(52, () => true)
  terminal.parser.registerOscHandler(8, () => true)
  terminal.open(host.value)
  terminal.onData(send)
  terminal.onBinary((value) =>
    model.input(Uint8Array.from(value, (character) => character.charCodeAt(0))),
  )
  terminal.attachCustomKeyEventHandler((event) => {
    // Keep keyboard traversal available without injecting a tab into the guest.
    if (event.key === 'Tab' && event.shiftKey) return false
    return true
  })
  if (terminal.textarea) {
    terminal.textarea.setAttribute('aria-label', t('terminalInput'))
    terminal.textarea.setAttribute('inputmode', 'text')
    terminal.textarea.setAttribute('autocapitalize', 'off')
    terminal.textarea.setAttribute('autocorrect', 'off')
    terminal.textarea.spellcheck = false
  }
  bindHost()
  layout()
}
function bindHost() {
  if (!observer || observedHost === host.value) return
  if (observedHost) {
    observer.unobserve(observedHost)
    observedHost.removeEventListener('paste', paste, true)
  }
  observedHost = host.value
  if (observedHost) {
    observer.observe(observedHost)
    observedHost.addEventListener('paste', paste, true)
  }
}
function layout() {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    if (!mounted) return
    const viewport = window.visualViewport
    if (root.value && viewport)
      availableHeight.value = Math.max(
        200,
        viewport.height -
          Math.max(0, root.value.getBoundingClientRect().top - viewport.offsetTop) -
          12,
      )
    if (host.value?.clientWidth && host.value.clientHeight && terminal && fit) {
      fit.fit()
      columns.value = terminal.cols
      rows.value = terminal.rows
    }
  })
}
function paste(event: ClipboardEvent) {
  event.preventDefault()
  event.stopImmediatePropagation()
  const value = event.clipboardData?.getData('text/plain') ?? ''
  if (!model.connected.value || new TextEncoder().encode(value).length > 2048) {
    model.rejectInput()
    return
  }
  terminal?.paste(value)
}
function key(value: string) {
  model.text(value)
  terminal?.focus()
}
function toggleControl() {
  control.value = !control.value
  terminal?.focus()
}
function visibility() {
  if (document.visibilityState !== 'visible') model.disconnect()
}
watch(
  () => [props.vmId, props.instanceId],
  () => {
    control.value = false
    void model.open(props.vmId)
  },
  { immediate: true },
)
watch(model.connected, (connected) => {
  if (terminal) terminal.options.disableStdin = !connected
  if (connected) terminal?.focus()
  else control.value = false
})
watch(locale, () => terminal?.textarea?.setAttribute('aria-label', t('terminalInput')))
watch(model.supported, async (supported) => {
  if (mounted) {
    await nextTick()
    bindHost()
    if (supported) createTerminal()
    else disposeTerminal()
  }
})
onMounted(async () => {
  mounted = true
  await nextTick()
  if (!mounted) return
  createTerminal()
  detach = model.attach({
    write: (bytes) =>
      new Promise<void>((resolve, reject) => {
        if (!terminal) {
          reject(new Error('Terminal is disposed'))
          return
        }
        const finish = () => {
          pendingWrites.delete(finish)
          resolve()
        }
        pendingWrites.add(finish)
        terminal.write(bytes, finish)
      }),
    // Recreate instead of reset(): queued writes from the old VM must not leak
    // into a new instance's terminal while xterm is finishing an old frame.
    reset: createTerminal,
  })
  observer = new ResizeObserver(layout)
  bindHost()
  window.addEventListener('resize', layout)
  window.visualViewport?.addEventListener('resize', layout)
  window.visualViewport?.addEventListener('scroll', layout)
  document.addEventListener('visibilitychange', visibility)
  layout()
})
onUnmounted(() => {
  mounted = false
  detach?.()
  model.reset()
  disposeTerminal()
  observer?.disconnect()
  cancelAnimationFrame(resizeFrame)
  observedHost?.removeEventListener('paste', paste, true)
  observedHost = undefined
  window.removeEventListener('resize', layout)
  window.visualViewport?.removeEventListener('resize', layout)
  window.visualViewport?.removeEventListener('scroll', layout)
  document.removeEventListener('visibilitychange', visibility)
})
</script>
<template>
  <EmptyState
    v-if="!model.supported.value"
    :title="t('terminalUnavailable')"
    :description="t('terminalUnavailableHint')"
  />
  <section
    v-else
    ref="root"
    class="vm-terminal"
    :style="availableHeight ? { maxHeight: `${availableHeight}px` } : undefined"
  >
    <div class="toolbar">
      <label
        ><span>{{ t('terminalStream') }}</span
        ><select
          data-testid="terminal-stream"
          :value="model.stream.value"
          :disabled="model.busy.value"
          @change="model.select(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="name in model.metadata.value?.streams" :key="name" :value="name">
            {{ name }}
          </option>
        </select></label
      >
      <AppButton
        v-if="!model.connected.value"
        data-testid="terminal-connect"
        tone="primary"
        :disabled="model.busy.value"
        @click="model.connect"
        >{{ t('terminalConnect') }}</AppButton
      >
      <AppButton v-else data-testid="terminal-disconnect" @click="model.disconnect">{{
        t('terminalDisconnect')
      }}</AppButton>
      <span data-testid="terminal-status" :data-state="model.status.value" role="status">{{
        t(
          model.connected.value
            ? 'terminalConnected'
            : model.busy.value
              ? 'processing'
              : 'terminalDisconnected',
        )
      }}</span>
    </div>
    <AppNotice v-if="model.problem.value" tone="warning" :title="t(model.problem.value.titleKey)"
      ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
    >
    <div
      v-if="model.inputUncertain.value || model.inputDiscarded.value || model.outputReset.value"
      class="terminal-notices"
      role="status"
    >
      <p v-if="model.inputUncertain.value" data-testid="terminal-input-uncertain">
        {{ t('terminalInputUncertain') }}
      </p>
      <p v-if="model.inputDiscarded.value" data-testid="terminal-input-discarded">
        {{ t('terminalInputDiscarded') }}
      </p>
      <p v-if="model.outputReset.value">{{ t('terminalOutputReset') }}</p>
      <AppButton @click="model.dismissNotices">{{ t('terminalDismissNotice') }}</AppButton>
    </div>
    <p v-if="model.metadata.value && !model.metadata.value.streams.length" class="note">
      {{ t('terminalNoStreams') }}
    </p>
    <div
      ref="host"
      class="terminal-host"
      data-testid="terminal-output"
      :aria-label="t('terminalOutput')"
    />
    <div class="keyboard" :aria-label="t('terminalKeys')">
      <AppButton :disabled="!model.connected.value" :aria-pressed="control" @click="toggleControl"
        >Ctrl</AppButton
      >
      <AppButton
        v-for="item in keys"
        :key="item.label"
        :disabled="!model.connected.value"
        @click="key(item.value)"
        >{{ item.label }}</AppButton
      >
      <AppButton :disabled="!model.connected.value" @click="terminal?.focus()">{{
        t('terminalKeyboard')
      }}</AppButton>
    </div>
    <details class="terminal-help">
      <summary>{{ t('terminalHelp') }}</summary>
      <p>{{ t('terminalResizeHint', { columns, rows }) }}</p>
      <p>{{ t('terminalConnectionHint') }}</p>
      <p>{{ t('terminalPasteHint') }}</p>
    </details>
  </section>
</template>
<style scoped>
.vm-terminal {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 200px;
  gap: var(--space-2);
}
.toolbar,
.keyboard {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}
.toolbar label {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
  flex: 1 1 150px;
}
select {
  min-width: 0;
  max-width: 100%;
  flex: 1;
  min-height: var(--touch-target);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  padding: var(--space-2);
}
.terminal-host {
  flex: 1 1 260px;
  min-width: 0;
  min-height: 120px;
  overflow: hidden;
  background: #11151c;
  border-radius: var(--radius-sm);
  padding: 8px;
}
.terminal-host :deep(.xterm) {
  height: 100%;
}
.terminal-host :deep(.xterm-helper-textarea) {
  font-size: 16px !important;
}
.keyboard .btn {
  min-width: var(--touch-target);
  padding-inline: var(--space-3);
}
.terminal-notices,
.terminal-help,
.note {
  font-size: var(--font-sm);
  overflow-wrap: anywhere;
}
.terminal-notices {
  max-height: 150px;
  overflow: auto;
  border-left: 3px solid var(--accent);
  padding-left: var(--space-2);
}
p {
  margin: 0;
}
.terminal-help summary {
  cursor: pointer;
  min-height: 30px;
}
.terminal-help[open] {
  max-height: 130px;
  overflow: auto;
}
@media (max-width: 450px) {
  .toolbar,
  .keyboard {
    gap: var(--space-1);
  }
  .keyboard .btn {
    padding-inline: var(--space-2);
  }
}
</style>
