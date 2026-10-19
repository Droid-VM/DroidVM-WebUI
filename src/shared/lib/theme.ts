import { ref, watch } from 'vue'

export type ThemeMode = 'system' | 'light' | 'dark'
export const themeMode = ref<ThemeMode>('system')
// The theme actually shown, for code that cannot follow CSS variables (e.g. xterm).
export const resolvedTheme = ref<'light' | 'dark'>('light')
export function startTheme() {
  const system = matchMedia('(prefers-color-scheme: dark)')
  try {
    const saved = localStorage.getItem('droidvm.theme')
    if (saved === 'system' || saved === 'light' || saved === 'dark') themeMode.value = saved
  } catch {
    /* Browser storage can be unavailable. */
  }
  function apply() {
    resolvedTheme.value =
      themeMode.value === 'system' ? (system.matches ? 'dark' : 'light') : themeMode.value
    document.documentElement.dataset.color = resolvedTheme.value
  }
  const stop = watch(
    themeMode,
    (value) => {
      apply()
      try {
        localStorage.setItem('droidvm.theme', value)
      } catch {
        /* Theme still works without persistence. */
      }
    },
    { immediate: true },
  )
  system.addEventListener('change', apply)
  return () => {
    stop()
    system.removeEventListener('change', apply)
  }
}
