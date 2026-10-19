import { inject, ref, watch, type InjectionKey } from 'vue'
import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zhHans from './locales/zh-Hans.json'
import zhHant from './locales/zh-Hant.json'
import {
  isLanguagePreference,
  languageStorageKey,
  resolveLanguage,
  type LanguagePreference,
} from './language'

export type MessageKey = keyof typeof en
export const messages = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant }

export function createLocalization() {
  const preference = ref<LanguagePreference>('auto')
  try {
    const saved = localStorage.getItem(languageStorageKey)
    if (isLanguagePreference(saved)) preference.value = saved
  } catch {
    // Storage may be unavailable; keep the in-memory preference usable.
  }
  const browserLocale = () =>
    resolveLanguage(navigator.languages.length ? navigator.languages : [navigator.language])
  const i18n = createI18n({
    legacy: false,
    locale: preference.value === 'auto' ? browserLocale() : preference.value,
    fallbackLocale: 'en',
    messages,
  })
  const updateLocale = () => {
    i18n.global.locale.value = preference.value === 'auto' ? browserLocale() : preference.value
    document.documentElement.lang = i18n.global.locale.value
  }
  const stop = watch(
    preference,
    () => {
      updateLocale()
      try {
        localStorage.setItem(languageStorageKey, preference.value)
      } catch {
        // Browsing restrictions must not prevent switching languages.
      }
    },
    { flush: 'sync' },
  )
  updateLocale()
  window.addEventListener('languagechange', updateLocale)
  return {
    i18n,
    preference,
    dispose() {
      stop()
      window.removeEventListener('languagechange', updateLocale)
    },
  }
}

export type Localization = ReturnType<typeof createLocalization>
export const localizationKey: InjectionKey<Localization> = Symbol('localization')
export function useLanguagePreference() {
  const localization = inject(localizationKey)
  if (!localization) throw new Error('Localization is not provided')
  return localization.preference
}
