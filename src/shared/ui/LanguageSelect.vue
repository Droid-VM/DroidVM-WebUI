<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useLanguagePreference } from '../i18n'
const { t } = useI18n()
const languagePreference = useLanguagePreference()
</script>

<template>
  <label class="menu-row language-row">
    <span class="grow"
      >{{ t('language') }}<small>{{ t('languageHint') }}</small></span
    >
    <select v-model="languagePreference" :aria-label="t('language')">
      <option value="auto">{{ t('languageAuto') }}</option>
      <option value="zh-Hans" lang="zh-Hans">简体中文</option>
      <option value="zh-Hant" lang="zh-Hant">繁體中文</option>
      <option value="en" lang="en">English</option>
    </select>
  </label>
</template>
