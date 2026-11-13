<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useVmTerminal } from '../model/terminal'
import { useLogViewer } from '../../logs'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import EmptyState from '../../../shared/ui/EmptyState.vue'
import { resolvedTheme } from '../../../shared/lib/theme'

// `running: false` shows the saved log history read-only instead of a live session.
const props = defineProps<{ vmId: string; instanceId?: string; running?: boolean }>()
const model = useVmTerminal(),
  logs = useLogViewer(),
  { t, locale } = useI18n()
const root = ref<HTMLElement>(),
  host = ref<HTMLElement>(),
  control = ref(false)
const availableHeight = ref<number | null>(null)
let terminal: Terminal | undefined, fit: FitAddon | undefined, observer: ResizeObserver | undefined
let observedHost: HTMLElement | undefined
let detach: (() => void) | undefined,
  resizeFrame = 0,
  mounted = false
const pendingWrites = new Set<() => void>()
// The App's extra-keys strip: ESC TAB CTRL ALT, arrows, then - and /.
const keys = [
  { label: '↑', value: '\u001b[A' },
  { label: '↓', value: '\u001b[B' },
  { label: '←', value: '\u001b[D' },
  { label: '→', value: '\u001b[C' },
  { label: '-', value: '-' },
  { label: '/', value: '/' },
]
const alt = ref(false)
function disposeTerminal() {
  for (const finish of pendingWrites) finish()
  pendingWrites.clear()
  terminal?.dispose()
  terminal = undefined
  fit = undefined
}
function send(value: string) {
  if (alt.value && value.length === 1) {
    alt.value = false
    value = `\u001b${value}`
  }
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
// xterm paints on a canvas: read the App's terminal colors (dark in both themes).
function terminalTheme() {
  const style = getComputedStyle(document.documentElement)
  const value = (name: string) => style.getPropertyValue(name).trim()
  return {
    background: value('--app-color-term'),
    foreground: value('--app-color-term-text'),
    cursor: value('--app-color-term-text'),
    cursorAccent: value('--app-color-term'),
    selectionBackground: value('--md-sys-color-inverse-primary'),
    selectionForeground: value('--app-color-term'),
  }
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
    // Keep guest ANSI colors readable on both light and dark backgrounds.
    minimumContrastRatio: 4.5,
    theme: terminalTheme(),
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
function toggleAlt() {
  alt.value = !alt.value
  terminal?.focus()
}
const live = () => props.running !== false
// Entering the page connects by itself, once the stream list and renderer are both ready.
// A failed attempt leaves its problem showing and waits for the manual connect button.
function autoConnect() {
  if (
    live() &&
    model.status.value === 'disconnected' &&
    !model.problem.value &&
    !!model.metadata.value?.streams.length
  )
    void model.connect()
}
function visibility() {
  if (document.visibilityState !== 'visible') model.disconnect()
  else autoConnect()
}
// Log text uses bare newlines; the terminal needs CR LF to start each line at column 0.
function showHistory() {
  if (live() || !mounted) return
  createTerminal()
  terminal?.write(logs.text.value.replace(/\r?\n/g, '\r\n'))
}
watch(
  () => [props.vmId, props.instanceId, props.running],
  async () => {
    control.value = false
    if (!live()) {
      model.reset()
      await logs.open(props.vmId)
      showHistory()
      return
    }
    if (await model.open(props.vmId)) autoConnect()
  },
  { immediate: true },
)
watch(
  () => logs.text.value,
  () => showHistory(),
)
watch(model.connected, (connected) => {
  if (terminal) terminal.options.disableStdin = !connected
  if (connected) terminal?.focus()
  else control.value = false
})
watch(locale, () => terminal?.textarea?.setAttribute('aria-label', t('terminalInput')))
watch(resolvedTheme, () => {
  if (terminal) terminal.options.theme = terminalTheme()
})
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
  autoConnect()
  showHistory()
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
    <div class="console-bar">
      <div
        class="streams"
        role="group"
        data-testid="terminal-stream"
        :aria-label="t('terminalStream')"
      >
        <button
          v-for="name in model.metadata.value?.streams"
          :key="name"
          type="button"
          class="chip"
          :aria-pressed="model.stream.value === name"
          :disabled="model.busy.value"
          @click="model.select(name)"
        >
          <AppIcon v-if="model.stream.value === name" name="ok" />{{ name }}
        </button>
      </div>
      <span
        v-if="live()"
        class="status"
        data-testid="terminal-status"
        :data-state="model.status.value"
        role="status"
        ><span class="dot" :data-on="model.connected.value" />{{
          t(
            model.connected.value
              ? 'terminalConnected'
              : model.busy.value
                ? 'processing'
                : 'terminalDisconnected',
          )
        }}</span
      >
      <span v-if="!live()" class="status" data-testid="terminal-history">{{
        t('terminalHistory')
      }}</span>
      <button
        v-else-if="!model.connected.value"
        type="button"
        class="btn filled"
        data-testid="terminal-connect"
        :disabled="model.busy.value"
        @click="model.connect"
      >
        {{ t('terminalConnect') }}
      </button>
      <button
        v-else
        type="button"
        class="btn text"
        data-testid="terminal-disconnect"
        @click="model.disconnect"
      >
        {{ t('terminalDisconnect') }}
      </button>
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
    <div class="extra-keys" role="group" :aria-label="t('terminalKeys')">
      <button type="button" :disabled="!model.connected.value" @click="key('\u001b')">ESC</button>
      <button type="button" :disabled="!model.connected.value" @click="key('\t')">TAB</button>
      <button
        type="button"
        :class="{ act: control }"
        :disabled="!model.connected.value"
        :aria-pressed="control"
        @click="toggleControl"
      >
        CTRL
      </button>
      <button
        type="button"
        :class="{ act: alt }"
        :disabled="!model.connected.value"
        :aria-pressed="alt"
        @click="toggleAlt"
      >
        ALT
      </button>
      <button
        v-for="item in keys"
        :key="item.label"
        type="button"
        :disabled="!model.connected.value"
        @click="key(item.value)"
      >
        {{ item.label }}
      </button>
    </div>
  </section>
</template>
<style scoped>
/* docs/webui/app-style/app.html vmConsole: chips bar, full-bleed terminal, extra keys. */
.vm-terminal {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 200px;
}
.console-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  flex-shrink: 0;
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
}
.status .dot[data-on='true'] {
  background: var(--app-color-success);
}
.terminal-host {
  flex: 1 1 260px;
  min-width: 0;
  min-height: 120px;
  overflow: hidden;
  background: var(--app-color-term);
  padding: 12px 14px;
}
.terminal-host :deep(.xterm) {
  height: 100%;
}
.terminal-host :deep(.xterm-helper-textarea) {
  font-size: 16px !important;
}
.extra-keys {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  flex-shrink: 0;
  background: #222;
}
.extra-keys button {
  height: 40px;
  border: 0;
  background: none;
  color: #ccc;
  font: 500 13px var(--md-ref-typeface-plain);
}
.extra-keys button:hover {
  background: #3a3a3a;
}
.extra-keys button.act {
  color: #4fc3f7;
  background: #37474f;
}
.extra-keys button:disabled {
  opacity: 0.5;
}
.terminal-notices,
.note {
  padding: 0 16px 8px;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.terminal-notices {
  max-height: 150px;
  overflow: auto;
  border-left: 3px solid var(--md-sys-color-primary);
  margin: 0 16px 8px;
  padding-left: 8px;
}
p {
  margin: 0;
}
/* A real keyboard is assumed on the drawer layout, as the design. */
@media (width >= 1200px) {
  .extra-keys {
    display: none;
  }
}
</style>
