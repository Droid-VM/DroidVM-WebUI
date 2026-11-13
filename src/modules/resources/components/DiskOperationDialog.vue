<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDiskActions } from '../model/diskOperations'
import {
  buildDiskOperation,
  diskActionKeys,
  diskForm,
  diskImpact,
  snapshotAction,
} from '../model/diskForm'
import type { DiskOperation } from '../api/diskOperations'
import { isOptimizationOperation } from '../model/diskOptimize'
import type { MessageKey } from '../../../shared/i18n'
import CpuCorePicker from './CpuCorePicker.vue'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppCheckbox from '../../../shared/ui/AppCheckbox.vue'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'

const { t, locale } = useI18n(),
  actions = useDiskActions()
const form = reactive(diskForm()),
  candidate = ref<DiskOperation | null>(null),
  grow = ref(false),
  confirmedGrow = ref(false),
  acknowledged = ref(false)
const remember = ref(false),
  confirmedRemember = ref(false)
const preferenceNotice = ref<HTMLElement | null>(null)
watch(
  () => actions.rememberState.value.state,
  (state) => {
    if (actions.open.value && actions.optimizing.value && state !== 'idle')
      preferenceNotice.value?.scrollIntoView({ block: 'center' })
  },
  { flush: 'post' },
)
const prepared = actions.preparation,
  action = actions.action
const effectKeys: Record<typeof action.value, MessageKey> = {
  create: 'diskCreateEffect',
  clone: 'diskCloneEffect',
  resize: 'diskResizeEffect',
  convert: 'diskConvertEffect',
  flatten: 'diskFlattenEffect',
  commit: 'diskMergeEffect',
  reset: 'diskResetEffect',
  'snapshot-create': 'diskSnapshotCreateEffect',
  'snapshot-apply': 'diskSnapshotApplyEffect',
  'snapshot-delete': 'diskSnapshotDeleteEffect',
  delete: 'diskDeleteEffect',
}
watch(
  prepared,
  (value) => {
    candidate.value = null
    grow.value = confirmedGrow.value = false
    acknowledged.value = false
    remember.value = confirmedRemember.value = false
    if (!value) return
    Object.assign(
      form,
      diskForm(value.detail?.disk.path, actions.initial.value, actions.defaultCpus.value),
    )
    if (
      !actions.initial.value &&
      action.value === 'resize' &&
      value.detail?.inspection.virtualBytes
    ) {
      form.size = value.detail.inspection.virtualBytes
      form.unit = 'B'
    }
  },
  { immediate: true },
)
const needsPath = computed(
  () => ['create', 'clone'].includes(action.value) || (action.value === 'convert' && form.relocate),
)
const needsSize = computed(
  () =>
    action.value === 'resize' ||
    (action.value === 'create' && (!actions.selected.value || !form.inheritSize)),
)
const formatVisible = computed(
  () =>
    !actions.optimizing.value &&
    ['create', 'convert', 'flatten'].includes(action.value) &&
    !(action.value === 'create' && actions.selected.value),
)
const optionsVisible = computed(
  () =>
    !actions.optimizing.value && ['create', 'clone', 'convert', 'flatten'].includes(action.value),
)
const impact = computed(() => (prepared.value ? diskImpact(prepared.value, action.value) : null))
const operation = computed(() => {
  const op = buildDiskOperation(action.value, actions.selected.value, form)
  if (!op || !prepared.value) return null
  if (
    actions.optimizing.value &&
    (!actions.canOptimize.value || !isOptimizationOperation(op, prepared.value))
  )
    return null
  const detail = prepared.value.detail
  if (detail && !detail.disk.selectable) return null
  if (
    (['resize', 'convert', 'reset'].includes(action.value) || snapshotAction(action.value)) &&
    detail?.children.length
  )
    return null
  if (['flatten', 'commit', 'reset'].includes(action.value) && !detail?.disk.parentId) return null
  if (action.value === 'commit' && prepared.value.parent?.children.length !== 1) return null
  if (
    'folder' in op &&
    op.folder &&
    'name' in op &&
    op.name &&
    ['create', 'clone'].includes(op.action)
  ) {
    const path = `${op.folder === '/' ? '' : op.folder}/${op.name}`
    if (prepared.value.catalog.items.some((row) => row.path === path)) return null
  }
  if (
    op.action === 'resize' &&
    detail?.inspection.virtualBytes &&
    BigInt(op.size) < BigInt(detail.inspection.virtualBytes) &&
    !op.shrink
  )
    return null
  return op
})
const growAvailable = computed(() => actions.canGrow(operation.value))
watch(growAvailable, (available) => {
  if (!available) grow.value = false
})
function review() {
  if (operation.value) {
    candidate.value = JSON.parse(JSON.stringify(operation.value))
    confirmedGrow.value = grow.value && growAvailable.value
    acknowledged.value = false
    confirmedRemember.value = remember.value
  }
}
function submit() {
  if (candidate.value && acknowledged.value && actions.allowed.value)
    void actions.submit(candidate.value, confirmedGrow.value, confirmedRemember.value)
}
const parameterKeys: Record<string, MessageKey> = {
  folder: 'diskHostFolder',
  createFolder: 'diskCreateFolder',
  name: 'diskFileName',
  format: 'diskActualFormat',
  size: 'diskNewSize',
  compress: 'diskCompression',
  preallocate: 'diskPreallocate',
  shrink: 'diskAllowShrink',
  deleteFiles: 'diskDeleteFiles',
  attach: 'diskAttachPolicy',
  cpus: 'diskCpuAffinity',
  snapshot: 'diskSnapshotName',
}
const parameters = computed(() =>
  candidate.value ? Object.entries(candidate.value).filter(([key]) => key in parameterKeys) : [],
)
function parameter(value: unknown) {
  if (typeof value === 'boolean') return t(value ? 'diskYes' : 'diskNo')
  if (Array.isArray(value)) return value.join(', ')
  if (value === 'none') return t('diskNoCompression')
  if (value === 'readonly') return t('diskAttachReadonly')
  if (value === 'follow') return t('diskAttachFollow')
  return String(value)
}
onBeforeUnmount(actions.close)
</script>

