<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageSelect from '../shared/ui/LanguageSelect.vue'
import AppButton from '../shared/ui/AppButton.vue'
import AppSegmentedButton from '../shared/ui/AppSegmentedButton.vue'
import ResourceRow from '../shared/ui/ResourceRow.vue'
import { themeMode } from '../shared/lib/theme'
import { useSession } from '../modules/session'
import { HostSummary, useHostOverview } from '../modules/host'
import { useUsbRulesEditor } from '../modules/usbRules'
import { usePackageImport, usePackageExport, usePackageTransfers } from '../modules/packages'
import { useConfigurationBackup } from '../modules/backups'
import { useWebService } from '../modules/webService'
import { useImageImport } from '../modules/images'
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
const themeOptions = computed(() =>
  (['system', 'light', 'dark'] as const).map((value) => ({
    value,
    icon: value,
    label: t({ system: 'themeSystem', light: 'themeLight', dark: 'themeDark' }[value]),
  })),
)
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
        <ResourceRow
          :title="t('hostOverviewTitle')"
          to="/host"
          icon="activity"
          :description="
            t(host.supported.value ? 'hostOverviewMenuHint' : 'settingsCapabilityUnavailable')
          "
        />
        <LanguageSelect />
        <div class="menu-row theme-row">
          <span class="grow">{{ t('theme') }}</span
          ><AppSegmentedButton v-model="themeMode" :label="t('theme')" :options="themeOptions" />
        </div>
      </div>
    </section>
    <section class="settings-group" aria-labelledby="settings-vm">
      <h2 id="settings-vm">{{ t('settingsCategoryVm') }}</h2>
      <div class="menu">
        <ResourceRow
          :title="t('diskDefaultsTitle')"
          to="/settings/disks"
          icon="disk"
          :description="
            t(
              diskDefaults.supported.value
                ? 'diskDefaultsMenuHint'
                : 'settingsCapabilityUnavailable',
            )
          "
          :disabled="!diskDefaults.supported.value"
          data-testid="disk-defaults-link"
        />
        <ResourceRow
          :title="t('usbAcmTitle')"
          to="/settings/usb-acm"
          icon="usb"
          :description="
            t(usbAcm.supported.value ? 'usbAcmMenuHint' : 'settingsCapabilityUnavailable')
          "
          :disabled="!usbAcm.supported.value"
          data-testid="usb-acm-link"
        />
        <ResourceRow :title="t('navVms')" to="/vms" icon="vm" :description="t('settingsVmHint')" />
        <ResourceRow
          :title="t('imageImportTitle')"
          to="/resources/disk/import"
          icon="disk"
          :description="
            t(imageImport.supported.value ? 'imageImportMenuHint' : 'settingsCapabilityUnavailable')
          "
          :disabled="!imageImport.supported.value"
        />
        <ResourceRow
          :title="t('usbRulesTitle')"
          to="/resources/usb/rules"
          icon="usb"
          :description="
            t(usbRules.supported.value ? 'settingsUsbRulesHint' : 'settingsCapabilityUnavailable')
          "
          :disabled="!usbRules.supported.value"
        />
        <ResourceRow
          :title="t('hostPreferencesTitle')"
          to="/settings/vm"
          icon="settings"
          :description="
            t(
              hostPreferences.supported.value
                ? 'hostPreferencesMenuHint'
                : 'settingsCapabilityUnavailable',
            )
          "
          :disabled="!hostPreferences.supported.value"
          data-testid="host-preferences-link"
        />
      </div>
    </section>
    <section class="settings-group" aria-labelledby="settings-kernel">
      <h2 id="settings-kernel">{{ t('settingsCategoryKernel') }}</h2>
      <div class="menu">
        <ResourceRow
          :title="t('hugepagesTitle')"
          to="/hugepages"
          icon="memory"
          :description="
            t(hugepages.supported.value ? 'hugepagesMenuHint' : 'settingsCapabilityUnavailable')
          "
          :disabled="!hugepages.supported.value"
        />
      </div>
    </section>
    <section class="settings-group" aria-labelledby="settings-backup">
      <h2 id="settings-backup">{{ t('settingsCategoryBackup') }}</h2>
      <div class="menu">
        <ResourceRow
          v-for="link in backupLinks"
          :key="link.path"
          :to="link.path"
          :title="t(link.title)"
          icon="resources"
          :description="t(link.available ? link.hint : 'settingsCapabilityUnavailable')"
          :disabled="!link.available"
        />
      </div>
    </section>
    <section class="settings-group" aria-labelledby="settings-service">
      <h2 id="settings-service">{{ t('settingsCategoryService') }}</h2>
      <div class="menu">
        <ResourceRow
          :title="t('webServiceTitle')"
          to="/settings/service"
          icon="network"
          :description="
            t(webService.supported.value ? 'webServiceMenuHint' : 'settingsCapabilityUnavailable')
          "
          :disabled="!webService.supported.value"
        />
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
  font-size: var(--md-sys-typescale-title-medium-size);
}
.settings-group .menu {
  margin: 0;
}
.menu-row,
.grow {
  min-width: 0;
  overflow-wrap: anywhere;
}
@media (width < 600px) {
  .theme-row {
    flex-wrap: wrap;
  }
  .theme-row .segmented {
    width: 100%;
  }
}
@media (width < 480px) {
  .menu-row {
    flex-wrap: wrap;
  }
  .menu-row .segmented {
    max-width: 100%;
  }
}
</style>
