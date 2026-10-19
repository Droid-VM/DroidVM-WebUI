<script setup lang="ts">
import { useI18n } from 'vue-i18n'
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
</script>

<template>
  <div class="page-heading desktop-only">
    <h1>{{ t('navResources') }}</h1>
  </div>
  <p class="muted">{{ t('resourcesHint') }}</p>
  <nav class="menu" :aria-label="t('resourceCategories')">
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
    <ResourceRow
      v-if="rules.supported.value"
      to="/resources/usb/rules"
      :title="t('usbRulesTitle')"
      :description="t('usbRulesCategories')"
      icon="usb"
    />
    <UsbDeviceList />
  </template>
  <EmptyState
    v-else-if="route.params.kind"
    :title="
      t('resourceUnavailable', {
        resource: t(
          resources.find((item) => item.kind === route.params.kind)?.name || 'navResources',
        ),
      })
    "
    :description="t('resourcesUnavailableHint')"
    :icon="String(route.params.kind)"
  />
</template>
