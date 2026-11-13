<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResourceCatalog } from '../../resources'
import { hostCapabilityHints } from '../model/hostCapabilities'
import type { ConfigObject } from '../model/document'
import type { MessageKey } from '../../../shared/i18n'
import { useVisiblePolling } from '../../../shared/model/visiblePolling'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'

const props = defineProps<{
  document: ConfigObject
  section: 'basic' | 'graphics'
  active: boolean
}>()
const { t, locale } = useI18n()
const source = useResourceCatalog().host
useVisiblePolling(
  () => props.active && source.supported.value,
  () => source.refresh(),
)
const rows = computed(() =>
  props.section === 'basic'
    ? ([
        ['kvm', 'KVM'],
        ['gunyah', 'Gunyah'],
        ['geniezone', 'GenieZone'],
      ] as const)
    : ([
        ['turnip', 'Turnip'],
        ['systemVulkan', 'Vulkan HAL'],
        ['kgsl', 'KGSL'],
      ] as const),
)
const hints = computed(() =>
  source.data.value ? hostCapabilityHints(props.document, source.data.value, props.section) : [],
)
const blitMessage = computed<MessageKey>(() => {
  const blit = source.data.value?.systemBlit
  if (!blit || blit.state === 'unknown') return 'hostBlitUnknown'
  if (blit.state === 'pending') return 'hostBlitPending'
  return blit.missingExtensions?.length ? 'hostBlitMissing' : 'hostBlitExtensionsPresent'
})
</script>

<template>
  <section
    v-if="source.supported.value"
    class="host-capabilities"
    :aria-label="t('hostCapabilities')"
  >
    <AppNotice v-for="hint in hints" :key="hint" tone="warning" :title="t(hint)" />
    <details>
      <summary>{{ t('hostCapabilities') }}</summary>
      <AppNotice v-if="source.problem.value" tone="error" :title="t(source.problem.value.titleKey)">
        <p>{{ t(source.problem.value.descriptionKey) }}</p>
      </AppNotice>
      <AppButton @click="source.refresh">{{ t('refreshList') }}</AppButton>
      <p v-if="!source.data.value">{{ t('hostObservationUnavailable') }}</p>
      <template v-else>
        <dl>
          <template v-for="[key, label] in rows" :key="key"
            ><dt>{{ label }}</dt>
            <dd>
              {{
                t(
                  source.data.value.devices[key] === true
                    ? 'hostDetected'
                    : source.data.value.devices[key] === false
                      ? 'hostNotDetected'
                      : 'hostDetectionUnknown',
                )
              }}
            </dd></template
          >
        </dl>
        <template v-if="section === 'graphics'">
          <h4>{{ t('hostSystemBlit') }}</h4>
          <p>{{ t(blitMessage) }}</p>
          <ul
            v-if="
              source.data.value.systemBlit.state === 'known' &&
              source.data.value.systemBlit.missingExtensions?.length
            "
          >
            <li
              v-for="extension in source.data.value.systemBlit.missingExtensions"
              :key="extension"
            >
              <code>{{ extension }}</code>
            </li>
          </ul>
          <p v-if="source.data.value.systemBlit.checkedAtMs !== null" class="muted">
            {{
              t('hostBlitChecked', {
                time: new Date(source.data.value.systemBlit.checkedAtMs).toLocaleString(locale),
              })
            }}
          </p>
        </template>
      </template>
    </details>
  </section>
</template>

<style scoped>
.host-capabilities {
  display: grid;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  min-width: 0;
}
details {
  padding: var(--space-3);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
}
summary {
  cursor: pointer;
}
dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-2);
}
dd {
  margin: 0;
}
p,
dd,
dt,
code {
  overflow-wrap: anywhere;
}
ul {
  padding-inline-start: var(--space-4);
}
</style>
