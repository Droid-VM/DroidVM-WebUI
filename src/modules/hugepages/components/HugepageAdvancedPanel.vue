<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useHugepages } from '../model/hugepages'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'
const model = useHugepages()
const { t, n } = useI18n()
const setting = (key: string) => model.status.value?.advanced?.find((item) => item.key === key)
const valueLabel = (value: string | null | undefined) =>
  value == null ? t('hugepagesDefault') : value
</script>
<template>
  <section
    id="hugepages-advanced"
    class="panel"
    data-testid="hugepages-group-advanced"
    aria-labelledby="hugepages-advanced-heading"
  >
    <h2 id="hugepages-advanced-heading">{{ t('hugepagesGroupAdvanced') }}</h2>
    <p>{{ t('hugepagesAdvancedIntro') }}</p>
    <p v-if="model.status.value?.systemReserveDefaultMb != null">
      {{ t('hugepagesSystemDefault', { value: model.status.value.systemReserveDefaultMb }) }}
    </p>
    <form
      v-for="field in model.advancedFields"
      :key="field.key"
      class="setting-card"
      :data-testid="`hugepages-advanced-${field.key}`"
      @submit.prevent="model.saveAdvanced(field.key)"
    >
      <h3>{{ t(field.label) }}</h3>
      <p>{{ t(field.hint) }}</p>
      <dl class="facts">
        <div>
          <dt>{{ t('hugepagesAdvancedSaved') }}</dt>
          <dd>
            {{ setting(field.key) ? valueLabel(setting(field.key)?.saved) : t('notAvailable') }}
          </dd>
        </div>
        <div>
          <dt>{{ t('hugepagesAdvancedLive') }}</dt>
          <dd>{{ setting(field.key)?.live ?? t('notAvailable') }}</dd>
        </div>
      </dl>
      <p
        v-if="setting(field.key)"
        class="hint"
        :data-testid="`hugepages-advanced-application-${field.key}`"
      >
        {{
          t(
            setting(field.key)?.application === 'live'
              ? 'hugepagesAppliesLive'
              : 'hugepagesAppliesNextLoad',
          )
        }}
      </p>
      <p v-if="setting(field.key)?.reloadRequired === true" class="hint">
        {{ t('hugepagesReloadRequired') }}
      </p>
      <fieldset
        :disabled="
          !model.editable.value || !setting(field.key) || model.status.value?.installed !== true
        "
      >
        <AppTextField
          :id="`hugepages-advanced-input-${field.key}`"
          v-model="model.draft.advanced[field.key]"
          :label="t('hugepagesAdvancedValue')"
          :supporting-text="
            t('hugepagesAdvancedRange', {
              minimum: n(Number(field.minimum)),
              maximum: n(Number(field.maximum)),
            })
          "
          inputmode="numeric"
          autocomplete="off"
          :data-testid="`hugepages-advanced-input-${field.key}`"
        />
        <p v-if="!model.validAdvanced(field.key, model.draft.advanced[field.key])" role="alert">
          {{ t('hugepagesAdvancedInvalid') }}
        </p>
        <div class="buttons">
          <AppButton
            type="submit"
            :data-testid="`hugepages-advanced-save-${field.key}`"
            :disabled="
              !model.canPrepare({
                kind: 'advanced',
                key: field.key,
                value: model.draft.advanced[field.key] || null,
              })
            "
            >{{ t('hugepagesSave') }}</AppButton
          ><AppButton
            :data-testid="`hugepages-advanced-reset-${field.key}`"
            :disabled="!model.canPrepare({ kind: 'advanced', key: field.key, value: null })"
            @click="model.prepare({ kind: 'advanced', key: field.key, value: null })"
            >{{ t('hugepagesRestoreDefault') }}</AppButton
          >
        </div>
      </fieldset>
    </form>
  </section>
</template>
