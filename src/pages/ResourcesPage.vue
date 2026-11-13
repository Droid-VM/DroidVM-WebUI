<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ResourceRow from '../shared/ui/ResourceRow.vue'
import EmptyState from '../shared/ui/EmptyState.vue'
import { ResourceList, UsbDeviceList } from '../modules/resources'
import { useUsbRulesEditor } from '../modules/usbRules'
const rules = useUsbRulesEditor()
const { t } = useI18n()
const route = useRoute()
const resources = [
  { kind: 'network', name: 'navNetwork' },
  { kind: 'disk', name: 'navDisk' },
  { kind: 'usb', name: 'usbDevices' },
]
const current = computed(() => resources.find((item) => item.kind === route.params.kind))
</script>

<template>
  <div class="page-heading desktop-only">
    <h1>{{ t(current?.name || 'navResources') }}</h1>
  </div>
  <nav class="menu" :class="{ chosen: current }" :aria-label="t('resourceCategories')">
    <ResourceRow
      v-for="resource in resources"
      :key="resource.kind"
      :to="`/resources/${resource.kind}`"
      :title="t(resource.name)"
      :icon="resource.kind"
      :current="route.params.kind === resource.kind"
    />
  </nav>
  <ResourceList
    v-if="route.params.kind === 'disk' || route.params.kind === 'network'"
    :key="route.params.kind"
    :kind="route.params.kind"
  />
  <template v-else-if="route.params.kind === 'usb'">
    <div v-if="rules.supported.value" class="menu">
      <ResourceRow to="/resources/usb/rules" :title="t('usbRulesTitle')" icon="usb" />
    </div>
    <UsbDeviceList />
  </template>
  <EmptyState
    v-else-if="route.params.kind"
    :title="
      t('resourceUnavailable', {
        resource: t(current?.name || 'navResources'),
      })
    "
    :icon="String(route.params.kind)"
  />
</template>
<style scoped>
/* Disk and network are top-level destinations and USB lives in settings, so the
   category menu only shows on the bare /resources index. */
.menu.chosen {
  display: none;
}
</style>
