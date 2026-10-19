<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Hugepages } from '../model/hugepages'
import { useHugepageFormatting } from './format'
defineProps<{ model: Hugepages }>()
const { t, n } = useI18n(),
  { pageLabel, flag } = useHugepageFormatting()
const stats = [
  ['poolTotalPages', 'hugepagesBuilt'],
  ['poolAvailablePages', 'hugepagesFree'],
  ['servedPages', 'hugepagesServed'],
  ['cmaPoolPages', 'hugepagesReservoir'],
  ['consumerPages', 'hugepagesFloor'],
  ['manualPoolPages', 'hugepagesManualPool'],
] as const
</script>
<template>
  <section
    v-if="model.status.value"
    id="hugepages-overview"
    class="panel"
    data-testid="hugepages-group-overview"
    aria-labelledby="hugepages-overview-heading"
  >
    <h2 id="hugepages-overview-heading">{{ t('hugepagesGroupOverview') }}</h2>
    <dl class="facts">
      <div>
        <dt>{{ t('hugepagesInstalled') }}</dt>
        <dd>{{ flag(model.status.value.installed) }}</dd>
      </div>
      <div>
        <dt>{{ t('hugepagesLoaded') }}</dt>
        <dd>{{ flag(model.status.value.loaded) }}</dd>
      </div>
      <div>
        <dt>{{ t('hugepagesConsumers') }}</dt>
        <dd>
          {{
            model.status.value.consumerCount === null
              ? t('notAvailable')
              : n(model.status.value.consumerCount)
          }}
        </dd>
      </div>
      <div v-for="[key, label] in stats" :key="key">
        <dt>{{ t(label) }}</dt>
        <dd :data-testid="`hugepages-${key}`">{{ pageLabel(model.status.value[key]) }}</dd>
      </div>
    </dl>
    <p v-if="model.status.value.busy" role="status">{{ t('hugepagesBusy') }}</p>
    <p data-testid="hugepages-active" role="status">
      {{ t('hugepagesAcquireActive') }}: {{ flag(model.status.value.acquireActive)
      }}<span v-if="model.status.value.acquireActive && model.status.value.acquireMode">
        · {{ t('hugepagesMode', { mode: model.status.value.acquireMode }) }}</span
      >
    </p>
  </section>
</template>
