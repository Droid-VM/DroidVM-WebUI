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
  { kind: 'network', name: 'navNetwork', hint: 'networkHint' },
  { kind: 'disk', name: 'navDisk', hint: 'diskHint' },
  { kind: 'usb', name: 'usbDevices', hint: 'usbHint' },
]
const current = computed(() => resources.find((item) => item.kind === route.params.kind))
</script>

<template>
  <div class="page-heading desktop-only">
    <h1>{{ t(current?.name || 'navResources') }}</h1>
  </div>
  <p class="muted">{{ t(current?.hint || 'resourcesHint') }}</p>
  <nav class="menu" :class="{ chosen: current }" :aria-label="t('resourceCategories')">
    <ResourceRow
      v-for="resource in resources"
      :key="resource.kind"
      :to="`/resources/${resource.kind}`"
      :title="t(resource.name)"
      :description="t(resource.hint)"
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
      <ResourceRow
        to="/resources/usb/rules"
        :title="t('usbRulesTitle')"
        :description="t('usbRulesCategories')"
        icon="usb"
      />
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
    :description="t('resourcesUnavailableHint')"
    :icon="String(route.params.kind)"
  />
</template>
<style scoped>
/* The navigation rail already lists each category on wider screens. */
@media (width >= 600px) {
  .menu.chosen {
    display: none;
  }
}
</style>
