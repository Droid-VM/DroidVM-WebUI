<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { selectsCard } from '../../../shared/lib/cardClick'
import type { Vm } from '../api/gateway'
import { stateLabelKeys } from '../model/inventory'
import { formatVmMemory } from '../model/format'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import VmActionControls from './VmActionControls.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import { useVmActions } from '../model/operations'
const { t, n } = useI18n()
const actions = useVmActions()
const props = defineProps<{ vm: Vm }>()
const router = useRouter()
const path = computed(() => `/vms/${encodeURIComponent(props.vm.id)}`)
// State first, then "CPU · memory · backend" on the same supporting line.
const specs = computed(() =>
  [
    props.vm.cpuCount === null ? null : `${n(props.vm.cpuCount)} CPU`,
    props.vm.memoryMiB === null ? null : formatVmMemory(props.vm.memoryMiB, n),
    props.vm.backend || t('backendUnavailable'),
  ]
    .filter(Boolean)
    .join(' · '),
)
const stateClass = computed(() =>
  props.vm.lifecycle?.uncertain ? 'starting' : props.vm.state.toLowerCase(),
)
// The name link stays the keyboard path; the rest of the card is a pointer shortcut.
function select(event: MouseEvent) {
  if (selectsCard(event)) void router.push(path.value)
}
</script>

<template>
  <article class="vm-card card out item" :data-vm="vm.id" @click="select">
    <span class="ic"><AppIcon name="vm" /></span>
    <div class="body">
      <RouterLink :to="path" class="vm-name name" :title="vm.name">{{ vm.name }}</RouterLink>
      <p class="vm-specs sub">
        <span class="badge state" :class="stateClass"
          ><span class="dot" />{{
            t(vm.lifecycle?.uncertain ? 'vmStateUncertain' : stateLabelKeys[vm.state])
          }}</span
        ><span v-if="specs"> · {{ specs }}</span>
      </p>
    </div>
    <AppButton
      v-if="!vm.lifecycle || !actions.supported.value"
      tone="icon"
      disabled
      :aria-label="vm.state === 'RUNNING' ? t('stop') : t('start')"
      :title="t('vmActionsUnavailable')"
      ><AppIcon :name="vm.state === 'RUNNING' ? 'stop' : 'play'"
    /></AppButton>
    <VmActionControls :vm="vm" compact />
  </article>
</template>

<style scoped>
/* List item: icon, name, then state and specs on one line, trailing quick action. */
.vm-card {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 16px;
  min-height: 64px;
  padding: 8px 8px 8px 16px;
  cursor: pointer;
}
.vm-card.selected {
  border-color: transparent;
  background: var(--md-sys-color-secondary-container);
}
.vm-card.selected .sub {
  color: var(--md-sys-color-on-secondary-container);
}
.ic {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--md-sys-color-primary);
}
.ic > .icon {
  width: 32px;
  height: 32px;
}
.body {
  min-width: 0;
}
.name {
  display: block;
  font-size: 16px;
  line-height: 24px;
  color: inherit;
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.state {
  display: inline-flex;
  align-items: center;
  font-weight: 500;
  vertical-align: top;
}
.state .dot {
  margin-right: 6px;
  background: currentColor;
}
.state.running {
  color: var(--app-color-success);
}
.state.suspended {
  color: var(--app-color-warning);
}
.state.starting,
.state.stopping,
.state.rebooting {
  color: var(--md-sys-color-primary);
}
/* The live control is the trailing icon; its status lines span the card below. */
.vm-card > :deep(.vm-actions) {
  display: contents;
}
.vm-card > :deep(.vm-actions) > .buttons {
  grid-column: 3;
  grid-row: 1;
}
.vm-card > :deep(.vm-actions) > p {
  grid-column: 2 / -1;
  margin: 0 0 4px;
  font-size: 12px;
}
</style>
