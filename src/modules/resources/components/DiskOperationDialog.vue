<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDiskActions } from '../model/diskOperations'
import { buildDiskOperation, diskActionKeys, diskForm, diskImpact } from '../model/diskForm'
import type { DiskOperation } from '../api/diskOperations'
import { isOptimizationOperation } from '../model/diskOptimize'
import type { MessageKey } from '../../../shared/i18n'
import CpuCorePicker from './CpuCorePicker.vue'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'

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
  if (['resize', 'convert', 'reset'].includes(action.value) && detail?.children.length) return null
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
          <label v-if="action === 'convert' && !actions.optimizing.value" class="check"
            ><input v-model="form.relocate" type="checkbox" />{{ t('diskRelocate') }}</label
          >
          <template v-if="needsPath">
            <label
              >{{ t('diskHostFolder')
              }}<input
                v-model="form.folder"
                required
                autocomplete="off"
                placeholder="/storage/emulated/0/DroidVM"
            /></label>
            <small>{{ t('diskHostPathHint') }}</small>
            <label
              >{{ t('diskFileName') }}<input v-model="form.name" required autocomplete="off"
            /></label>
          </template>
          <template v-if="action === 'create' && actions.selected.value">
            <label class="check"
              ><input v-model="form.inheritSize" type="checkbox" />{{ t('diskInheritSize') }}</label
            >
            <label
              >{{ t('diskAttachPolicy')
              }}<select v-model="form.attach">
                <option value="readonly">{{ t('diskAttachReadonly') }}</option>
                <option value="follow">{{ t('diskAttachFollow') }}</option>
              </select></label
            >
          </template>
          <template v-if="needsSize">
            <label
              >{{ t('diskNewSize') }}<input v-model="form.size" required inputmode="decimal"
            /></label>
            <label
              >{{ t('diskSizeUnit')
              }}<select v-model="form.unit">
                <option>B</option>
                <option>MiB</option>
                <option>GiB</option>
              </select></label
            >
          </template>
          <label v-if="formatVisible"
            >{{ t('diskActualFormat')
            }}<select v-model="form.format">
              <option>qcow2</option>
              <option>raw</option>
              <template v-if="action === 'create'"
                ><option>vhdx</option>
                <option>vdi</option>
                <option>vmdk</option></template
              >
            </select></label
          >
          <template v-if="optionsVisible">
            <label
              >{{ t('diskCompression')
              }}<select v-model="form.compression">
                <option value="none">{{ t('diskNoCompression') }}</option>
                <option value="deflate">Deflate</option>
                <option value="zstd">Zstd</option>
              </select></label
            >
            <label class="check"
              ><input v-model="form.preallocate" type="checkbox" />{{ t('diskPreallocate') }}</label
            >
          </template>
          <label v-if="action === 'resize'" class="check"
            ><input v-model="form.shrink" type="checkbox" />{{ t('diskAllowShrink') }}</label
          >
          <p v-if="action === 'resize' && form.shrink" class="warning">
            {{ t('diskShrinkWarning') }}
          </p>
          <template v-if="action === 'resize'">
            <label class="check"
              ><input v-model="grow" type="checkbox" :disabled="!growAvailable" />{{
                t('diskGrowAfterResize')
              }}</label
            >
            <small>{{ t('diskGrowEligibility') }}</small>
          </template>
          <label v-if="action === 'delete'" class="check"
            ><input v-model="form.deleteFiles" type="checkbox" />{{ t('diskDeleteFiles') }}</label
          >
          <p v-if="action === 'delete'">
            {{ t(form.deleteFiles ? 'diskDeleteFilesEffect' : 'diskKeepFilesEffect') }}
          </p>
          <template
            v-if="actions.optimizing.value && actions.optimizeDefaults.value?.compression === 'ask'"
          >
            <label class="check"
              ><input
                v-model="actions.optimizeConfirmed.value"
                type="checkbox"
                data-testid="disk-optimize-compression-confirm"
                :disabled="actions.rememberBusy.value"
              />{{ t('diskOptimizeConfirmCompression') }}</label
            >
            <label v-if="actions.optimizeDefaults.value.canRemember" class="check"
              ><input
                v-model="remember"
                type="checkbox"
                data-testid="disk-optimize-remember"
                :disabled="actions.rememberBusy.value"
              />{{ t('diskOptimizeRemember') }}</label
            >
          </template>
          <details>
            <summary>{{ t('diskAdvanced') }}</summary>
            <label
              >{{ t('diskCpuAffinity') }}<input v-model="form.cpus" placeholder="0-3,7"
            /></label>
            <small>{{ t('diskCpuHint') }}</small>
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
            <p>{{ t('diskGrowReview') }}</p>
            <p>{{ t('agentGrowHint') }}</p>
            <p>{{ t('agentAutomaticCleanupHint') }}</p>
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
          <p>{{ t('diskConfirmationHint') }}</p>
          <label class="check"
            ><input v-model="acknowledged" type="checkbox" />{{ t('diskAcknowledge') }}</label
          >
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
label {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  overflow-wrap: anywhere;
}
input:not([type='checkbox']),
select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
.check {
  display: flex;
  align-items: start;
  gap: var(--space-2);
}
.check input {
  flex: none;
  margin-top: 4px;
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
  color: var(--danger);
}
</style>
