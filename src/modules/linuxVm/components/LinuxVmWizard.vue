<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useLinuxVmWizard, validLinuxVmName } from '../model/wizard'
import {
  useResourceCatalog,
  DiskOperationDialog,
  DiskOperationStatus,
  DiskRecovery,
} from '../../resources'
import { AgentOperationDialog, AgentOperationStatus, AgentRecovery } from '../../agent'
import { VmConfiguration } from '../../configuration'
import { useInventory } from '../../vm'
import { useVisiblePolling } from '../../../shared/model/visiblePolling'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog.vue'
const wizard = useLinuxVmWizard(),
  catalog = useResourceCatalog(),
  inventory = useInventory()
const { t } = useI18n(),
  route = useRoute()
const selected = ref(typeof route.query.disk === 'string' ? route.query.disk : '')
const name = ref(t('linuxVmDefaultName')),
  confirmSkip = ref(false)
const steps = [
  'select',
  'clone',
  'convert',
  'flatten',
  'resize',
  'password',
  'grow',
  'configure',
] as const
const stepKeys = {
  select: 'linuxVmStepSelect',
  clone: 'linuxVmStepClone',
  convert: 'linuxVmStepConvert',
  flatten: 'linuxVmStepFlatten',
  resize: 'linuxVmStepResize',
  password: 'linuxVmStepPassword',
  grow: 'linuxVmStepGrow',
  configure: 'linuxVmStepConfigure',
} as const
const hintKeys = {
  select: 'linuxVmSelectHint',
  clone: 'linuxVmCloneHint',
  convert: 'linuxVmConvertHint',
  flatten: 'linuxVmFlattenHint',
  resize: 'linuxVmResizeHint',
  password: 'linuxVmPasswordHint',
  grow: 'linuxVmGrowHint',
  configure: 'linuxVmConfigureHint',
} as const
const stateKeys = {
  pending: 'linuxVmRecordPending',
  succeeded: 'linuxVmRecordSucceeded',
  skipped: 'linuxVmRecordSkipped',
  failed: 'linuxVmRecordFailed',
  unknown: 'linuxVmRecordUnknown',
} as const
const choices = computed(() => catalog.disks.items.value.filter((row) => row.selectable))
const canChoose = computed(
  () =>
    wizard.supported.value &&
    !wizard.pending.value &&
    !wizard.loading.value &&
    validLinuxVmName(name.value) &&
    catalog.disks.status.value === 'ready' &&
    choices.value.some((row) => row.id === selected.value),
)
const diskStep = computed(() =>
  ['clone', 'convert', 'flatten', 'resize'].includes(wizard.step.value),
)
useVisiblePolling(
  () => wizard.step.value === 'select' && catalog.disks.supported.value,
  catalog.disks.refresh,
  ['disks'],
)
function choose() {
  if (canChoose.value) void wizard.choose(selected.value, name.value.trim())
}
function skip() {
  confirmSkip.value = false
  void wizard.skip(true)
}
</script>
<template>
  <div class="linux-wizard">
    <h1>{{ t('linuxVmTitle') }}</h1>
    <p>{{ t('linuxVmIntro') }}</p>
    <AppNotice v-if="!wizard.supported.value" tone="warning" :title="t('linuxVmUnavailable')" />
    <template v-else>
      <ol class="steps" :aria-label="t('linuxVmTitle')">
        <li
          v-for="step in steps"
          :key="step"
          :aria-current="wizard.step.value === step ? 'step' : undefined"
          :class="{ current: wizard.step.value === step }"
        >
          {{ t(stepKeys[step]) }}
        </li>
      </ol>
      <AppNotice v-if="wizard.problem.value" tone="error" :title="t(wizard.problem.value.titleKey)"
        ><p>{{ t(wizard.problem.value.descriptionKey) }}</p></AppNotice
      >
      <p v-if="wizard.loading.value" role="status">{{ t('processing') }}</p>
      <section v-if="wizard.source.value || wizard.target.value" class="disks">
        <article v-if="wizard.source.value">
          <h2>{{ t('linuxVmOriginal') }}</h2>
          <p>{{ wizard.source.value.disk.name }}</p>
          <p>
            <code>{{ wizard.source.value.disk.path }}</code>
          </p>
        </article>
        <article v-if="wizard.target.value">
          <h2>{{ t('linuxVmCopy') }}</h2>
          <p>{{ wizard.target.value.disk.name }}</p>
          <p>
            <code>{{ wizard.target.value.disk.path }}</code>
          </p>
          <RouterLink
            :to="{ path: '/resources/disk', query: { disk: wizard.target.value.disk.id } }"
            >{{ t('diskViewResult') }}</RouterLink
          >
        </article>
        <p>{{ t('linuxVmKeepCopy') }}</p>
      </section>
      <section
        v-if="!wizard.completed.value"
        data-testid="linux-vm-step"
        :data-step="wizard.step.value"
      >
        <h2>{{ t(stepKeys[wizard.step.value]) }}</h2>
        <p>{{ t(hintKeys[wizard.step.value]) }}</p>
        <form v-if="wizard.step.value === 'select'" @submit.prevent="choose">
          <label
            >{{ t('linuxVmName')
            }}<input
              v-model="name"
              data-testid="linux-vm-name"
              required
              maxlength="255"
              :disabled="wizard.pending.value || wizard.loading.value"
              autocomplete="off"
          /></label>
          <small>{{ t('linuxVmNamePathHint') }}</small>
          <label
            >{{ t('linuxVmSource')
            }}<select
              v-model="selected"
              data-testid="linux-vm-source"
              :disabled="
                wizard.pending.value ||
                wizard.loading.value ||
                catalog.disks.status.value !== 'ready'
              "
            >
              <option value="" disabled>{{ t('resourceChoose') }}</option>
              <option v-for="disk in choices" :key="disk.id" :value="disk.id">
                {{ disk.name || disk.id }} · {{ disk.path }}
              </option>
            </select></label
          >
          <AppNotice
            v-if="catalog.disks.problem.value"
            tone="error"
            :title="t(catalog.disks.problem.value.titleKey)"
            ><p>{{ t(catalog.disks.problem.value.descriptionKey) }}</p></AppNotice
          >
          <p v-if="catalog.disks.status.value === 'ready' && !choices.length">
            {{ t('resourceNoneSelectable') }}
          </p>
          <div class="buttons">
            <AppButton
              type="submit"
              tone="primary"
              data-testid="linux-vm-choose"
              :disabled="!canChoose"
              >{{ t('linuxVmChoose') }}</AppButton
            ><AppButton :disabled="wizard.loading.value" @click="catalog.disks.refresh">{{
              t('refreshList')
            }}</AppButton
            ><RouterLink to="/resources/disk/import">{{ t('imageImportTitle') }}</RouterLink>
          </div>
        </form>
        <template v-else-if="wizard.step.value !== 'configure'">
          <AppNotice v-if="wizard.blocked.value" tone="warning" :title="t('linuxVmBlocked')"
            ><p>{{ t('linuxVmBlockedHint') }}</p></AppNotice
          >
          <div class="buttons">
            <AppButton
              data-testid="linux-vm-prepare"
              :disabled="!wizard.canPrepare.value"
              @click="wizard.prepare"
              >{{ t('linuxVmPrepare') }}</AppButton
            >
            <AppButton
              data-testid="linux-vm-next"
              tone="primary"
              :disabled="!wizard.canContinue.value"
              @click="wizard.next"
              >{{ t('linuxVmNext') }}</AppButton
            >
            <AppButton
              v-if="['resize', 'password', 'grow'].includes(wizard.step.value)"
              data-testid="linux-vm-skip"
              :disabled="!wizard.canSkip.value"
              @click="confirmSkip = true"
              >{{ t('linuxVmSkip') }}</AppButton
            >
          </div>
          <DiskOperationStatus v-if="diskStep" :show-result="false" :show-retry="false" />
          <AgentOperationStatus v-else />
          <DiskRecovery
            v-if="
              diskStep &&
              wizard.diskActions.entries.value.disk?.task?.errorCode === 'COMMIT_UNCERTAIN'
            "
          />
          <AgentRecovery
            v-if="
              !diskStep &&
              (wizard.agent.entry.value?.task?.agentResult?.recoveryRequired ||
                (wizard.agent.pendingRecords.value ?? 0) > 0)
            "
          />
        </template>
        <template v-else>
          <AppButton
            v-if="['idle', 'blocked', 'error'].includes(wizard.editor.state.value)"
            data-testid="linux-vm-prepare"
            tone="primary"
            :disabled="!wizard.canPrepare.value"
            @click="wizard.prepare"
            >{{ t('linuxVmOpenConfiguration') }}</AppButton
          >
          <VmConfiguration
            v-if="wizard.editor.state.value !== 'idle'"
            :editable="inventory.status.value === 'ready' && !wizard.loading.value"
          />
        </template>
      </section>
      <section v-else data-testid="linux-vm-created" aria-live="polite">
        <h2>{{ t('linuxVmCreated') }}</h2>
        <p>{{ t('linuxVmCreatedHint') }}</p>
        <RouterLink :to="`/vms/${encodeURIComponent(wizard.vmId.value ?? '')}`">{{
          t('linuxVmOpenCreated')
        }}</RouterLink>
        <AppButton
          data-testid="linux-vm-restart"
          @click="wizard.completed.value && wizard.reset()"
          >{{ t('linuxVmRestart') }}</AppButton
        >
      </section>
      <section v-if="wizard.records.value.length" data-testid="linux-vm-records" aria-live="polite">
        <h2>{{ t('linuxVmRecords') }}</h2>
        <p>{{ t('linuxVmResultHint') }}</p>
        <ol class="records">
          <li
            v-for="(record, index) in wizard.records.value"
            :key="`${record.step}:${record.requestId ?? index}`"
          >
            <strong>{{ t(stepKeys[record.step]) }}</strong
            ><span>{{
              t(record.reason === 'not-needed' ? 'linuxVmRecordNotNeeded' : stateKeys[record.state])
            }}</span
            ><code v-if="record.task?.errorCode">{{ record.task.errorCode }}</code>
          </li>
        </ol>
      </section>
      <div v-if="wizard.hasWork.value" class="buttons">
        <AppButton
          data-testid="linux-vm-reconcile"
          :disabled="wizard.loading.value"
          @click="wizard.reconcile"
          >{{ t('queryStatus') }}</AppButton
        ><RouterLink to="/tasks">{{ t('diskTaskLink') }}</RouterLink>
      </div>
    </template>
    <DiskOperationDialog
      v-if="wizard.diskActions.open.value"
      linux-preparation
      :clone-directory-name="wizard.name.value"
    />
    <AgentOperationDialog v-if="wizard.agent.open.value" root-only :allow-rescue="false" />
    <ConfirmDialog
      :open="confirmSkip"
      :title="t('linuxVmSkipTitle')"
      :description="t('linuxVmSkipHint')"
      :confirm-label="t('linuxVmSkip')"
      @cancel="confirmSkip = false"
      @confirm="skip"
    />
  </div>
</template>
<style scoped>
.linux-wizard,
section,
article,
form,
label {
  display: grid;
  min-width: 0;
  gap: var(--space-3);
  overflow-wrap: anywhere;
}
h1,
h2,
p {
  margin: 0;
}
h2 {
  font-size: var(--font-heading);
}
section {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  background: var(--surface);
}
input,
select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font: inherit;
  color: var(--ink);
  background: var(--surface);
}
.steps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}
.steps li {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  border: 1px solid var(--line);
}
.steps .current {
  color: var(--ink);
  border-color: var(--accent);
  font-weight: 600;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}
.records {
  display: grid;
  gap: var(--space-3);
  padding-inline-start: 20px;
  margin: 0;
}
.records li > * {
  display: block;
  margin-top: var(--space-1);
}
a {
  padding-block: 10px;
}
@media (max-width: 480px) {
  section {
    padding: var(--space-3);
  }
  .buttons > * {
    width: 100%;
  }
  .steps li {
    flex: 1 1 40%;
  }
}
</style>
