import { onMounted, onUpdated, ref, useTemplateRef } from 'vue'

// Material inputs live in a shadow root, so a wrapping <label> cannot name them.
// Mirror the visible label text into the control's aria-label instead.
export function useSlotLabel(key: string) {
  const element = useTemplateRef<HTMLElement>(key)
  const text = ref('')
  const sync = () => {
    text.value = element.value?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }
  onMounted(sync)
  onUpdated(sync)
  return text
}
