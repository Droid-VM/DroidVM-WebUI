<script setup lang="ts">
import AppLinkButton from '../../../shared/ui/AppLinkButton.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SingleVmGraphics } from '../model/graphics'
import { createGraphicsViewer } from '../lib/viewer'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'
import AppSwitch from '../../../shared/ui/AppSwitch.vue'

const props = defineProps<{
  model: SingleVmGraphics
  vmId: string
  instanceId?: string
  active: boolean
  parallel: boolean
  excludedScreen?: string
}>()
const emit = defineEmits<{ activate: [] }>()
const model = props.model,
  { t } = useI18n()
const root = ref<HTMLElement>(),
  target = ref<HTMLElement>(),
  input = ref<HTMLTextAreaElement>()
const keyboard = ref(false),
  fit = ref(true),
  control = ref(false),
  alt = ref(false),
  fullscreenFallback = ref(false)
const height = ref<number>(),
  size = ref(''),
  attempted = ref(false)
const inputActive = ref(props.active)
const inputAllowed = computed(() => model.connected.value && model.selected.value?.inputEnabled)
const inputEnabled = computed(() => inputActive.value && inputAllowed.value)
function setInputActive(value: boolean) {
  if (!value) {
    clearModifiers()
    keyboard.value = false
    if (input.value) input.value.value = ''
  }
  viewer?.setInputActive(value)
  inputActive.value = value
}
function activate() {
  emit('activate')
}
function focusScreen() {
  activate()
  viewer?.focus()
}
defineExpose({ setInputActive })
watch(() => props.active, setInputActive, { flush: 'sync' })
let viewer: ReturnType<typeof createGraphicsViewer> | undefined, detach: (() => void) | undefined
let resizeObserver: ResizeObserver | undefined,
  mutationObserver: MutationObserver | undefined,
  frame = 0
const keys = [
  { label: 'Tab', symbol: 0xff09, code: 'Tab' },
  { label: 'Esc', symbol: 0xff1b, code: 'Escape' },
  { label: '←', symbol: 0xff51, code: 'ArrowLeft' },
  { label: '↑', symbol: 0xff52, code: 'ArrowUp' },
  { label: '↓', symbol: 0xff54, code: 'ArrowDown' },
  { label: '→', symbol: 0xff53, code: 'ArrowRight' },
  { label: 'Enter', symbol: 0xff0d, code: 'Enter' },
  { label: '⌫', symbol: 0xff08, code: 'Backspace' },
]
function clearModifiers() {
  viewer?.release()
  control.value = alt.value = false
}
function sendKey(symbol: number, code: string) {
  if (!inputEnabled.value) return
  viewer?.key(symbol, code)
  clearModifiers()
}
function modifier(kind: 'control' | 'alt') {
  if (!inputEnabled.value) return
  const flag = kind === 'control' ? control : alt
  flag.value = !flag.value
  viewer?.key(
    kind === 'control' ? 0xffe3 : 0xffe9,
    kind === 'control' ? 'ControlLeft' : 'AltLeft',
    flag.value,
  )
}
function sendText(event: Event) {
  if ((event as InputEvent).isComposing || !input.value) return
  if (inputEnabled.value) viewer?.text(input.value.value)
  input.value.value = ''
  clearModifiers()
}
function beforeInput(event: InputEvent) {
  if (event.isComposing) return
  if (event.inputType === 'deleteContentBackward') {
    event.preventDefault()
    sendKey(0xff08, 'Backspace')
  }
  if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') {
    event.preventDefault()
    sendKey(0xff0d, 'Enter')
  }
}
function paste(event: ClipboardEvent) {
  event.preventDefault()
  if (inputEnabled.value) viewer?.text(event.clipboardData?.getData('text/plain') ?? '')
  clearModifiers()
}
async function toggleKeyboard() {
  clearModifiers()
  keyboard.value = !keyboard.value
  await nextTick()
  if (keyboard.value) input.value?.focus({ preventScroll: true })
  else viewer?.focus()
  layout()
}
function layout() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    if (!root.value) return
    const viewport = window.visualViewport
    if (viewport)
      height.value = Math.max(
        140,
        viewport.height -
          Math.max(0, root.value.getBoundingClientRect().top - viewport.offsetTop) -
          12,
      )
    const canvas = target.value?.querySelector('canvas')
    size.value = canvas?.width && canvas.height ? `${canvas.width} × ${canvas.height}` : ''
  })
}
async function fullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined)
    return
  }
  try {
    if (!root.value?.requestFullscreen) throw new Error('Fullscreen unavailable')
    await root.value.requestFullscreen()
  } catch {
    fullscreenFallback.value = true
  }
  layout()
}
function disconnect() {
  clearModifiers()
  model.disconnect()
}
function visibility() {
  if (document.visibilityState !== 'visible') disconnect()
}
function connect() {
  attempted.value = true
  void model.connect()
}
function select(event: Event) {
  clearModifiers()
  model.select((event.target as HTMLSelectElement).value)
}
watch(
  () => [props.vmId, props.instanceId],
  () => {
    attempted.value = false
    keyboard.value = false
  },
  { immediate: true },
)
watch(fit, (value) => viewer?.scale(value))
watch(model.connected, (connected) => {
  if (!connected) {
    control.value = alt.value = false
    keyboard.value = false
    if (input.value) input.value.value = ''
  }
})
onMounted(() => {
  if (!target.value) return
  detach = model.attach({
    start(socket, password, enabled, events) {
      if (!target.value) {
        socket.close()
        return
      }
      viewer?.stop()
      viewer = createGraphicsViewer(target.value, {
        ready() {
          viewer?.scale(fit.value)
          events.ready()
          layout()
        },
        closed: events.closed,
      })
      viewer.setInputActive(inputActive.value)
      viewer.start(socket, password, enabled)
      layout()
    },
    stop() {
      viewer?.stop()
      viewer = undefined
      size.value = ''
    },
  })
  resizeObserver = new ResizeObserver(layout)
  resizeObserver.observe(root.value!)
  mutationObserver = new MutationObserver(layout)
  mutationObserver.observe(target.value, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['width', 'height'],
  })
  window.visualViewport?.addEventListener('resize', layout)
  window.visualViewport?.addEventListener('scroll', layout)
  window.addEventListener('resize', layout)
  window.addEventListener('blur', disconnect)
  window.addEventListener('pagehide', disconnect)
  document.addEventListener('visibilitychange', visibility)
  document.addEventListener('fullscreenchange', layout)
  layout()
})
onUnmounted(() => {
  detach?.()
  viewer?.stop()
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
  cancelAnimationFrame(frame)
  window.visualViewport?.removeEventListener('resize', layout)
  window.visualViewport?.removeEventListener('scroll', layout)
  window.removeEventListener('resize', layout)
  window.removeEventListener('blur', disconnect)
  window.removeEventListener('pagehide', disconnect)
  document.removeEventListener('visibilitychange', visibility)
  document.removeEventListener('fullscreenchange', layout)
})
</script>

