<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { Vm } from '../api/gateway'
import { stateLabelKeys } from '../model/inventory'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import VmActionControls from './VmActionControls.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import { useVmActions } from '../model/operations'
const { t, n } = useI18n()
const actions = useVmActions()
defineProps<{ vm: Vm }>()
</script>

<template>
  <article class="vm-card" :data-vm="vm.id">
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
      <RouterLink
        v-if="vm.state === 'RUNNING'"
        class="btn tonal"
        :to="`/vms/${encodeURIComponent(vm.id)}/console`"
        >{{ t('console') }}</RouterLink
      >
      <AppButton
        v-else-if="!vm.lifecycle || !actions.supported.value"
        disabled
        :title="t('vmActionsUnavailable')"
        >{{ vm.state === 'STOPPED' ? t('start') : t(stateLabelKeys[vm.state]) }}</AppButton
      >
      <RouterLink class="btn quiet" :to="`/vms/${encodeURIComponent(vm.id)}`">{{
        t('details')
      }}</RouterLink>
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
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  padding: 21px;
  min-width: 0;
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
  background: var(--tint);
  color: var(--accent);
  border-radius: 14px;
  flex-shrink: 0;
}
.vm-name {
  min-width: 0;
  flex: 1;
  text-decoration: none;
  color: var(--ink);
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: var(--touch-target);
}
.vm-name strong {
  font-size: var(--font-heading);
  overflow-wrap: anywhere;
}
.vm-name small {
  font-size: var(--font-label);
  margin-top: var(--space-1);
  color: var(--muted);
}
.badge {
  font-size: var(--font-label);
  padding: 5px 9px;
  border-radius: var(--radius-lg);
  background: var(--soft);
  color: var(--muted);
  white-space: nowrap;
}
.running {
  background: var(--good-bg);
  color: var(--good);
}
.starting,
.stopping,
.rebooting {
  background: var(--warn-bg);
  color: var(--warn);
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
  color: var(--muted);
  font-size: var(--font-xs);
}
.vm-specs .icon {
  width: 16px;
  height: 16px;
}
.vm-specs dd {
  font-size: var(--font-body);
  margin: 7px 0 0;
}
.vm-note {
  font-size: var(--font-xs);
  color: var(--muted);
  margin-bottom: var(--space-5);
}
footer {
  display: flex;
  gap: 5px;
  align-items: center;
  border-top: 1px solid var(--line);
  padding-top: var(--space-3);
}
.stop-button {
  margin-left: auto;
}
@media (max-width: 650px) {
  .vm-card {
    border-radius: var(--radius-lg);
    padding: 14px;
  }
  header {
    gap: var(--space-2);
  }
  .os-mark {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
  }
  .vm-name strong {
    font-size: var(--font-card);
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
  .badge {
    font-size: var(--font-xs);
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
    font-size: var(--font-sm);
    margin: 0;
    color: var(--muted);
  }
  footer {
    padding-top: 10px;
  }
}
</style>
