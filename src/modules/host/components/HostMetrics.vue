<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHostOverview } from '../model/overview'
import { formatHostBytes, usedBytes, usedPercent } from '../lib/format'
import AppProgress from '../../../shared/ui/AppProgress.vue'
const host = useHostOverview(),
  { t, n, locale } = useI18n()
const memory = computed(() => host.data.value?.memory),
  storage = computed(() => host.data.value?.storage)
const memoryPercent = computed(() =>
  usedPercent(memory.value?.totalBytes, memory.value?.availableBytes),
)
const storagePercent = computed(() =>
  usedPercent(storage.value?.totalBytes, storage.value?.freeBytes),
)
const bytes = (value: string | null | undefined) => formatHostBytes(value, locale.value)
</script>
<template>
  <div class="host-metrics">
    <article data-testid="host-cpu">
      <h3>{{ t('cpu') }}</h3>
      <strong>{{
        host.data.value?.cpu.usagePercent == null
          ? '—'
          : n(host.data.value.cpu.usagePercent / 100, {
              style: 'percent',
              maximumFractionDigits: 1,
            })
      }}</strong>
      <AppProgress
        v-if="host.data.value?.cpu.usagePercent != null"
        :label="t('hostCpuUsage')"
        :value="host.data.value.cpu.usagePercent"
      />
      <p v-else class="muted">{{ t(host.loading.value ? 'loading' : 'hostCpuUnknown') }}</p>
      <small>{{
        t('hostCpuCores', {
          count:
            host.data.value?.cpu.logicalCount == null ? '—' : n(host.data.value.cpu.logicalCount),
        })
      }}</small>
      <small v-if="host.data.value?.cpu.sampleWindowMs != null">{{
        t('hostCpuWindow', {
          seconds: n(host.data.value.cpu.sampleWindowMs / 1000, { maximumFractionDigits: 1 }),
        })
      }}</small>
    </article>
    <article data-testid="host-memory">
      <h3>{{ t('memory') }}</h3>
      <strong>{{ bytes(memory?.availableBytes) }}</strong>
      <p>{{ t('hostAvailableOf', { total: bytes(memory?.totalBytes) }) }}</p>
      <AppProgress
        v-if="memoryPercent !== null"
        :label="t('hostMemoryOccupied')"
        :value="memoryPercent"
      />
      <small>{{ t('hostMemoryHint') }}</small>
    </article>
    <article data-testid="host-storage">
      <h3>{{ t('hostStorageTitle') }}</h3>
      <strong>{{ bytes(storage?.availableBytes) }}</strong>
      <p>{{ t('hostAvailableOf', { total: bytes(storage?.totalBytes) }) }}</p>
      <AppProgress
        v-if="storagePercent !== null"
        :label="t('hostStorageUsed')"
        :value="storagePercent"
      />
      <small>{{
        t('hostUsedBytes', { value: bytes(usedBytes(storage?.totalBytes, storage?.freeBytes)) })
      }}</small>
      <small>{{ t('hostStorageHint') }}</small>
    </article>
  </div>
</template>
<style scoped>
.host-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}
article {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-radius: var(--md-sys-shape-corner-large);
  padding: var(--space-4);
  background: var(--app-color-card);
  overflow-wrap: anywhere;
}
h3,
p {
  margin: 0;
}
h3 {
  font-size: var(--md-sys-typescale-body-medium-size);
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant);
}
strong {
  font-size: var(--md-sys-typescale-title-medium-size);
}
p,
small {
  font-size: var(--md-sys-typescale-body-medium-size);
}
small {
  color: var(--md-sys-color-on-surface-variant);
}
@media (width < 600px) {
  .host-metrics {
    grid-template-columns: 1fr;
  }
  article {
    padding: var(--space-3);
  }
}
</style>
