export const supportedLocales = ['zh-Hans', 'zh-Hant', 'en'] as const
export type Locale = (typeof supportedLocales)[number]
export type LanguagePreference = 'auto' | Locale
export const languageStorageKey = 'droidvm.language'

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || supportedLocales.some((locale) => locale === value)
}

export function resolveLanguage(languages: readonly string[]): Locale {
  for (const tag of languages) {
    try {
      const locale = new Intl.Locale(tag)
      if (locale.language === 'en') return 'en'
      if (locale.language !== 'zh') continue
      if (locale.script === 'Hant') return 'zh-Hant'
      if (locale.script === 'Hans') return 'zh-Hans'
      return ['TW', 'HK', 'MO'].includes(locale.region ?? '') ? 'zh-Hant' : 'zh-Hans'
    } catch {
      // Ignore malformed language tags and try the next browser preference.
    }
  }
  return 'en'
}