<template>
  <AppDialog
    :open="actions.open.value"
    :title="t(actions.optimizing.value ? 'diskOptimizeTitle' : diskActionKeys[action])"
    @close="actions.close"
  >
    <div class="disk-form">
      <p v-if="actions.loading.value" role="status">{{ t('processing') }}</p>
      <AppNotice
        v-if="actions.problem.value"
        tone="error"
        :title="t(actions.problem.value.titleKey)"
        ><p>{{ t(actions.problem.value.descriptionKey) }}</p></AppNotice
      >
      <AppButton
        v-if="actions.problem.value"
        @click="
          actions.optimizing.value
            ? actions.prepareOptimize(
                actions.selected.value!,
                actions.optimizeOrigin.value,
                actions.initial.value,
                actions.optimizeDefaults.value,
              )
            : actions.prepare(actions.selected.value, action, actions.initial.value)
        "
        >{{ t('refreshList') }}</AppButton
      >
      <section
        v-if="actions.optimizing.value"
        data-testid="disk-optimize-check"
        :data-state="actions.optimizeCheck.value"
      >
        <p v-if="actions.loading.value && actions.optimizeOrigin.value === 'import'">
          {{ t('diskOptimizeInspection') }}
        </p>
        <p v-if="actions.optimizeCheck.value === 'overlay'">{{ t('diskOptimizeOverlaySkip') }}</p>
        <p v-else-if="actions.optimizeCheck.value === 'uncompressed'">
          {{ t('diskOptimizeNoneSkip') }}
        </p>
        <p v-else-if="actions.optimizeCheck.value === 'unknown'">
          {{ t('diskOptimizeCompressionUnknown') }}
        </p>
        <p v-else-if="prepared && !actions.canOptimize.value">{{ t('diskOptimizeUnavailable') }}</p>
        <AppButton
          v-if="
            actions.optimizeOrigin.value === 'import' &&
            (actions.optimizeCheck.value === 'unknown' || actions.problem.value)
          "
          data-testid="disk-optimize-manual"
          @click="actions.prepareOptimize(actions.selected.value!, 'manual')"
          >{{ t('diskOptimizeManual') }}</AppButton
        >
        <section
          v-if="actions.rememberState.value.state !== 'idle'"
          ref="preferenceNotice"
          data-testid="disk-optimize-preference-state"
          :data-state="actions.rememberState.value.state"
          aria-live="polite"
        >
          <p>
            {{
              t(
                actions.rememberState.value.state === 'saved'
                  ? 'diskOptimizePreferenceSaved'
                  : actions.rememberState.value.state === 'failed'
                    ? 'diskOptimizePreferenceFailed'
                    : actions.rememberState.value.state === 'unknown'
                      ? 'diskOptimizePreferenceUnknown'
                      : 'diskOptimizePreferenceWaiting',
              )
            }}
          </p>
          <p v-if="actions.rememberState.value.problem">
            {{ t(actions.rememberState.value.problem.descriptionKey) }}
          </p>
          <AppButton
            v-if="actions.rememberBusy.value"
            data-testid="disk-optimize-preference-query"
            :disabled="actions.rememberState.value.state === 'posting'"
            @click="actions.queryOptimizationPreference"
            >{{ t('diskOptimizeQueryPreference') }}</AppButton
          >
        </section>
      </section>
      <template v-if="prepared && (!actions.optimizing.value || actions.canOptimize.value)">
        <p v-if="prepared.detail">
          <strong>{{ prepared.detail.disk.name }}</strong
          ><br />{{ prepared.detail.disk.path }}
        </p>
        <p>{{ t(actions.optimizing.value ? 'diskOptimizeEffect' : effectKeys[action]) }}</p>
        <form v-if="!candidate" @submit.prevent="review">
          <AppCheckbox
            v-if="action === 'convert' && !actions.optimizing.value"
            v-model="form.relocate"
            >{{ t('diskRelocate') }}</AppCheckbox
          >
          <template v-if="needsPath">
            <AppTextField
              v-model="form.folder"
              :label="t('diskHostFolder')"
              required
              autocomplete="off"
              placeholder="/storage/emulated/0/DroidVM"
            />
            <AppTextField
              v-model="form.name"
              :label="t('diskFileName')"
              required
              autocomplete="off"
            />
          </template>
          <template v-if="action === 'create' && actions.selected.value">
            <AppCheckbox v-model="form.inheritSize">{{ t('diskInheritSize') }}</AppCheckbox>
            <AppSelect v-model="form.attach" :label="t('diskAttachPolicy')">
              <AppOption value="readonly">{{ t('diskAttachReadonly') }}</AppOption>
              <AppOption value="follow">{{ t('diskAttachFollow') }}</AppOption>
            </AppSelect>
          </template>
          <template v-if="needsSize">
            <AppTextField
              v-model="form.size"
              :label="t('diskNewSize')"
              required
              inputmode="decimal"
            />
            <AppSelect v-model="form.unit" :label="t('diskSizeUnit')">
              <AppOption value="B">B</AppOption>
              <AppOption value="MiB">MiB</AppOption>
              <AppOption value="GiB">GiB</AppOption>
            </AppSelect>
          </template>
          <AppSelect v-if="formatVisible" v-model="form.format" :label="t('diskActualFormat')">
            <AppOption value="qcow2">qcow2</AppOption>
            <AppOption value="raw">raw</AppOption>
            <template v-if="action === 'create'"
              ><AppOption value="vhdx">vhdx</AppOption>
              <AppOption value="vdi">vdi</AppOption>
              <AppOption value="vmdk">vmdk</AppOption></template
            >
          </AppSelect>
          <template v-if="optionsVisible">
            <AppSelect v-model="form.compression" :label="t('diskCompression')">
              <AppOption value="none">{{ t('diskNoCompression') }}</AppOption>
              <AppOption value="deflate">Deflate</AppOption>
              <AppOption value="zstd">Zstd</AppOption>
            </AppSelect>
            <AppCheckbox v-model="form.preallocate">{{ t('diskPreallocate') }}</AppCheckbox>
          </template>
          <AppTextField
            v-if="snapshotAction(action)"
            v-model="form.snapshot"
            :label="t('diskSnapshotName')"
            :readonly="action !== 'snapshot-create'"
            required
            autocomplete="off"
          />
          <p v-if="snapshotAction(action)" class="muted">{{ t('diskSnapshotCrosvmHint') }}</p>
          <AppCheckbox v-if="action === 'resize'" v-model="form.shrink">{{
            t('diskAllowShrink')
          }}</AppCheckbox>
          <p v-if="action === 'resize' && form.shrink" class="warning">
            {{ t('diskShrinkWarning') }}
          </p>
          <template v-if="action === 'resize'">
            <AppCheckbox v-model="grow" :disabled="!growAvailable">{{
              t('diskGrowAfterResize')
            }}</AppCheckbox>
          </template>
          <AppCheckbox v-if="action === 'delete'" v-model="form.deleteFiles">{{
            t('diskDeleteFiles')
          }}</AppCheckbox>
          <p v-if="action === 'delete'">
            {{ t(form.deleteFiles ? 'diskDeleteFilesEffect' : 'diskKeepFilesEffect') }}
          </p>
          <template
            v-if="actions.optimizing.value && actions.optimizeDefaults.value?.compression === 'ask'"
          >
            <AppCheckbox
              v-model="actions.optimizeConfirmed.value"
              data-testid="disk-optimize-compression-confirm"
              :disabled="actions.rememberBusy.value"
              >{{ t('diskOptimizeConfirmCompression') }}</AppCheckbox
            >
            <AppCheckbox
              v-if="actions.optimizeDefaults.value.canRemember"
              v-model="remember"
              data-testid="disk-optimize-remember"
              :disabled="actions.rememberBusy.value"
              >{{ t('diskOptimizeRemember') }}</AppCheckbox
            >
          </template>
          <details>
            <summary>{{ t('diskAdvanced') }}</summary>
            <AppTextField v-model="form.cpus" :label="t('diskCpuAffinity')" placeholder="0-3,7" />
            <CpuCorePicker
              :current="form.cpus"
              :title="t('diskPickCpu')"
              :disabled="false"
              :selection-limit="{ minimum: 0, maximum: 1024 }"
              @select="form.cpus = $event"
            />
          </details>
          <p v-if="!operation" class="muted">{{ t('diskFormInvalid') }}</p>
          <AppButton
            type="submit"
            data-testid="disk-operation-review"
            tone="primary"
            :disabled="
              !operation ||
              !actions.allowed.value ||
              (actions.optimizing.value &&
                (actions.rememberBusy.value ||
                  (actions.optimizeDefaults.value?.compression === 'ask' &&
                    !actions.optimizeConfirmed.value)))
            "
            >{{ t('diskReview') }}</AppButton
          >
        </form>
        <template v-else>
          <h3>{{ t('diskReview') }}</h3>
          <dl>
            <template v-for="[key, value] in parameters" :key="key"
              ><dt>{{ t(parameterKeys[key]!) }}</dt>
              <dd>
                {{
                  key === 'size'
                    ? t('diskBytes', { value: BigInt(String(value)).toLocaleString(locale) })
                    : parameter(value)
                }}
              </dd></template
            >
          </dl>
          <p v-if="candidate.action === 'create' && candidate.backingId && !candidate.size">
            {{ t('diskInheritSize') }}
          </p>
          <p v-if="candidate.action === 'delete'">
            {{ t(candidate.deleteFiles ? 'diskDeleteFilesEffect' : 'diskKeepFilesEffect') }}
          </p>
          <p v-if="candidate.action === 'resize' && candidate.shrink" class="warning">
            {{ t('diskShrinkWarning') }}
          </p>
          <template v-if="confirmedGrow">
            <p>{{ t('agentGrowHint') }}</p>
          </template>
          <details open>
            <summary>{{ t('diskAffectedDisks', { count: impact?.disks.length ?? 0 }) }}</summary>
            <ul>
              <li v-for="disk in impact?.disks" :key="disk.id">
                {{ disk.name || disk.id }}
                <p>{{ disk.path }}</p>
              </li>
            </ul>
          </details>
          <details open>
            <summary>
              {{ t('diskAttachments', { count: impact?.attachments.length ?? 0 }) }}
            </summary>
            <ul>
              <li v-for="slot in impact?.attachments" :key="`${slot.vmId}:${slot.slot}`">
                {{ slot.vmName || slot.vmId }} · {{ t('diskSlot', { slot: slot.slot + 1 }) }} ·
                {{ t(slot.readOnly ? 'diskReadOnly' : 'diskReadWrite') }}
              </li>
            </ul>
            <p v-if="!impact?.attachments.length">{{ t('diskNoAttachments') }}</p>
          </details>
          <AppCheckbox v-model="acknowledged">{{ t('diskAcknowledge') }}</AppCheckbox>
          <div class="buttons">
            <AppButton @click="candidate = null">{{ t('diskBackToForm') }}</AppButton
            ><AppButton
              tone="primary"
              data-testid="disk-operation-execute"
              :disabled="
                !acknowledged ||
                !actions.allowed.value ||
                (actions.optimizing.value && actions.rememberBusy.value) ||
                (confirmedGrow && !actions.canGrow(candidate))
              "
              @click="submit"
              >{{ t('diskExecute') }}</AppButton
            >
          </div>
        </template>
      </template>
    </div>
  </AppDialog>
</template>

<style scoped>
.disk-form,
form,
details {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  overflow-wrap: anywhere;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
  gap: var(--space-2);
}
dd {
  margin: 0;
}
ul {
  padding-inline-start: var(--space-4);
}
li {
  margin-block: var(--space-2);
}
p {
  margin: 0;
}
summary {
  cursor: pointer;
  margin-block: var(--space-2);
}
.warning {
  color: var(--md-sys-color-error);
}
</style>
