<script setup lang="ts">
import AppLinkButton from '../../../shared/ui/AppLinkButton.vue'
import { useI18n } from 'vue-i18n'
import type { ProcessEntry } from '../api/http'
import { useHugepageProcesses } from '../model/processes'
import { useHugepageFormatting } from '../../hugepages'
import AppButton from '../../../shared/ui/AppButton.vue'
defineProps<{ row: ProcessEntry }>()
const model = useHugepageProcesses(),
  { t, locale } = useI18n(),
  { pageLabel } = useHugepageFormatting()
const identityLabels = {
  verified: 'hpProcessVerified',
  unverified: 'hpProcessUnverified',
  exited: 'hpProcessExited',
  changed: 'hpProcessChanged',
  unreadable: 'hpProcessUnreadable',
} as const
const bytes = (value: string | null) =>
  value == null
    ? t('notAvailable')
    : t('hpProcessBytes', { value: BigInt(value).toLocaleString(locale.value) })
</script>
<template>
  <article class="process-card" :data-testid="`hugepage-process-${row.pid}`">
    <header>
      <h2>{{ row.name || t('hpProcessUnnamed') }}</h2>
      <span>PID {{ row.pid }}</span>
    </header>
    <p class="usage" :data-testid="`hugepage-process-usage-${row.pid}`">
      {{ row.source === 'ko' ? pageLabel(row.pages) : bytes(row.bytes) }}
    </p>
    <p v-if="row.source === 'ko' && row.bytes !== null" class="muted">{{ bytes(row.bytes) }}</p>
    <dl>
      <div>
        <dt>{{ t('hpProcessState') }}</dt>
        <dd>{{ row.state ?? t('notAvailable') }} · {{ t(identityLabels[row.identityStatus]) }}</dd>
      </div>
      <div>
        <dt>{{ t('hpProcessVm') }}</dt>
        <dd>
          <AppLinkButton v-if="row.vm" :to="`/vms/${encodeURIComponent(row.vm.id)}`">{{
            row.vm.name || row.vm.id
          }}</AppLinkButton
          ><span v-else>{{ t('hpProcessNoVm') }}</span>
        </dd>
      </div>
      <div>
        <dt>{{ t('hpProcessAttribution') }}</dt>
        <dd>
          {{
            t(
              row.source === 'scan'
                ? 'hpProcessScanAttribution'
                : row.attributionVerified
                  ? 'hpProcessKoVerified'
                  : 'hpProcessKoUnverified',
            )
          }}
        </dd>
      </div>
    </dl>
    <p
      v-if="row.source === 'ko' && !row.attributionVerified && row.expected?.source === 'scan'"
      class="muted"
    >
      {{ t('hpProcessControlsCurrentVm') }}
    </p>
    <p v-if="row.reason" class="muted">{{ t('hpProcessRowIncomplete') }}</p>
    <p v-if="row.state === 'D'" class="muted">{{ t('hpProcessDStateHint') }}</p>
    <div class="buttons">
      <AppButton
        :data-testid="`hugepage-process-term-${row.pid}`"
        :disabled="!model.canSignal(row)"
        @click="model.prepare(row, 'term')"
        >{{ t('hpProcessTerm') }}</AppButton
      >
      <AppButton
        :data-testid="`hugepage-process-kill-${row.pid}`"
        :disabled="!model.canSignal(row)"
        @click="model.prepare(row, 'kill')"
        >{{ t('hpProcessKill') }}</AppButton
      >
      <AppButton
        v-if="row.state === 'D'"
        :data-testid="`hugepage-process-stack-${row.pid}`"
        :disabled="!model.canStack(row)"
        @click="model.openStack(row)"
        >{{ t('hpProcessStack') }}</AppButton
      >
    </div>
  </article>
</template>
<style scoped>
.process-card {
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--app-color-card);
}
header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}
h2 {
  font-size: var(--md-sys-typescale-title-medium-size);
  margin: 0;
  overflow-wrap: anywhere;
}
.usage {
  font-size: 1.1rem;
  font-weight: 600;
}
.muted,
dt {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium-size);
}
dl {
  display: grid;
  gap: var(--space-3);
}
dd {
  margin: 4px 0 0;
}
p,
dd {
  overflow-wrap: anywhere;
  line-height: 1.5;
}
dd a {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  max-width: 100%;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.buttons .btn {
  min-height: 48px;
  max-width: 100%;
  white-space: normal;
}
</style>
