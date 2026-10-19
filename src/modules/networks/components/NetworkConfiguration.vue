<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { taskStateKeys } from '../../tasks'
import { useNetworkEditor } from '../model/editor'
import { basicFields, l2Fields, vlanFields, vlans } from '../model/document'
import { object, encodeDocument } from '../../../shared/model/configurationDocument'
import NetworkField from './NetworkField.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog.vue'
const editor = useNetworkEditor(),
  { t } = useI18n()
const confirmation = ref<'save' | 'reload' | null>(null),
  inactive = ref(false)
const row = computed(() => editor.draft.value),
  items = computed(() => (row.value ? vlans(row.value) : []))
const problems = computed(() =>
  [editor.problem.value, editor.entry.value?.problem].filter((value) => !!value),
)
function confirm() {
  const action = confirmation.value
  confirmation.value = null
  if (action === 'save') void editor.save()
  else void editor.reload()
}
async function firstIssue() {
  inactive.value = true
  await nextTick()
  document.getElementById(`network-${editor.issues.value[0]?.path}`)?.focus()
}
function download() {
  const url = URL.createObjectURL(new Blob([editor.exportJson()], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `droidvm-network-${row.value?.id}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>
<template>
  <div class="network-editor" :aria-busy="editor.busy.value">
    <OperationTrackingNotice
      :problem="editor.recoveryProblem.value"
      @clear="editor.clearTracking"
    />
    <p class="muted">{{ t('networkEditHint') }}</p>
    <div class="toolbar">
      <AppButton :disabled="editor.busy.value" @click="confirmation = 'reload'">{{
        t('configReload')
      }}</AppButton>
      <AppButton v-if="row" @click="download">{{ t('configExport') }}</AppButton>
    </div>
    <AppNotice
      v-for="problem in problems"
      :key="problem.code"
      tone="error"
      :title="t(problem.titleKey)"
      ><p>{{ t(problem.descriptionKey) }}</p></AppNotice
    >
    <AppNotice v-if="editor.blocked.value" tone="warning" :title="t('configBlocked')"
      ><p>{{ t('networkBlockedHint') }}</p></AppNotice
    >
    <p v-if="editor.loading.value || editor.staging.value" role="status">{{ t('processing') }}</p>
    <section v-if="editor.entry.value" class="network-card" aria-live="polite">
      <p v-if="editor.entry.value.restored">{{ t('configurationRestoredReceipt') }}</p>
      <p v-if="editor.entry.value.state === 'unknown'">{{ t('configUnknown') }}</p>
      <p v-if="editor.entry.value.state === 'unknown'">{{ t('configurationMissingReceipt') }}</p>
      <p v-if="editor.entry.value.task">
        {{ t(taskStateKeys[editor.entry.value.task.state]) }}
        <span v-if="editor.entry.value.task.errorCode"
          >· {{ editor.entry.value.task.errorCode }}</span
        >
      </p>
      <p v-if="editor.pending.value">{{ t('networkPendingHint') }}</p>
      <p v-if="editor.saved.value">{{ t('networkSaved') }}</p>
      <AppButton
        v-if="editor.pending.value"
        :disabled="editor.checking.value || editor.staging.value"
        @click="editor.reconcile"
        >{{ t('queryStatus') }}</AppButton
      >
    </section>
    <form
      v-if="row"
      @submit.prevent="editor.canSave.value ? (confirmation = 'save') : firstIssue()"
    >
      <section class="network-card">
        <h2>{{ t('configBasic') }}</h2>
        <p class="muted">{{ row.id }}</p>
        <div class="fields">
          <NetworkField v-for="field in basicFields" :key="field.key" :field="field" />
        </div>
      </section>
      <section v-if="row.uplink_mode === 'l2'" class="network-card">
        <h2>{{ t('networkL2') }}</h2>
        <p class="muted">{{ t('networkUplinkHint') }}</p>
        <div class="fields">
          <NetworkField v-for="field in l2Fields" :key="field.key" :field="field" />
        </div>
      </section>
      <template v-else>
        <section class="network-card">
          <h2>{{ t('networkL3') }}</h2>
          <NetworkField :field="{ key: 'l3.mac_address', label: 'configMacAddress' }" />
          <p class="muted">{{ t('networkVlanHint') }}</p>
          <div class="toolbar">
            <AppButton :disabled="!editor.editable.value || !items" @click="editor.addVlan">{{
              t('networkAddVlan')
            }}</AppButton>
            <AppButton @click="inactive = !inactive">{{
              t(inactive ? 'networkHideInactive' : 'networkShowInactive')
            }}</AppButton>
          </div>
        </section>
        <section
          v-for="(vlan, index) in items"
          :key="index"
          class="network-card"
          :data-vlan="index"
        >
          <div class="toolbar">
            <h2>VLAN {{ object(vlan) ? String(vlan.vlan_id ?? 0) : index + 1 }}</h2>
            <AppButton :disabled="!editor.editable.value" @click="editor.removeVlan(index)">{{
              t('networkRemoveVlan')
            }}</AppButton>
          </div>
          <div v-if="object(vlan)" class="fields">
            <NetworkField
              v-for="field in vlanFields(row, index).filter((item) => inactive || !item.inactive)"
              :key="field.key"
              :field="field"
            />
          </div>
          <template v-else
            ><p class="muted">{{ t('networkUnknownKept') }}</p>
            <pre>{{ encodeDocument(vlan) }}</pre>
          </template>
        </section>
        <p v-if="!items" class="muted">{{ t('networkUnknownKept') }}</p>
      </template>
      <div class="save-bar">
        <p v-if="editor.issues.value.length" role="status">
          {{ t('networkFixIssues', { count: editor.issues.value.length }) }}
          <AppButton @click="firstIssue">{{ t('networkLocateIssue') }}</AppButton>
        </p>
        <AppButton type="submit" tone="primary" :disabled="!editor.canSave.value">{{
          t('configSave')
        }}</AppButton>
      </div>
    </form>
    <ConfirmDialog
      :open="!!confirmation"
      :title="t(confirmation === 'save' ? 'configSave' : 'configReload')"
      :description="t(confirmation === 'save' ? 'networkSaveHint' : 'networkReloadHint')"
      @cancel="confirmation = null"
      @confirm="confirm"
    />
  </div>
</template>
<style scoped>
.network-editor,
form {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
.network-card {
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow-wrap: anywhere;
}
.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
h2 {
  font-size: var(--font-heading);
}
.toolbar h2 {
  margin-right: auto;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.save-bar {
  padding: var(--space-3) 0;
}
@media (max-width: 650px) {
  .fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .network-card {
    padding: var(--space-3);
  }
}
</style>