<template>
  <section
    ref="root"
    class="graphics"
    :class="{ 'graphics-parallel': parallel }"
    :style="height && !parallel ? { maxHeight: `${height}px` } : undefined"
    data-testid="graphic-viewport"
    :data-input-active="inputActive"
    :aria-label="t('console')"
    @pointerdown.capture="activate"
    @mousedown.capture="activate"
    @touchstart.capture="activate"
    @focusin.capture="activate"
  >
    <div class="graphics-tools session-toolbar">
      <AppButton
        v-if="parallel"
        data-testid="graphic-focus-screen"
        :aria-pressed="inputActive"
        @click="focusScreen"
      >
        {{ t(inputActive ? 'graphicActiveScreen' : 'graphicFocusScreen') }}
      </AppButton>
      <AppSelect
        class="screen-picker"
        data-testid="graphic-screen"
        :label="t('graphicScreen')"
        :value="model.screen.value"
        :disabled="model.busy.value"
        @change="select"
      >
        <AppOption
          v-for="screen in model.metadata.value?.screens"
          :key="screen.id"
          :value="screen.id"
          :disabled="screen.id === excludedScreen"
        >
          {{ screen.id }}{{ screen.available ? '' : ` — ${t('unavailable')}` }}
        </AppOption>
      </AppSelect>
      <AppButton
        v-if="model.connected.value || model.busy.value"
        data-testid="graphic-disconnect"
        @click="disconnect"
        >{{ t('graphicDisconnect') }}</AppButton
      >
      <AppButton
        v-else
        :data-testid="attempted ? 'graphic-reconnect' : 'graphic-connect'"
        tone="primary"
        :disabled="!model.supported.value || !model.selected.value?.available"
        @click="connect"
        >{{ t(attempted ? 'graphicReconnect' : 'graphicConnect') }}</AppButton
      >
      <AppButton :disabled="model.busy.value || model.connected.value" @click="model.reload">{{
        t('refreshList')
      }}</AppButton>
      <AppSwitch v-model="fit" data-testid="graphic-scale">{{ t('graphicFit') }}</AppSwitch>
      <AppButton data-testid="graphic-fullscreen" @click="fullscreen">{{
        t('graphicFullscreen')
      }}</AppButton>
    </div>
    <p class="graphics-status" data-testid="graphic-status" role="status">
      {{ t(`graphicStatus_${model.status.value}`) }}<span v-if="size"> · {{ size }}</span>
    </p>
    <AppNotice v-if="model.problem.value" tone="warning" :title="t(model.problem.value.titleKey)"
      ><p>{{ t(model.problem.value.descriptionKey) }}</p></AppNotice
    >
    <p
      v-if="!model.supported.value || (!model.busy.value && !model.selected.value?.available)"
      class="muted"
    >
      {{ t('graphicUnavailable') }}
      <AppLinkButton tone="tonal" :to="`/vms/${encodeURIComponent(vmId)}/edit`">{{
        t('graphicConfigure')
      }}</AppLinkButton>
    </p>
    <p v-if="model.selected.value?.reason" class="muted">
      {{ t(`graphicReason_${model.selected.value.reason.replaceAll('-', '_')}`) }}
    </p>
    <p v-if="fullscreenFallback" class="muted">{{ t('graphicFullscreenFallback') }}</p>
    <div
      ref="target"
      data-testid="graphic-target"
      class="graphics-target"
      :aria-label="t('graphicCanvas')"
      @focusout="clearModifiers"
    />
    <div class="graphics-keys session-toolbar" data-testid="graphic-keys">
      <AppButton
        data-testid="graphic-keyboard"
        :disabled="!inputAllowed"
        :aria-pressed="keyboard"
        @click="toggleKeyboard"
        >{{ t('graphicKeyboard') }}</AppButton
      >
      <AppButton :disabled="!inputAllowed" :aria-pressed="control" @click="modifier('control')"
        >Ctrl</AppButton
      >
      <AppButton :disabled="!inputAllowed" :aria-pressed="alt" @click="modifier('alt')"
        >Alt</AppButton
      >
      <AppButton
        v-for="key in keys"
        :key="key.code"
        :data-testid="`graphic-key-${key.code}`"
        :disabled="!inputAllowed"
        @click="sendKey(key.symbol, key.code)"
        >{{ key.label }}</AppButton
      >
      <AppButton :disabled="!inputAllowed" @click="viewer?.ctrlAltDel()">Ctrl+Alt+Del</AppButton>
    </div>
    <textarea
      v-if="keyboard"
      ref="input"
      data-testid="graphic-input"
      data-guest-input="true"
      class="graphics-input"
      :aria-label="t('graphicInput')"
      :placeholder="t('graphicInput')"
      rows="1"
      autocapitalize="off"
      autocomplete="off"
      autocorrect="off"
      :spellcheck="false"
      @input="sendText"
      @compositionend="sendText"
      @beforeinput="beforeInput"
      @paste="paste"
    />
    <p class="graphics-hint muted">{{ t('graphicInputHint') }}</p>
  </section>
