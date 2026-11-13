<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHugepages } from '../model/hugepages'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'

// The App's advanced screen: one row per module parameter showing the value used at the
// next load; a row opens an editor for that value.
const model = useHugepages()
const { t, n } = useI18n()
type Field = (typeof model.advancedFields)[number]
const setting = (key: string) => model.status.value?.advanced?.find((item) => item.key === key)
const value = (key: string) => {
  const current = setting(key)
  if (!current) return t('notAvailable')
  return current.saved ?? current.live ?? t('hugepagesDefault')
}
const editing = ref<Field | null>(null)
const locked = computed(() => !model.editable.value || model.status.value?.installed !== true)
const draft = computed(() => (editing.value ? model.draft.advanced[editing.value.key] : ''))
function open(field: Field) {
  model.draft.advanced[field.key] = setting(field.key)?.saved ?? ''
  editing.value = field
}
function save() {
  const field = editing.value
  if (!field) return
  editing.value = null
  model.saveAdvanced(field.key)
}
function reset() {
  const field = editing.value
  if (!field) return
  editing.value = null
  model.prepare({ kind: 'advanced', key: field.key, value: null })
}
</script>

<template>
  <section
    class="card out rows"
    data-testid="hugepages-group-advanced"
    :aria-label="t('hugepagesGroupAdvanced')"
  >
    <button
      v-for="field in model.advancedFields"
      :key="field.key"
      type="button"
      class="row"
      :data-testid="`hugepages-advanced-${field.key}`"
      :disabled="locked || !setting(field.key)"
      @click="open(field)"
    >
      <span class="rt"
        ><span class="a">{{ t(field.label) }}</span
        ><span v-if="setting(field.key)?.reloadRequired" class="b">{{
          t('hugepagesReloadPending', { value: setting(field.key)?.live ?? '—' })
        }}</span></span
      >
      <span class="value">{{ value(field.key) }}</span>
      <span class="trail"><AppIcon name="chevron" /></span>
    </button>
  </section>
  <AppDialog :open="!!editing" :title="editing ? t(editing.label) : ''" @close="editing = null">
    <form v-if="editing" class="editor" @submit.prevent="save">
      <AppTextField
        :id="`hugepages-advanced-input-${editing.key}`"
        v-model="model.draft.advanced[editing.key]"
        :label="t('hugepagesAdvancedValue')"
        :supporting-text="
          t('hugepagesAdvancedRange', {
            minimum: n(Number(editing.minimum)),
            maximum: n(Number(editing.maximum)),
          })
        "
        :error-text="model.validAdvanced(editing.key, draft) ? '' : t('hugepagesAdvancedInvalid')"
        inputmode="numeric"
        autocomplete="off"
        :data-testid="`hugepages-advanced-input-${editing.key}`"
      />
      <div class="buttons">
        <AppButton
          :data-testid="`hugepages-advanced-reset-${editing.key}`"
          :disabled="!model.canPrepare({ kind: 'advanced', key: editing.key, value: null })"
          @click="reset"
          >{{ t('hugepagesRestoreDefault') }}</AppButton
        >
        <span class="grow" />
        <AppButton @click="editing = null">{{ t('cancel') }}</AppButton>
        <AppButton
          type="submit"
          tone="primary"
          :data-testid="`hugepages-advanced-save-${editing.key}`"
          :disabled="
            !model.canPrepare({ kind: 'advanced', key: editing.key, value: draft || null })
          "
          >{{ t('hugepagesSave') }}</AppButton
        >
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.rows .row + .row {
  border-top: 1px solid var(--md-sys-color-outline-variant);
}
button.row:disabled {
  cursor: default;
  opacity: 0.6;
}
.value {
  color: var(--md-sys-color-on-surface-variant);
  font-variant-numeric: tabular-nums;
}
.editor {
  display: grid;
  gap: 16px;
}
.editor .grow {
  flex: 1;
}
</style>
