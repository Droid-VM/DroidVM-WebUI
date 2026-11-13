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
import SearchField from '../shared/ui/SearchField.vue'
import { startTheme, themeMode } from '../shared/lib/theme'
import { AgentOperationDialog, useAgentOperations, useAgentRescue } from '../modules/agent'
import { requestRefresh, useVisiblePolling } from '../shared/model/visiblePolling'
import { pageSearch } from '../shared/model/pageSearch'
import { useMediaQuery } from '../shared/lib/mediaQuery'
import { usePackageExport, usePackageImport } from '../modules/packages'
import { useConfigurationBackup } from '../modules/backups'
import { useWebService } from '../modules/webService'
import { useImageImport, useImageTransfers } from '../modules/images'
import { useConfigurationEditor } from '../modules/configuration'

const { t, n } = useI18n()
const route = useRoute()
// >= 1200px: the rail widens into a labelled navigation drawer (App-style tablet/desktop).
const drawer = useMediaQuery('(width >= 1200px)')
const router = useRouter()
const { mode, status, problem, query, items } = useInventory()
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
// Settings owns every page reached from it, matching the App's settings tab.
const settingsPaths = [
  '/more',
  '/host',
  '/settings',
  '/hugepages',
  '/packages',
  '/agent',
  '/resources/usb',
]
const navigationActive = (path: string) =>
  path === '/more'
    ? settingsPaths.some((prefix) => route.path.startsWith(prefix))
    : route.path.startsWith(path)
const resourceTitles: Record<string, string> = {
  network: 'navNetwork',
  disk: 'navDisk',
  usb: 'usbDevices',
}
// The home screen is titled with the app name, like the App's main activity.
const pageTitle = computed(() =>
  route.path === '/home'
    ? 'appName'
    : (route.path.startsWith('/resources/') && resourceTitles[String(route.params.kind)]) ||
      String(route.meta.title || 'management'),
)
// Editing a VM is titled with its name, as the App's edit screen.
const titleText = computed(() => {
  const name = items.value.find((vm) => vm.id === route.params.id)?.name
  if (name && /^\/vms\/[^/]+\/edit$/.test(route.path)) return t('editTitle', { name })
  return t(pageTitle.value)
})
// Second-level pages go back to their parent from the top bar, like App sub-screens.
const parentPath = computed(() => {
  if (/^\/vms\/[^/]+\/(edit|copy)$/.test(route.path))
    return `/vms/${encodeURIComponent(String(route.params.id))}`
  if (route.path === '/resources/usb') return '/more'
  // Tasks is a drawer destination on wide screens and a sub-screen elsewhere.
  if (route.path === '/tasks' && !drawer.value) return '/home'
  return typeof route.meta.parent === 'string' ? route.meta.parent : null
})
// The top bar search filters the disk / network list on those pages and the VM list
// elsewhere (opening it when needed).
const resourceSearch = computed(() => /^\/resources\/(disk|network)$/.test(route.path))
const search = computed({
  get: () => (resourceSearch.value ? pageSearch.value : query.value),
  set: (value: string) => {
    if (resourceSearch.value) pageSearch.value = value
    else query.value = value
  },
})
watch(query, (value) => {
  if (value && !route.path.startsWith('/vms')) void router.push('/vms')
})
watch(
  () => route.path,
  () => (pageSearch.value = ''),
)
const activeTasks = computed(
  () =>
    tasks.items.value.filter((task) => ['queued', 'running', 'cancelling'].includes(task.state))
      .length,
)
// Medium top app bar: the large title scrolls away and the row title fades in.
const scrollTop = ref(0)
const onScroll = () => (scrollTop.value = window.scrollY)
window.addEventListener('scroll', onScroll, { passive: true })
onUnmounted(() => window.removeEventListener('scroll', onScroll))
watch(
  () => route.path,
  () => (scrollTop.value = window.scrollY),
)
// Sub-pages and wide screens keep a small bar whose row title is the page heading.
const smallBar = computed(() => drawer.value || !!parentPath.value || route.path === '/tasks')
// The App's FAB belongs to the three list destinations.
const fab = computed(() => {
  if (route.path === '/vms' && canChooseCreation.value) return { label: 'createVm', kind: 'vm' }
  if (route.path === '/resources/disk') return { label: 'fabDiskAdd', kind: 'disk' }
  if (route.path === '/resources/network') return { label: 'fabNetworkCreate', kind: 'network' }
  return null
})
function fabAction() {
  if (!fab.value || fab.value.kind === 'vm') {
    creationOpen.value = true
    return
  }
  void router.replace({ path: route.path, query: { create: '1' } })
}
onUnmounted(startTheme())
const themeLabels = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' } as const
const themeToggleLabel = computed(() => `${t('theme')}: ${t(themeLabels[themeMode.value])}`)
function cycleTheme() {
  themeMode.value = ({ system: 'light', light: 'dark', dark: 'system' } as const)[themeMode.value]
}
// Same five destinations as the App's bottom navigation; tasks live in the top bar
// and, on wide screens, below the drawer divider.
const navigation: { path: string; label: string; icon: string; visibility?: string }[] = [
  { path: '/home', label: 'navHome', icon: 'home' },
  { path: '/vms', label: 'navVms', icon: 'vm' },
  { path: '/resources/disk', label: 'navDisk', icon: 'disk' },
  { path: '/resources/network', label: 'navNetwork', icon: 'network' },
  { path: '/more', label: 'navSettings', icon: 'settings' },
  { path: '/tasks', label: 'navTasks', icon: 'tasks', visibility: 'drawer-only' },
]
</script>

