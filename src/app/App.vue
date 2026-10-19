<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useInventory } from '../modules/vm'
import { SessionGate } from '../modules/session'
import { useTaskMonitor } from '../modules/tasks'
import '@material/web/ripple/ripple.js'
import AppButton from '../shared/ui/AppButton.vue'
import AppDialog from '../shared/ui/AppDialog.vue'
import AppFab from '../shared/ui/AppFab.vue'
import AppIcon from '../shared/ui/AppIcon.vue'
import { startTheme, themeMode } from '../shared/lib/theme'
import { AgentOperationDialog, useAgentOperations, useAgentRescue } from '../modules/agent'
import { useVisiblePolling } from '../shared/model/visiblePolling'
import { usePackageExport, usePackageImport } from '../modules/packages'
import { useConfigurationBackup } from '../modules/backups'
import { useWebService } from '../modules/webService'
import { useImageImport, useImageTransfers } from '../modules/images'
import { useConfigurationEditor } from '../modules/configuration'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { mode, status, problem } = useInventory()
const tasks = useTaskMonitor()
const packageExport = usePackageExport()
const packageImport = usePackageImport()
const backup = useConfigurationBackup()
const webService = useWebService()
const imageImport = useImageImport()
const imageTransfers = useImageTransfers()
const configuration = useConfigurationEditor()
const creationOpen = ref(false)
const canChooseCreation = computed(
  () => configuration.canCreate.value || packageImport.supported.value,
)
function chooseCreation(path: '/vms/new' | '/packages/import') {
  creationOpen.value = false
  void router.push(path)
}
useVisiblePolling(
  () => !!imageTransfers.entry.value && imageTransfers.entry.value.state !== 'done',
  imageTransfers.reconcile,
  ['tasks'],
)
useVisiblePolling(() => imageImport.pending.value, imageImport.reconcile, ['tasks'])
useVisiblePolling(() => webService.pending.value, webService.reconcile)
useVisiblePolling(
  () => packageExport.pending.value || packageImport.pending.value || backup.pending.value,
  async () => {
    await packageExport.reconcile()
    await packageImport.reconcile()
    await backup.reconcile()
    return true
  },
  ['tasks'],
)
const agent = useAgentOperations()
const rescue = useAgentRescue()
useVisiblePolling(
  () => rescue.pending.value,
  async () => {
    await rescue.reconcile()
    return true
  },
  ['tasks'],
)
watch(
  () => route.fullPath,
  () => agent.close(),
)
useVisiblePolling(
  () => agent.busy.value,
  async () => {
    await agent.reconcile()
    await agent.reconcileRecovery()
    return true
  },
  ['tasks'],
)
const connectionLabel = computed(() => {
  if (mode !== 'http') return 'disconnected'
  const observation = route.path === '/tasks' && tasks.supported.value ? tasks : { status, problem }
  if (observation.status.value === 'loading') return 'loading'
  if (observation.status.value === 'ready') return 'snapshotLoaded'
  if (observation.problem.value?.code === 'unauthenticated') return 'errorAuthTitle'
  return 'disconnected'
})
const development = import.meta.env.DEV
const navigationActive = (path: string) =>
  route.path.startsWith(path) || (path === '/more' && route.path === '/host')
onUnmounted(startTheme())
const themeLabels = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' } as const
const themeToggleLabel = computed(() => `${t('theme')}: ${t(themeLabels[themeMode.value])}`)
function cycleTheme() {
  themeMode.value = ({ system: 'light', light: 'dark', dark: 'system' } as const)[themeMode.value]
}
const navigation: { path: string; label: string; icon: string; visibility?: string }[] = [
  { path: '/vms', label: 'navVms', icon: 'vm' },
  { path: '/resources', label: 'navResources', icon: 'resources', visibility: 'mobile-only' },
  { path: '/resources/network', label: 'navNetwork', icon: 'network', visibility: 'desktop-only' },
  { path: '/resources/disk', label: 'navDisk', icon: 'disk', visibility: 'desktop-only' },
  { path: '/resources/usb', label: 'navUsb', icon: 'usb', visibility: 'desktop-only' },
  { path: '/tasks', label: 'navTasks', icon: 'tasks' },
  { path: '/more', label: 'navMore', icon: 'settings' },
]
</script>

<template>
  <SessionGate>
    <a class="skip-link" href="#main">{{ t('skipContent') }}</a>
    <div class="app-shell">
      <aside class="rail">
        <AppFab
          v-if="canChooseCreation"
          class="desktop-only"
          icon="plus"
          :aria-label="t('createVm')"
          :title="t('createVm')"
          aria-haspopup="dialog"
          @click="creationOpen = true"
        />
        <RouterLink v-else to="/vms" class="logo" :aria-label="t('home')"
          ><AppIcon name="vm"
        /></RouterLink>
        <nav :aria-label="t('navigation')">
          <RouterLink
            v-for="item in navigation"
            :key="item.path"
            :to="item.path"
            :class="[item.visibility, { active: navigationActive(item.path) }]"
            :aria-current="navigationActive(item.path) ? 'page' : undefined"
          >
            <span class="nav-icon"
              ><md-ripple /><AppIcon
                :name="item.icon"
                :filled="navigationActive(item.path)" /></span
            ><span>{{ t(item.label) }}</span>
          </RouterLink>
        </nav>
        <span class="rail-note">DroidVM</span>
      </aside>
      <div class="app-body">
        <header class="topbar">
          <div class="wordmark">
            <span class="desktop-only">DroidVM</span>
            <h1 class="mobile-only">{{ t(String(route.meta.title || 'management')) }}</h1>
            <small class="desktop-only">{{ t('management') }}</small>
          </div>
          <span class="connection" aria-live="polite"
            ><i class="dot" :data-state="connectionLabel" />{{ t(connectionLabel) }}</span
          >
          <AppButton
            tone="icon"
            class="desktop-only"
            :aria-label="themeToggleLabel"
            :title="themeToggleLabel"
            @click="cycleTheme"
            ><AppIcon :name="themeMode"
          /></AppButton>
        </header>
        <div v-if="mode === 'preview'" class="preview-banner" role="status">
          {{ t('preview') }}
        </div>
        <div v-else-if="development && mode === 'http'" class="preview-banner" role="status">
          {{ t('httpPreview') }}
        </div>
        <main id="main" tabindex="-1"><RouterView /></main>
        <AppFab
          v-if="canChooseCreation && route.path === '/vms'"
          class="fab-compact mobile-only"
          icon="plus"
          :label="t('createVm')"
          aria-haspopup="dialog"
          @click="creationOpen = true"
        />
        <AppDialog :open="creationOpen" :title="t('createVm')" @close="creationOpen = false">
          <div class="creation-options">
            <AppButton
              tone="tonal"
              :disabled="!configuration.canCreate.value"
              @click="chooseCreation('/vms/new')"
              ><AppIcon name="settings" />{{ t('createVmCustom') }}</AppButton
            >
            <AppButton
              tone="tonal"
              :disabled="!packageImport.supported.value"
              @click="chooseCreation('/packages/import')"
              ><AppIcon name="disk" />{{ t('createVmImport') }}</AppButton
            >
          </div>
        </AppDialog>
        <AgentOperationDialog v-if="agent.open.value" />
      </div>
    </div>
  </SessionGate>
</template>
