<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import AppIcon from '../shared/ui/AppIcon.vue'
import AppSwitch from '../shared/ui/AppSwitch.vue'
import { useLanguagePreference, type MessageKey } from '../shared/i18n'
import { useSession } from '../modules/session'
import { useHostMonitoring } from '../modules/host'
import { useUsbRulesEditor } from '../modules/usbRules'
import { usePackageImport, usePackageExport, usePackageTransfers } from '../modules/packages'
import { useConfigurationBackup } from '../modules/backups'
import { useWebService } from '../modules/webService'
import { useImageImport } from '../modules/images'
import { useHugepages } from '../modules/hugepages'
import { useHostPreferences, preferenceKeys } from '../modules/hostPreferences'
import { useUsbAcm } from '../modules/usbAcm'
import { useAndroidDisplay } from '../modules/androidDisplay'
import { useDiskDefaults } from '../modules/diskDefaults'
const { t } = useI18n(),
  session = useSession()
const host = useHostMonitoring()
const languagePreference = useLanguagePreference()
const packageImport = usePackageImport(),
  packageExport = usePackageExport(),
  transfers = usePackageTransfers()
const backup = useConfigurationBackup(),
  usbRules = useUsbRulesEditor()
const webService = useWebService()
const imageImport = useImageImport()
const hugepages = useHugepages()
const preferences = useHostPreferences()
const usbAcm = useUsbAcm()
const androidDisplay = useAndroidDisplay()
const diskDefaults = useDiskDefaults()
interface Row {
  title: MessageKey
  to: string
  lead?: string
  available: boolean
  testId?: string
}
// The App's settings screen: one collapsible card per group, a row per destination.
// Destinations the host does not offer are left out, as the App hides them.
const general = computed<Row[]>(() => [
  {
    title: 'settingsWebUi',
    to: '/settings/service',
    lead: 'globe',
    available: webService.supported.value,
  },
  {
    title: 'hugepagesTitle',
    to: '/hugepages',
    lead: 'chip',
    available: hugepages.supported.value,
  },
  {
    title: 'hostOverviewTitle',
    to: '/host',
    lead: 'activity',
    available: host.supported.value,
  },
])
const vmLinks = computed<Row[]>(() => [
  {
    title: 'diskDefaultsTitle',
    to: '/settings/disks',
    available: diskDefaults.supported.value,
    testId: 'disk-defaults-link',
  },
  {
    title: 'usbAcmTitle',
    to: '/settings/usb-acm',
    available: usbAcm.supported.value,
    testId: 'usb-acm-link',
  },
  {
    title: 'usbRulesTitle',
    to: '/resources/usb/rules',
    available: usbRules.supported.value,
  },
  {
    title: 'usbDevices',
    to: '/resources/usb',
    available: true,
    testId: 'usb-devices-link',
  },
  {
    title: 'androidDisplayTitle',
    to: '/settings/android-display',
    available: androidDisplay.supported.value,
    testId: 'android-display-link',
  },
  {
    title: 'imageImportTitle',
    to: '/resources/disk/import',
    available: imageImport.supported.value,
  },
])
const backupLinks = computed<Row[]>(() => [
  {
    title: 'backupTitle',
    to: '/settings/backup',
    available: backup.supported.value,
  },
  {
    title: 'packageImportTitle',
    to: '/packages/import',
    available: packageImport.supported.value,
  },
  {
    title: 'packageExportTitle',
    to: '/packages/export',
    available: packageExport.supported.value,
  },
  {
    title: 'transferTitle',
    to: '/packages/transfers',
    available: transfers.supported.value,
  },
])
// Same destinations as the App's About group and home cards.
const aboutLinks = [
  { title: 'homeHelp', href: 'https://droid-vm.github.io/' },
  { title: 'homeFeedback', href: 'https://github.com/Droid-VM/DroidVM/issues' },
] as const
const languages = [
  { value: 'auto', label: 'languageAuto' },
  { value: 'zh-Hans', name: '简体中文' },
  { value: 'zh-Hant', name: '繁體中文' },
  { value: 'en', name: 'English' },
] as const
const languageName = computed(() => {
  const item = languages.find((entry) => entry.value === languagePreference.value)
  return !item ? '' : 'name' in item ? item.name : t(item.label)
})
const preferenceLabels = {
  vm_hugepage_auto_reserve: 'hostPreferencesHugepages',
  optimize_sdcard: 'hostPreferencesSdcard',
  vm_clear_logs_before_start: 'hostPreferencesLogs',
} as const
// The App's switches save on toggle; a refused or failed save falls back to the host value.
async function toggle(key: (typeof preferenceKeys)[number], value: boolean) {
  if (!preferences.editable.value) return
  preferences.draft[key] = value
  preferences.prepare()
  if (preferences.review.value) await preferences.submit()
  if (!preferences.pending.value && preferences.dirty.value) preferences.discard()
}
const daemon = computed(() => {
  const value = host.data.value?.daemon
  return value ? t('settingsDaemonRunning', { pid: value.pid, version: value.version }) : ''
})
onMounted(() => {
  if (preferences.supported.value) preferences.activate()
})
onBeforeUnmount(preferences.deactivate)
</script>
<template>
  <div class="page-heading desktop-only">
    <h1>{{ t('navSettings') }}</h1>
  </div>
  <div class="settings-groups">
    <section class="group card out" aria-labelledby="settings-general">
      <details class="cc" open>
        <summary>
          <span id="settings-general">{{ t('settingsCategoryGeneral') }}</span>
        </summary>
        <label class="row link language-row">
          <span class="lead"><AppIcon name="language" /></span>
          <span class="rt"
            ><span class="a">{{ t('language') }}</span
            ><span class="b">{{ languageName }}</span></span
          >
          <span class="trail"><AppIcon name="chevron" /></span>
          <select v-model="languagePreference" class="language-select" :aria-label="t('language')">
            <option v-for="item in languages" :key="item.value" :value="item.value">
              {{ 'name' in item ? item.name : t(item.label) }}
            </option>
          </select>
        </label>
        <template v-for="row in general" :key="row.to">
          <RouterLink v-if="row.available" class="row link" :to="row.to">
            <span class="lead"><AppIcon :name="row.lead!" /></span>
            <span class="rt"
              ><span class="a">{{ t(row.title) }}</span></span
            >
            <span class="trail"><AppIcon name="chevron" /></span>
          </RouterLink>
        </template>
      </details>
    </section>
    <section class="group card out" aria-labelledby="settings-vm">
      <details class="cc" open>
        <summary>
          <span id="settings-vm">{{ t('settingsCategoryVm') }}</span>
        </summary>
        <template v-if="preferences.supported.value">
          <RouterLink class="row link" to="/settings/vm" data-testid="host-preferences-link">
            <span class="rt"
              ><span class="a">{{ t('hostPreferencesTitle') }}</span></span
            >
            <span class="trail"><AppIcon name="chevron" /></span>
          </RouterLink>
          <AppSwitch
            v-for="key in preferenceKeys"
            :key="key"
            class="row"
            :model-value="preferences.draft[key]"
            :disabled="!preferences.editable.value"
            :data-testid="`settings-preference-${key}`"
            @update:model-value="toggle(key, $event)"
          >
            <span class="rt"
              ><span class="a">{{ t(preferenceLabels[key]) }}</span></span
            >
          </AppSwitch>
        </template>
        <template v-for="row in vmLinks" :key="row.to">
          <RouterLink v-if="row.available" class="row link" :to="row.to" :data-testid="row.testId">
            <span class="rt"
              ><span class="a">{{ t(row.title) }}</span></span
            >
            <span class="trail"><AppIcon name="chevron" /></span>
          </RouterLink>
        </template>
      </details>
    </section>
    <section class="group card out" aria-labelledby="settings-service">
      <details class="cc" open>
        <summary>
          <span id="settings-service">{{ t('settingsCategoryService') }}</span>
        </summary>
        <div v-if="daemon" class="row">
          <span class="lead ok"><AppIcon name="ok" /></span>
          <span class="rt"
            ><span class="a">{{ t('settingsDaemonStatus') }}</span
            ><span class="b">{{ daemon }}</span></span
          >
        </div>
        <div v-if="session" class="row">
          <span class="rt"
            ><span class="a">{{ t('sessionConnected') }}</span></span
          >
          <button type="button" class="btn tonal" @click="session.logout()">
            {{ t('sessionLogout') }}
          </button>
        </div>
      </details>
    </section>
    <section
      v-if="backupLinks.some((row) => row.available)"
      class="group card out"
      aria-labelledby="settings-backup"
    >
      <details class="cc" open>
        <summary>
          <span id="settings-backup">{{ t('settingsCategoryBackup') }}</span>
        </summary>
        <template v-for="row in backupLinks" :key="row.to">
          <RouterLink v-if="row.available" class="row link" :to="row.to">
            <span class="rt"
              ><span class="a">{{ t(row.title) }}</span></span
            >
            <span class="trail"><AppIcon name="chevron" /></span>
          </RouterLink>
        </template>
      </details>
    </section>
    <section class="group card out" aria-labelledby="settings-about">
      <details class="cc" open>
        <summary>
          <span id="settings-about">{{ t('settingsCategoryAbout') }}</span>
        </summary>
        <a
          v-for="link in aboutLinks"
          :key="link.href"
          class="row link"
          :href="link.href"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="t('homeOpensExternal', { name: t(link.title) })"
          ><span class="rt"
            ><span class="a">{{ t(link.title) }}</span></span
          ><span class="trail"><AppIcon name="open" /></span
        ></a>
      </details>
    </section>
  </div>
</template>
<style scoped>
.settings-groups {
  min-width: 0;
}
.group {
  margin-bottom: 12px;
}
/* The language row opens the native picker: the select covers the whole row. */
.language-row {
  position: relative;
}
.language-row select {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
.row.app-switch {
  min-height: 56px;
}
.lead.ok {
  color: var(--md-sys-color-on-surface);
}
.row > .btn {
  flex-shrink: 0;
  align-self: center;
}
/* Masonry like the App: two columns on medium screens, three with the drawer. */
@media (width >= 600px) {
  .settings-groups {
    columns: 2;
    column-gap: 16px;
  }
  .group {
    display: inline-block;
    width: 100%;
    margin-bottom: 16px;
    break-inside: avoid;
  }
}
@media (width >= 1200px) {
  .settings-groups {
    columns: 3;
  }
}
</style>
