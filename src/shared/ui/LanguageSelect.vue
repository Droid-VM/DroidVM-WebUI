<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useLanguagePreference } from '../i18n'
import AppSelect from './AppSelect.vue'
import AppOption from './AppOption.vue'
const { t } = useI18n()
const languagePreference = useLanguagePreference()
</script>

<template>
  <div class="menu-row language-row">
    <span class="grow"
      >{{ t('language') }}<small>{{ t('languageHint') }}</small></span
    >
    <AppSelect v-model="languagePreference" class="language-select" :aria-label="t('language')">
      <AppOption value="auto">{{ t('languageAuto') }}</AppOption>
      <AppOption value="zh-Hans" lang="zh-Hans">简体中文</AppOption>
      <AppOption value="zh-Hant" lang="zh-Hant">繁體中文</AppOption>
      <AppOption value="en" lang="en">English</AppOption>
    </AppSelect>
  </div>
</template>

<style scoped>
.language-select {
  width: 200px;
}
@media (width < 600px) {
  .language-select {
    width: 160px;
  }
}
</style>
