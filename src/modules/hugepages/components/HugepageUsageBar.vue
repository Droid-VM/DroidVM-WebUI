<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HugepageObservation } from '../api/http'
import { ownerHue } from './format'

// The App's pool bar: one block per VM holding pages, then the available pool, the CMA
// reservoir and the not-yet-acquired remainder, over a 2x2 caption. `owners` comes from
// the usage list; without it the served pages are one block.
export interface HugepageOwner {
  key: string
  label: string
  pages: number
}
type Pool = Pick<
  HugepageObservation,
  | 'hasCma'
  | 'actualPoolPages'
  | 'actualCmaPages'
  | 'poolTotalPages'
  | 'poolAvailablePages'
  | 'servedPages'
  | 'cmaPoolPages'
  | 'cmaLentPages'
>
const props = defineProps<{ status: Pool; owners: HugepageOwner[] | null }>()
const { t, n } = useI18n()
const count = (value: string | null | undefined) => (value == null ? 0 : Number(value))
const size = (pages: number) => {
  const mib = pages * 2
  return mib >= 1024
    ? `${n(mib / 1024, { maximumFractionDigits: 2 })} GiB`
    : `${n(mib, { maximumFractionDigits: 0 })} MiB`
}
const amount = (pages: number) => `${n(pages)} (${size(pages)})`
const cmaOn = computed(() => props.status.hasCma === true && count(props.status.actualCmaPages) > 0)
const used = computed(() =>
  props.owners
    ? props.owners.reduce((sum, owner) => sum + owner.pages, 0)
    : count(props.status.servedPages),
)
const available = computed(() => count(props.status.poolAvailablePages))
const pool = computed(() =>
  count(props.status.actualPoolPages ?? props.status.poolTotalPages ?? null),
)
const want = computed(() => (cmaOn.value ? count(props.status.actualCmaPages) : pool.value))
const cma = computed(() => (cmaOn.value ? count(props.status.cmaPoolPages) : 0))
// The reservoir splits into pages other apps hold now and pages still free; an
// unreported split stays one undivided CMA block.
const lent = computed(() => Math.min(cma.value, count(props.status.cmaLentPages)))
const deficit = computed(() => Math.max(0, want.value - used.value - available.value - cma.value))
// Golden-angle hues over the owners' order keep neighbouring VMs apart.
const segments = computed(() => {
  const owners = props.owners
    ? props.owners
        .filter((owner) => owner.pages > 0)
        .map((owner, index) => ({
          key: owner.key,
          label: owner.label,
          pages: owner.pages,
          kind: 'owner',
          hue: ownerHue(index),
        }))
    : used.value > 0
      ? [{ key: 'used', label: t('hugepagesSegUsed'), pages: used.value, kind: 'owner', hue: 220 }]
      : []
  return [
    ...owners,
    {
      key: 'available',
      label: t('hugepagesSegAvailable'),
      pages: available.value,
      kind: 'available',
    },
    { key: 'cma', label: t('hugepagesSegCma'), pages: cma.value - lent.value, kind: 'cma' },
    { key: 'lent', label: t('hugepagesSegCmaLent'), pages: lent.value, kind: 'lent' },
    { key: 'deficit', label: t('hugepagesSegDeficit'), pages: deficit.value, kind: 'deficit' },
  ].filter((segment) => segment.pages > 0)
})
const poolLabel = computed(() =>
  cmaOn.value
    ? `${n(pool.value)}/${n(want.value)} (${size(pool.value)} / ${size(want.value)})`
    : amount(pool.value),
)
</script>

<template>
  <section class="usage" data-testid="hugepages-usage" :aria-label="t('hugepagesShowUsage')">
    <div
      class="bar-track"
      role="img"
      :aria-label="segments.map((s) => `${s.label} ${size(s.pages)}`).join(', ')"
    >
      <span
        v-for="segment in segments"
        :key="segment.key"
        class="segment"
        :class="segment.kind"
        :style="{ flexGrow: segment.pages, ...('hue' in segment ? { '--hue': segment.hue } : {}) }"
        :title="`${segment.label} · ${size(segment.pages)}`"
        ><span class="segment-label">{{ segment.label }}<br />{{ size(segment.pages) }}</span></span
      >
    </div>
    <div class="caption">
      <span data-testid="hugepages-used">{{ t('hugepagesBarUsed', { value: amount(used) }) }}</span>
      <span data-testid="hugepages-available">{{
        t('hugepagesBarAvailable', { value: amount(available) })
      }}</span>
      <span>{{ t('hugepagesBarTotal', { value: amount(used + available) }) }}</span>
      <span>{{ t('hugepagesBarPool', { value: poolLabel }) }}</span>
    </div>
  </section>
</template>

<style scoped>
.usage {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.bar-track {
  display: flex;
  height: 44px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--md-sys-color-surface-container-highest);
}
.segment {
  display: flex;
  align-items: center;
  flex-basis: 0;
  min-width: 2px;
  overflow: hidden;
  border-inline-end: 1px solid var(--md-sys-color-surface);
}
.segment:last-child {
  border-inline-end: 0;
}
.segment-label {
  padding: 0 8px;
  overflow: hidden;
  font-size: 11px;
  font-weight: 500;
  line-height: 14px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.segment.owner {
  background: hsl(var(--hue) 62% 42%);
  color: #fff;
}
:root[data-color='dark'] .segment.owner {
  background: hsl(var(--hue) 55% 72%);
  color: #1b1b1f;
}
.segment.available {
  background: var(--md-sys-color-surface-container-highest);
  color: var(--md-sys-color-on-surface-variant);
}
.segment.cma {
  background: var(--md-sys-color-tertiary-container);
  color: var(--md-sys-color-on-tertiary-container);
}
.segment.lent {
  background: var(--md-sys-color-tertiary);
  color: var(--md-sys-color-on-tertiary);
}
.segment.deficit {
  background: repeating-linear-gradient(
    -45deg,
    var(--md-sys-color-surface-container-high) 0 6px,
    var(--md-sys-color-surface-container-highest) 6px 12px
  );
  color: var(--md-sys-color-on-surface-variant);
}
.caption {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 16px;
  padding: 0 4px;
  font-size: 12px;
  line-height: 16px;
  color: var(--md-sys-color-on-surface-variant);
  font-variant-numeric: tabular-nums;
}
.caption > :nth-child(even) {
  text-align: end;
}
</style>