</template>

<style scoped>
.graphics {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  min-width: 0;
  overflow: auto;
}
.graphics:fullscreen {
  padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
    max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  background: var(--app-color-card);
  max-height: 100dvh !important;
}
.graphics-parallel {
  flex: 0 0 auto;
  min-height: auto;
  overflow: visible;
}
.graphics-parallel:fullscreen {
  min-height: 0;
  overflow: auto;
}
.graphics-parallel .graphics-target {
  flex: 0 0 220px;
  min-height: 220px;
}
.graphics-tools,
.graphics-keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  flex-shrink: 0;
}
.graphics-tools .screen-picker {
  width: 200px;
  max-width: 100%;
}
.graphics-target {
  position: relative;
  flex: 1 0 140px;
  min-height: 140px;
  min-width: 0;
  overflow: auto;
  background: var(--app-color-screen);
  border-radius: 12px;
  touch-action: none;
}
.graphics-target :deep(canvas) {
  outline-offset: -3px;
}
.graphics-status,
.graphics-hint {
  margin: 0;
  font-size: var(--md-sys-typescale-body-medium-size);
  flex-shrink: 0;
}
.graphics-input {
  width: 100%;
  min-height: 44px;
  flex-shrink: 0;
  font-size: 16px;
  color: var(--md-sys-color-on-surface);
  background: var(--app-color-card);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 10px;
  padding: 10px;
  resize: none;
}
@media (width < 600px) {
  .graphics-keys {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 3px;
  }
  .graphics-keys > * {
    flex-shrink: 0;
  }
  .graphics-tools {
    gap: 6px;
  }
  .graphics-hint {
    font-size: var(--md-sys-typescale-body-small-size);
  }
}
</style>
