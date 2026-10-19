<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { onBeforeUnmount, ref, useId, watch } from 'vue'
import AppButton from './AppButton.vue'
import AppIcon from './AppIcon.vue'
import { lockBodyScroll } from '../lib/scrollLock'

const { t } = useI18n()
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    fullscreen?: boolean
    dismissible?: boolean
    guestKeyboard?: boolean
  }>(),
  { dismissible: true },
)
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const titleId = useId()
let releaseScroll: (() => void) | undefined
function unlock() {
  releaseScroll?.()
  releaseScroll = undefined
}
function trapTab(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    (props.guestKeyboard && (event.target as Element)?.closest('[data-guest-input]'))
  )
    return
  if (event.key !== 'Tab' || !dialog.value) return
  const element = dialog.value
  const candidates = [
    ...element.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]'),
  ].filter(
    (item) =>
      item.tabIndex >= 0 &&
      !item.matches(':disabled') &&
      !item.closest('[inert]') &&
      item.getClientRects().length &&
      getComputedStyle(item).visibility !== 'hidden',
  )
  const first = candidates[0]
  const last = candidates.at(-1)
  if (!first || !last) {
    event.preventDefault()
    element.focus()
    return
  }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
    event.preventDefault()
    last.focus()
  } else if (
    !event.shiftKey &&
    (document.activeElement === last || document.activeElement === element)
  ) {
    event.preventDefault()
    first.focus()
  }
}
function cancel() {
  if (props.guestKeyboard && document.activeElement?.closest('[data-guest-input]')) return
  if (props.dismissible) emit('close')
}
watch(
  () => props.dismissible,
  (dismissible) => {
    if (!dismissible && dialog.value?.open) dialog.value.focus()
  },
  { flush: 'post' },
)
watch(
  [() => props.open, dialog],
  ([open, element]) => {
    if (!element) return
    if (open && !element.open) {
      releaseScroll = lockBodyScroll()
      element.showModal()
    } else if (!open && element.open) {
      element.close()
      unlock()
    }
  },
  { flush: 'post' },
)
onBeforeUnmount(() => {
  dialog.value?.close()
  unlock()
})
</script>

<template>
  <dialog
    ref="dialog"
    tabindex="-1"
    :aria-labelledby="titleId"
    :class="{ fullscreen }"
    @cancel.prevent="cancel"
    @keydown="trapTab"
  >
    <header class="dialog-header">
      <h2 :id="titleId" :title="title">{{ title }}</h2>
      <AppButton :aria-label="t('close')" autofocus :disabled="!dismissible" @click="emit('close')"
        ><AppIcon name="close"
      /></AppButton>
    </header>
    <div class="dialog-body"><slot /></div>
  </dialog>
</template>
