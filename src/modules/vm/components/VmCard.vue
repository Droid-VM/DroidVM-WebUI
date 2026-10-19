<script setup lang="ts">
import AppLinkButton from '../../../shared/ui/AppLinkButton.vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { selectsCard } from '../../../shared/lib/cardClick'
import type { Vm } from '../api/gateway'
import { stateLabelKeys } from '../model/inventory'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import VmActionControls from './VmActionControls.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import { useVmActions } from '../model/operations'
const { t, n } = useI18n()
const actions = useVmActions()
const props = defineProps<{ vm: Vm }>()
const router = useRouter()
// The name link stays the keyboard path; the rest of the card is a pointer shortcut.
function select(event: MouseEvent) {
  if (selectsCard(event)) void router.push(`/vms/${encodeURIComponent(props.vm.id)}`)
}
</script>

<template>
  <article class="vm-card card" :data-vm="vm.id" @click="select">
    <header>
      <span class="os-mark"><AppIcon name="vm" /></span>
      <RouterLink :to="`/vms/${encodeURIComponent(vm.id)}`" class="vm-name"
        ><strong>{{ vm.name }}</strong
        ><small>{{ vm.backend || t('backendUnavailable') }}</small></RouterLink
      >
      <span class="badge" :class="vm.lifecycle?.uncertain ? 'starting' : vm.state.toLowerCase()">{{
        t(vm.lifecycle?.uncertain ? 'vmStateUncertain' : stateLabelKeys[vm.state])
      }}</span>
    </header>
    <dl class="vm-specs">
      <div>
        <dt>
          <AppIcon name="cpu" /><span class="desktop-only">{{ t('processor') }}</span>
        </dt>
        <dd>{{ vm.cpuCount === null ? t('notAvailable') : `${n(vm.cpuCount)} vCPU` }}</dd>
      </div>
      <div>
        <dt>
          <AppIcon name="memory" /><span class="desktop-only">{{ t('memory') }}</span>
        </dt>
        <dd>
          {{
            vm.memoryMiB === null
              ? t('notAvailable')
              : `${n(vm.memoryMiB / 1024, { maximumFractionDigits: 6 })} GiB`
          }}
        </dd>
      </div>
    </dl>
    <p class="vm-note desktop-only">{{ t('loadUnavailable') }}</p>
    <VmActionControls :vm="vm" />
    <footer>
      <AppLinkButton
        v-if="vm.state === 'RUNNING'"
        tone="tonal"
        :to="`/vms/${encodeURIComponent(vm.id)}/console`"
        >{{ t('console') }}</AppLinkButton
      >
      <AppButton
        v-else-if="!vm.lifecycle || !actions.supported.value"
        disabled
        :title="t('vmActionsUnavailable')"
        >{{ vm.state === 'STOPPED' ? t('start') : t(stateLabelKeys[vm.state]) }}</AppButton
      >
      <AppButton
        v-if="vm.state === 'RUNNING' && (!vm.lifecycle || !actions.supported.value)"
        disabled
        :title="t('vmActionsUnavailable')"
        class="stop-button"
        >{{ t('stop') }}</AppButton
      >
    </footer>
  </article>
</template>

<style scoped>
.vm-card {
  cursor: pointer;
}
.vm-card:hover {
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 4%, var(--app-color-card));
}
.vm-card.selected {
  border-color: var(--md-sys-color-primary);
  box-shadow: inset 0 0 0 1px var(--md-sys-color-primary);
}
header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.os-mark {
  width: 43px;
  height: 43px;
  display: grid;
  place-items: center;
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-primary);
  border-radius: 14px;
  flex-shrink: 0;
}
.vm-name {
  min-width: 0;
  flex: 1;
  text-decoration: none;
  color: var(--md-sys-color-on-surface);
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: var(--touch-target);
}
.vm-name strong {
  font-size: var(--md-sys-typescale-title-medium-size);
  overflow-wrap: anywhere;
}
.vm-name small {
  font-size: var(--md-sys-typescale-label-small-size);
  margin-top: var(--space-1);
  color: var(--md-sys-color-on-surface-variant);
}
.badge {
  font-size: var(--md-sys-typescale-label-small-size);
  padding: 5px 9px;
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--app-color-raised);
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
}
.running {
  background: var(--app-color-success-container);
  color: var(--app-color-success);
}
.starting,
.stopping,
.rebooting {
  background: var(--app-color-warning-container);
  color: var(--app-color-warning);
}
.vm-specs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin: 23px 0 var(--space-5);
}
.vm-specs dt {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small-size);
}
.vm-specs .icon {
  width: 16px;
  height: 16px;
}
.vm-specs dd {
  font-size: var(--md-sys-typescale-body-medium-size);
  margin: 7px 0 0;
}
.vm-note {
  font-size: var(--md-sys-typescale-body-small-size);
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: var(--space-5);
}
footer {
  display: flex;
  gap: 5px;
  align-items: center;
  border-top: 1px solid var(--md-sys-color-outline-variant);
  padding-top: var(--space-3);
}
.stop-button {
  margin-left: auto;
}
@media (width < 600px) {
  .vm-card {
    padding: var(--space-3);
  }
  header {
    gap: var(--space-2);
  }
  .os-mark {
    width: 34px;
    height: 34px;
    border-radius: var(--md-sys-shape-corner-medium);
  }
  .vm-name strong {
    font-size: var(--md-sys-typescale-title-medium-size);
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
  .badge {
    font-size: var(--md-sys-typescale-body-small-size);
    padding: var(--space-1) var(--space-2);
  }
  .vm-specs {
    display: flex;
    gap: 18px;
    margin: var(--space-3) 0;
  }
  .vm-specs > div {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .vm-specs dd {
    font-size: var(--md-sys-typescale-body-medium-size);
    margin: 0;
    color: var(--md-sys-color-on-surface-variant);
  }
  footer {
    padding-top: 10px;
  }
}
</style>
