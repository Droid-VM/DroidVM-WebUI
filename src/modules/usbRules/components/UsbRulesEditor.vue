<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsbRulesEditor } from '../model/editor'
import { ruleLayers, type RuleLayer } from '../model/document'
import { useResourceCatalog } from '../../resources'
import { taskStateKeys } from '../../tasks'
import UsbRuleCard from './UsbRuleCard.vue'
import UsbRulesPreview from './UsbRulesPreview.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import FilterGroup from '../../../shared/ui/FilterGroup.vue'
import AppSwitch from '../../../shared/ui/AppSwitch.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog.vue'

const editor = useUsbRulesEditor(),
  resources = useResourceCatalog(),
  { t } = useI18n()
const layer = ref<RuleLayer>('exact'),
  page = ref(0),
  confirmation = ref<'save' | 'reload' | 'enable' | null>(null)
const pageSize = 20
const current = computed(() => ruleLayers.find((item) => item.key === layer.value)!)
const layerOptions = computed(() =>
  ruleLayers.map((item) => ({
    value: item.key,
    // A layer with invalid rules is flagged so the problem is findable from the tabs.
    label: editor.issues.value.some((issue) => issue.layer === item.key)
      ? `${t(item.label)} · ${t('configInvalid')}`
      : t(item.label),
    count: editor.draft.value?.[item.key].length ?? 0,
  })),
)
const rules = computed(() => editor.draft.value?.[layer.value] ?? [])
const pages = computed(() => Math.max(1, Math.ceil(rules.value.length / pageSize)))
const rows = computed(() => rules.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
const problems = computed(() =>
  [editor.problem.value, editor.entry.value?.problem].filter((item) => !!item),
)
watch(layer, () => {
  page.value = 0
})
watch(pages, (count) => {
  page.value = Math.min(page.value, count - 1)
})
function toggle(event: Event) {
  const input = event.target as HTMLElement & { selected: boolean }
  if (input.selected) {
    input.selected = false
    confirmation.value = 'enable'
  } else editor.enabled(false)
}
function confirm() {
  const action = confirmation.value
  confirmation.value = null
  if (action === 'enable') editor.enabled(true)
  else if (action === 'save') void editor.save()
  else if (action === 'reload') void editor.reload()
}
function add() {
  editor.add(layer.value)
  page.value = pages.value - 1
}
async function firstIssue() {
  const issue = editor.issues.value[0]
  if (!issue) return
  layer.value = issue.layer
  await nextTick()
  page.value = Math.floor(issue.index / pageSize)
  await nextTick()
  document.getElementById(`usb-rule-${issue.layer}-${issue.index}-${issue.field}`)?.focus()
}
async function locateRule(target: RuleLayer, index: number) {
  layer.value = target
  await nextTick()
  page.value = Math.floor(index / pageSize)
  await nextTick()
  const card = document.querySelector<HTMLElement>(`[data-rule="${target}-${index}"]`)
  card?.focus()
  card?.scrollIntoView({ block: 'center' })
}
async function move(index: number, direction: -1 | 1) {
  editor.move(layer.value, index, direction)
  page.value = Math.floor((index + direction) / pageSize)
  await nextTick()
  document
    .querySelector<HTMLElement>(`[data-rule="${layer.value}-${index + direction}"] button`)
    ?.focus()
}
function download() {
  const url = URL.createObjectURL(new Blob([editor.exportJson()], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'droidvm-usb-rules-draft.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="rules-editor">
    <OperationTrackingNotice
      :problem="editor.recoveryProblem.value"
      @clear="editor.clearTracking"
    />
    <p v-if="editor.entry.value?.state === 'unknown'">{{ t('configurationMissingReceipt') }}</p>
    <div class="toolbar">
      <AppButton :disabled="editor.busy.value" @click="confirmation = 'reload'">{{
        t('configReload')
      }}</AppButton>
      <AppButton :disabled="editor.targetLoading.value" @click="editor.refreshTargets">{{
        t('usbRulesRefreshTargets')
      }}</AppButton>
      <AppButton v-if="editor.draft.value" @click="download">{{ t('usbRulesExport') }}</AppButton>
    </div>
    <AppNotice
      v-for="problem in problems"
      :key="problem.code"
      tone="error"
      :title="t(problem.titleKey)"
      ><p>{{ t(problem.descriptionKey) }}</p></AppNotice
    >
    <AppNotice v-if="editor.targetProblem.value" tone="warning" :title="t('usbRulesTargetsFailed')"
      ><p>{{ t(editor.targetProblem.value.descriptionKey) }}</p></AppNotice
    >
    <AppNotice v-if="editor.blocked.value" tone="warning" :title="t('configBlocked')"
      ><p>{{ t('usbRulesBlockedHint') }}</p></AppNotice
    >
    <AppNotice
      v-if="editor.observed.value && editor.observed.value.persistence !== 'persisted'"
      tone="warning"
      :title="
        t(
          editor.observed.value.persistence === 'uncertain'
            ? 'errorUncertainTitle'
            : 'usbRulesUnpersisted',
        )
      "
      ><p>{{ t('usbRulesPersistenceHint') }}</p></AppNotice
    >
    <p v-if="editor.loading.value || editor.staging.value" role="status">{{ t('processing') }}</p>
    <section v-if="editor.entry.value" class="operation" aria-live="polite">
      <p v-if="editor.entry.value.state === 'unknown'">{{ t('configUnknown') }}</p>
      <p v-if="editor.entry.value.task">
        {{ t(taskStateKeys[editor.entry.value.task.state])
        }}<span v-if="editor.entry.value.task.errorCode">
          · {{ editor.entry.value.task.errorCode }}</span
        >
      </p>
      <p v-if="editor.pending.value">{{ t('usbRulesPendingHint') }}</p>
      <p v-if="editor.saved.value">{{ t('usbRulesSaved') }}</p>
      <AppButton
        v-if="editor.pending.value"
        :disabled="editor.checking.value || editor.staging.value"
        @click="editor.reconcile"
        >{{ t('queryStatus') }}</AppButton
      >
    </section>
    <template v-if="editor.draft.value">
      <AppSwitch
        :selected="editor.draft.value.enabled"
        :disabled="!editor.editable.value"
        @change="toggle"
        >{{ t('usbRulesEnabled') }}</AppSwitch
      >
      <FilterGroup
        v-model="layer"
        class="layers"
        :label="t('usbRulesCategories')"
        :options="layerOptions"
      />
      <section :aria-label="t(current.label)" class="layer-content">
        <h2>{{ t(current.label) }}</h2>
        <AppButton :disabled="!editor.editable.value" @click="add">{{
          t('usbRulesAdd')
        }}</AppButton>
        <p v-if="!rules.length" class="muted">{{ t('usbRulesEmpty') }}</p>
        <UsbRuleCard
          v-for="(rule, offset) in rows"
          :key="`${layer}-${page * pageSize + offset}`"
          :layer="layer"
          :rule="rule"
          :index="page * pageSize + offset"
          :count="rules.length"
          :targets="editor.targets.value"
          :devices="resources.usb.items.value"
          :disabled="!editor.editable.value"
          @update="editor.update(layer, page * pageSize + offset, $event)"
          @remove="editor.remove(layer, page * pageSize + offset)"
          @move="move(page * pageSize + offset, $event)"
        />
        <div v-if="pages > 1" class="toolbar">
          <AppButton :disabled="page === 0" @click="page--">{{ t('usbRulesPrevious') }}</AppButton>
          <span>{{ t('usbRulesPage', { page: page + 1, total: pages }) }}</span>
          <AppButton :disabled="page + 1 === pages" @click="page++">{{
            t('usbRulesNext')
          }}</AppButton>
        </div>
      </section>
      <UsbRulesPreview @locate="locateRule" />
      <div class="save-bar">
        <AppButton v-if="editor.issues.value.length" @click="firstIssue">{{
          t('usbRulesFixErrors', { count: editor.issues.value.length })
        }}</AppButton>
        <span v-else-if="editor.dirty.value" class="muted">{{ t('usbRulesDraft') }}</span>
        <AppButton
          tone="primary"
          :disabled="!editor.canSave.value"
          @click="confirmation = 'save'"
          >{{ t('usbRulesSave') }}</AppButton
        >
      </div>
    </template>
    <ConfirmDialog
      :open="!!confirmation"
      :title="
        t(
          confirmation === 'enable'
            ? 'usbRulesEnabled'
            : confirmation === 'save'
              ? 'usbRulesSave'
              : 'configReload',
        )
      "
      :description="
        t(
          confirmation === 'enable'
            ? 'usbRulesEnableHint'
            : confirmation === 'save'
              ? 'usbRulesSaveHint'
              : 'configReloadHint',
        )
      "
      @cancel="confirmation = null"
      @confirm="confirm"
    />
  </div>
</template>

<style scoped>
.rules-editor,
.layer-content {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.toolbar,
.save-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.layers {
  flex-wrap: nowrap;
  overflow-x: auto;
}
.layer-content > .btn {
  justify-self: start;
}
.save-bar {
  position: sticky;
  bottom: calc(var(--bottom-nav-height, 80px) + env(safe-area-inset-bottom));
  background: var(--app-color-card);
  padding: var(--space-3);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  z-index: 2;
}
.save-bar > .primary {
  margin-left: auto;
}
p,
h2 {
  margin: 0;
  overflow-wrap: anywhere;
}
h2 {
  font-size: 1.125rem;
}
.operation {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: var(--space-3);
  display: grid;
  gap: var(--space-2);
}
.operation .btn {
  justify-self: start;
}
@media (width >= 600px) {
  .save-bar {
    bottom: var(--space-3);
  }
}
</style>