<template>
  <SessionGate>
    <a class="skip-link" href="#main">{{ t('skipContent') }}</a>
    <div class="app-shell" :class="{ 'sub-page': parentPath }">
      <aside class="rail">
        <RouterLink to="/home" class="brand drawer-only" :aria-label="t('home')"
          ><span class="brand-mark"><AppIcon name="vm" /></span>DroidVM</RouterLink
        >
        <AppFab
          v-if="canChooseCreation || fab"
          class="desktop-only"
          icon="plus"
          :label="drawer ? t(fab?.label ?? 'createVm') : undefined"
          :aria-label="t(fab?.label ?? 'createVm')"
          :title="t(fab?.label ?? 'createVm')"
          :aria-haspopup="fab && fab.kind !== 'vm' ? undefined : 'dialog'"
          @click="fabAction"
        />
        <nav :aria-label="t('navigation')">
          <template v-for="item in navigation" :key="item.path">
            <span v-if="item.visibility === 'drawer-only'" class="nav-divider drawer-only" />
            <RouterLink
              :to="item.path"
              :class="[item.visibility, { active: navigationActive(item.path) }]"
              :aria-current="navigationActive(item.path) ? 'page' : undefined"
            >
              <span class="nav-icon"><md-ripple /><AppIcon :name="item.icon" /></span
              ><span>{{ t(item.label) }}</span>
            </RouterLink>
          </template>
        </nav>
        <span class="rail-foot" :title="t(connectionLabel)"
          ><i class="dot" :data-state="connectionLabel" /><span class="drawer-only"
            >droidvmd · </span
          ><span class="connection" aria-live="polite">{{ t(connectionLabel) }}</span></span
        >
      </aside>
      <div class="app-body">
        <header class="topbar" :class="{ lifted: scrollTop > 4, small: smallBar }">
          <div class="tb-row">
            <AppButton
              v-if="parentPath"
              tone="icon"
              :aria-label="t('navBack')"
              :title="t('navBack')"
              @click="router.push(parentPath)"
              ><AppIcon name="back"
            /></AppButton>
            <h1 v-if="smallBar" class="tb-title">{{ titleText }}</h1>
            <span v-else class="tb-title" :class="{ shown: scrollTop > 24 }" aria-hidden="true">{{
              titleText
            }}</span>
            <SearchField
              v-if="drawer && !parentPath"
              v-model="search"
              class="tb-search"
              :label="t('searchByName')"
              :placeholder="t(resourceSearch ? 'resourceSearch' : 'searchVms')"
            />
            <div id="top-actions" class="tb-actions" />
            <template v-if="!parentPath">
              <RouterLink
                to="/tasks"
                class="top-action"
                :aria-label="
                  activeTasks ? t('activeTasksLabel', { count: n(activeTasks) }) : t('navTasks')
                "
                :title="t('navTasks')"
                :aria-current="route.path === '/tasks' ? 'page' : undefined"
                ><md-ripple /><AppIcon name="tasks" /><span v-if="activeTasks" class="badge">{{
                  n(activeTasks)
                }}</span></RouterLink
              >
              <AppButton
                tone="icon"
                :aria-label="themeToggleLabel"
                :title="themeToggleLabel"
                @click="cycleTheme"
                ><AppIcon :name="themeMode === 'system' ? 'dark' : themeMode"
              /></AppButton>
              <!-- Retrying cannot help until the browser signs in again. -->
              <AppButton
                v-if="connectionLabel !== 'errorAuthTitle'"
                tone="icon"
                :aria-label="t('refreshList')"
                :title="t('refreshList')"
                @click="requestRefresh"
                ><AppIcon name="refresh"
              /></AppButton>
            </template>
          </div>
        </header>
        <h1 v-if="!smallBar" class="tb-head">{{ titleText }}</h1>
        <div v-if="mode === 'preview'" class="preview-banner" role="status">
          {{ t('preview') }}
        </div>
        <div v-else-if="development && mode === 'http'" class="preview-banner" role="status">
          {{ t('httpPreview') }}
        </div>
        <main id="main" tabindex="-1"><RouterView /></main>
        <AppFab
          v-if="fab"
          class="fab-compact mobile-only"
          icon="plus"
          :aria-label="t(fab.label)"
          :title="t(fab.label)"
          :aria-haspopup="fab.kind === 'vm' ? 'dialog' : undefined"
          @click="fabAction"
        />
        <AppDialog :open="creationOpen" :title="t('createVm')" @close="creationOpen = false">
          <div class="creation-options">
            <AppButton
              tone="tonal"
              :disabled="!configuration.canCreate.value"
              @click="chooseCreation('/vms/new')"
              ><AppIcon name="wand" />{{ t('createVmCustom') }}</AppButton
            >
            <AppButton
              tone="tonal"
              :disabled="!packageImport.supported.value"
              @click="chooseCreation('/packages/import')"
              ><AppIcon name="import" />{{ t('createVmImport') }}</AppButton
            >
          </div>
        </AppDialog>
        <AgentOperationDialog v-if="agent.open.value" />
      </div>
    </div>
  </SessionGate>
</template>
