<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import en from './locales/en.json'
import zhHans from './locales/zh-Hans.json'
import zhHant from './locales/zh-Hant.json'
import { onBeforeUnmount, ref } from 'vue'
import AppButton from '../src/shared/ui/AppButton.vue'
import AppDialog from '../src/shared/ui/AppDialog.vue'
import ConfirmDialog from '../src/shared/ui/ConfirmDialog.vue'
import AppNotice from '../src/shared/ui/AppNotice.vue'
import AppProgress from '../src/shared/ui/AppProgress.vue'
import { scenarios } from './scenarios'

const { t } = useI18n({ useScope: 'local', messages: { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant } })
const parentOpen = ref(false)
const confirmOpen = ref(false)
const busy = ref(false)
const error = ref('')
const fail = ref(false)
const notice = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function openConfirmation() {
  error.value = ''
  confirmOpen.value = true
}
function confirm() {
  busy.value = true
  timer = setTimeout(() => {
    busy.value = false
    if (fail.value) {
      error.value = 'failure'
      return
    }
    confirmOpen.value = false
    notice.value = true
  }, 500)
}
onBeforeUnmount(() => {
  clearTimeout(timer)
})
</script>

<template>
  <h1 class="desktop-only">{{ t('workbenchTitle') }}</h1>
  <p class="muted">{{ t('workbenchHint') }}</p>
  <AppNotice
    v-if="notice"
    :title="t('confirmationReceived')"
    dismissible
    @dismiss="notice = false"
    >{{ t('noBusinessAction') }}</AppNotice
  >
  <section class="panel workbench">
    <h2>{{ t('progress') }}</h2>
    <AppProgress :label="t('knownProgress')" :value="42" /><AppProgress
      :label="t('unknownProgress')"
    />
  </section>
  <section class="panel workbench">
    <h2>{{ t('dialogs') }}</h2>
    <label class="failure-toggle"
      ><input v-model="fail" type="checkbox" />{{ t('simulateFailure') }}</label
    ><AppButton tone="tonal" @click="openConfirmation">{{ t('openConfirmation') }}</AppButton
    ><AppButton @click="parentOpen = true">{{ t('openNested') }}</AppButton>
  </section>
  <section class="panel">
    <h2>{{ t('vmScenarios') }}</h2>
    <ul>
      <li v-for="scenario in scenarios" :key="scenario">
        <a :href="`/dev.html?scenario=${scenario}#/vms`">{{ scenario }}</a>
      </li>
    </ul>
  </section>
  <AppDialog :open="parentOpen" :title="t('outerDetails')" @close="parentOpen = false"
    ><p>{{ t('nestedHint') }}</p>
    <AppButton @click="openConfirmation">{{ t('confirmInDetails') }}</AppButton></AppDialog
  >
  <ConfirmDialog
    :open="confirmOpen"
    :title="t('confirmationExample')"
    :description="t('confirmationHint')"
    :busy="busy"
    :error="error ? t(error) : ''"
    @cancel="confirmOpen = false"
    @confirm="confirm"
  />
</template>

<style scoped>
.workbench {
  display: grid;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}
.failure-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--touch-target);
}
li a {
  display: inline-flex;
  align-items: center;
  min-height: var(--touch-target);
  overflow-wrap: anywhere;
}
ul {
  padding-left: var(--space-5);
}
</style>
