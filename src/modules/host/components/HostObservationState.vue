<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHostOverview } from '../model/overview'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
const host = useHostOverview(),
  { t, locale } = useI18n()
const observed = computed(() =>
  host.data.value
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'medium' }).format(
        new Date(Number(BigInt(host.data.value.observedAtMs))),
      )
    : '—',
)
</script>
<template>
  <div class="host-observation">
    <div class="observation-row">
      <p data-testid="host-status" role="status">
        {{
          t(
            !host.supported.value
              ? 'hostUnsupported'
              : host.stale.value
                ? 'hostStale'
                : host.data.value
                  ? 'hostObserved'
                  : host.loading.value
                    ? 'loading'
                    : 'hostNoObservation',
          )
        }}
      </p>
      <AppButton
        data-testid="host-refresh"
        :disabled="!host.supported.value || host.loading.value"
        @click="host.refresh"
        >{{ t('refreshList') }}</AppButton
      >
    </div>
    <p v-if="host.data.value" data-testid="host-sampled-at" class="muted">
      {{ t('hostSampledAt', { time: observed }) }}
    </p>
    <p v-if="host.stale.value" data-testid="host-stale" class="muted">{{ t('hostStaleHint') }}</p>
    <AppNotice v-if="host.problem.value" tone="warning" :title="t(host.problem.value.titleKey)"
      ><p>{{ t(host.problem.value.descriptionKey) }}</p></AppNotice
    >
  </div>
</template>
<style scoped>
.host-observation {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.observation-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
p {
  margin: 0;
  font-size: var(--md-sys-typescale-body-medium-size);
  overflow-wrap: anywhere;
}
</style>
