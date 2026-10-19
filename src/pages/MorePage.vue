<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageSelect from '../shared/ui/LanguageSelect.vue'
import AppButton from '../shared/ui/AppButton.vue'
import { themeMode } from '../shared/lib/theme'
import { useSession } from '../modules/session'
import { HostSummary, useHostOverview } from '../modules/host'
import { useUsbRulesEditor } from '../modules/usbRules'
import { usePackageImport, usePackageExport, usePackageTransfers } from '../modules/packages'
import { useConfigurationBackup } from '../modules/backups'
import { useWebService } from '../modules/webService'
import { useImageImport } from '../modules/images'
import { useLinuxVmWizard } from '../modules/linuxVm'
import { useHugepages } from '../modules/hugepages'
import { useHostPreferences } from '../modules/hostPreferences'
import { useUsbAcm } from '../modules/usbAcm'
import { useDiskDefaults } from '../modules/diskDefaults'
const { t } = useI18n(),
  session = useSession()
const host = useHostOverview()
const packageImport = usePackageImport(),
  packageExport = usePackageExport(),
  transfers = usePackageTransfers()
const backup = useConfigurationBackup(),
  usbRules = useUsbRulesEditor()
const webService = useWebService()
const imageImport = useImageImport()
const linuxVm = useLinuxVmWizard()
const hugepages = useHugepages()
const hostPreferences = useHostPreferences()
const usbAcm = useUsbAcm()
const diskDefaults = useDiskDefaults()
const backupLinks = computed(() => [
  {
    title: 'backupTitle',
    hint: 'backupScope',
    path: '/settings/backup',
    available: backup.supported.value,
  },
  {
    title: 'packageImportTitle',
    hint: 'packageImportHostHint',
    path: '/packages/import',
    available: packageImport.supported.value,
  },
  {
    title: 'packageExportTitle',
    hint: 'packageExportHostHint',
    path: '/packages/export',
    available: packageExport.supported.value,
  },
  {
    title: 'transferTitle',
    hint: 'settingsTransferHint',
    path: '/packages/transfers',
    available: transfers.supported.value,
  },
])
</script>
<template>
  <div class="page-heading desktop-only">
    <h1>{{ t('navMore') }}</h1>
  </div>
  <HostSummary variant="identity" />
  <div class="settings-groups">
    <section class="settings-group" aria-labelledby="settings-general">
      <h2 id="settings-general">{{ t('settingsCategoryGeneral') }}</h2>
      <div class="menu">
        <div class="menu-row">
          <span class="grow"
            ><RouterLink to="/host"
              ><strong>{{ t('hostOverviewTitle') }}</strong></RouterLink
            ><small>{{
              t(host.supported.value ? 'hostOverviewMenuHint' : 'settingsCapabilityUnavailable')
            }}</small></span
          >
        </div>
        <LanguageSelect />
        <label class="menu-row"
          ><span class="grow">{{ t('theme') }}</span
          ><select v-model="themeMode" :aria-label="t('theme')">
            <option value="system">{{ t('themeSystem') }}</option>
            <option value="light">{{ t('themeLight') }}</option>
            <option value="dark">{{ t('themeDark') }}</option>
          </select></label
        >
      </div>
    </section>
    <section class="settings-group" aria-labelledby="settings-vm">
      <h2 id="settings-vm">{{ t('settingsCategoryVm') }}</h2>
      <div class="menu">
        <div class="menu-row">
          <span class="grow"
            ><RouterLink
              v-if="diskDefaults.supported.value"
              to="/settings/disks"
              data-testid="disk-defaults-link"
              ><strong>{{ t('diskDefaultsTitle') }}</strong></RouterLink
            ><strong v-else>{{ t('diskDefaultsTitle') }}</strong
            ><small>{{
              t(
                diskDefaults.supported.value
                  ? 'diskDefaultsMenuHint'
                  : 'settingsCapabilityUnavailable',
              )
            }}</small></span
          >
        </div>
        <div class="menu-row">
          <span class="grow"
            ><RouterLink
              v-if="usbAcm.supported.value"
              to="/settings/usb-acm"
              data-testid="usb-acm-link"
              ><strong>{{ t('usbAcmTitle') }}</strong></RouterLink
            ><strong v-else>{{ t('usbAcmTitle') }}</strong
            ><small>{{
              t(usbAcm.supported.value ? 'usbAcmMenuHint' : 'settingsCapabilityUnavailable')
            }}</small></span
          >
        </div>
        <div class="menu-row">
          <span class="grow">
            <RouterLink v-if="linuxVm.supported.value" to="/vms/new/linux"
              ><strong>{{ t('linuxVmTitle') }}</strong></RouterLink
            >
            <strong v-else>{{ t('linuxVmTitle') }}</strong>
            <small>{{
              t(linuxVm.supported.value ? 'linuxVmMenuHint' : 'settingsCapabilityUnavailable')
            }}</small>
          </span>
        </div>
        <div class="menu-row">
          <span class="grow"
            ><RouterLink to="/vms"
              ><strong>{{ t('navVms') }}</strong></RouterLink
            ><small>{{ t('settingsVmHint') }}</small></span
          >
        </div>
        <div class="menu-row">
          <span class="grow"
            ><RouterLink v-if="imageImport.supported.value" to="/resources/disk/import"
              ><strong>{{ t('imageImportTitle') }}</strong></RouterLink
            ><strong v-else>{{ t('imageImportTitle') }}</strong
            ><small>{{
              t(
                imageImport.supported.value
                  ? 'imageImportMenuHint'
                  : 'settingsCapabilityUnavailable',
              )
            }}</small></span
          >
        </div>
        <div class="menu-row">
          <span class="grow"
            ><RouterLink v-if="usbRules.supported.value" to="/resources/usb/rules"
              ><strong>{{ t('usbRulesTitle') }}</strong></RouterLink
            ><strong v-else>{{ t('usbRulesTitle') }}</strong
            ><small>{{
              t(usbRules.supported.value ? 'settingsUsbRulesHint' : 'settingsCapabilityUnavailable')
            }}</small></span
          >
        </div>
        <div class="menu-row">
          <span class="grow"
            ><RouterLink
              v-if="hostPreferences.supported.value"
              to="/settings/vm"
              data-testid="host-preferences-link"
              ><strong>{{ t('hostPreferencesTitle') }}</strong></RouterLink
            >
            <strong v-else>{{ t('hostPreferencesTitle') }}</strong>
            <small>{{
              t(
                hostPreferences.supported.value
                  ? 'hostPreferencesMenuHint'
                  : 'settingsCapabilityUnavailable',
              )
            }}</small></span
          >
        </div>
      </div>
    </section>
    <section class="settings-group" aria-labelledby="settings-kernel">
      <h2 id="settings-kernel">{{ t('settingsCategoryKernel') }}</h2>
      <div class="menu">
        <div class="menu-row">
          <span class="grow">
            <RouterLink v-if="hugepages.supported.value" to="/hugepages"
              ><strong>{{ t('hugepagesTitle') }}</strong></RouterLink
            >
            <strong v-else>{{ t('hugepagesTitle') }}</strong>
            <small>{{
              t(hugepages.supported.value ? 'hugepagesMenuHint' : 'settingsCapabilityUnavailable')
            }}</small>
          </span>
        </div>
      </div>
    </section>
    <section class="settings-group" aria-labelledby="settings-backup">
      <h2 id="settings-backup">{{ t('settingsCategoryBackup') }}</h2>
      <div class="menu">
        <div v-for="link in backupLinks" :key="link.path" class="menu-row">
          <span class="grow"
            ><RouterLink v-if="link.available" :to="link.path"
              ><strong>{{ t(link.title) }}</strong></RouterLink
            ><strong v-else>{{ t(link.title) }}</strong
            ><small>{{
              t(link.available ? link.hint : 'settingsCapabilityUnavailable')
            }}</small></span
          >
        </div>
      </div>
    </section>
    <section class="settings-group" aria-labelledby="settings-service">
      <h2 id="settings-service">{{ t('settingsCategoryService') }}</h2>
      <div class="menu">
        <div class="menu-row">
          <span class="grow"
            ><RouterLink v-if="webService.supported.value" to="/settings/service"
              ><strong>{{ t('webServiceTitle') }}</strong></RouterLink
            ><strong v-else>{{ t('webServiceTitle') }}</strong
            ><small>{{
              t(webService.supported.value ? 'webServiceMenuHint' : 'settingsCapabilityUnavailable')
            }}</small></span
          >
        </div>
        <div v-if="session" class="menu-row">
          <span class="grow"
            >{{ t('sessionConnected') }}<small>{{ t('sessionLogoutHint') }}</small></span
          ><AppButton tone="tonal" @click="session.logout()">{{ t('sessionLogout') }}</AppButton>
        </div>
      </div>
    </section>
  </div>
</template>
<style scoped>
.settings-groups,
.settings-group {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.settings-groups {
  gap: var(--space-5);
}
.settings-group h2 {
  margin: 0;
  padding-inline: var(--space-4);
  font-size: var(--font-heading);
}
.settings-group .menu {
  margin: 0;
}
.menu-row,
.grow {
  min-width: 0;
  overflow-wrap: anywhere;
}
.menu-row a {
  display: inline-block;
  padding-block: 8px;
}
@media (max-width: 480px) {
  .menu-row {
    flex-wrap: wrap;
  }
  .menu-row select {
    max-width: 100%;
  }
}
</style>
