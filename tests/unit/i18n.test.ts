import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { isLanguagePreference, resolveLanguage } from '../../src/shared/i18n/language'
import { messages } from '../../src/shared/i18n'
import devEn from '../../dev/locales/en.json'
import devHans from '../../dev/locales/zh-Hans.json'
import devHant from '../../dev/locales/zh-Hant.json'

describe('browser language negotiation', () => {
  it.each([
    [['zh'], 'zh-Hans'],
    [['zh-CN'], 'zh-Hans'],
    [['zh-SG'], 'zh-Hans'],
    [['zh-TW'], 'zh-Hant'],
    [['zh-HK'], 'zh-Hant'],
    [['zh-MO'], 'zh-Hant'],
    [['zh-Hans-TW'], 'zh-Hans'],
    [['zh-Hant-CN'], 'zh-Hant'],
    [['en-GB'], 'en'],
    [['fr-FR', 'zh-TW', 'en-US'], 'zh-Hant'],
    [['en-US', 'zh-CN'], 'en'],
    [['zh_CN', '', 'zh-HK'], 'zh-Hant'],
    [['ja-JP'], 'en'],
    [[], 'en'],
  ] as const)('resolves %j to %s', (languages, expected) => {
    expect(resolveLanguage(languages)).toBe(expected)
  })
  it('ignores unsupported or corrupt stored preferences', () => {
    for (const value of [null, '', 'fr', 'zh-CN', '{}'])
      expect(isLanguagePreference(value)).toBe(false)
    for (const value of ['auto', 'en', 'zh-Hans', 'zh-Hant'])
      expect(isLanguagePreference(value)).toBe(true)
  })
})

describe('translation completeness', () => {
  const scopes: Record<string, Record<'en' | 'zh-Hans' | 'zh-Hant', Record<string, string>>> = {
    production: messages,
    development: { en: devEn, 'zh-Hans': devHans, 'zh-Hant': devHant },
  }
  for (const [scope, resources] of Object.entries(scopes)) {
    it(`${scope} has matching keys and interpolation parameters, and every message renders`, () => {
      const parameters = (value: string) =>
        [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort()
      const i18n = createI18n({
        legacy: false,
        locale: 'en',
        fallbackLocale: false,
        messages: resources,
      })
      for (const [locale, resource] of Object.entries(resources)) {
        expect(Object.keys(resource).sort()).toEqual(Object.keys(resources.en).sort())
        i18n.global.locale.value = locale as 'en' | 'zh-Hans' | 'zh-Hant'
        for (const [key, value] of Object.entries(resource)) {
          expect(value.trim()).not.toBe('')
          expect(parameters(value)).toEqual(parameters(resources.en[key]!))
          const result = i18n.global.t(
            key,
            Object.fromEntries(parameters(value).map((name) => [name, '42'])),
          )
          expect(result).not.toBe(key)
          expect(result).not.toMatch(/\{\w+\}/)
        }
      }
    })
  }
})
