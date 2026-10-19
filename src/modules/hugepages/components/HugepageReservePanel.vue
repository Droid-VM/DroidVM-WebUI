<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useHugepages } from '../model/hugepages'
import { useHugepageFormatting } from './format'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'
const model = useHugepages()
const { t } = useI18n(),
  { pageLabel } = useHugepageFormatting()
const stats = [
  ['actualPoolPages', 'hugepagesActualPool'],
  ['savedPoolPages', 'hugepagesSavedPool'],
  ['actualCmaPages', 'hugepagesActualCma'],
  ['savedCmaPages', 'hugepagesSavedCma'],
] as const
</script>
<template>
  <section
    id="hugepages-reserve"
    class="panel"
    data-testid="hugepages-group-reserve"
    aria-labelledby="hugepages-reserve-heading"
  >
    <h2 id="hugepages-reserve-heading">{{ t('hugepagesGroupReserve') }}</h2>
    <dl v-if="model.status.value" class="facts">
      <div v-for="[key, label] in stats" :key="key">
        <dt>{{ t(label) }}</dt>
        <dd :data-testid="`hugepages-${key}`">{{ pageLabel(model.status.value[key]) }}</dd>
      </div>
    </dl>
    <form @submit.prevent="model.saveTargets">
      <h3>{{ t('hugepagesTargets') }}</h3>
      <p>{{ t('hugepagesTargetsHint') }}</p>
      <fieldset
        :disabled="
          !model.editable.value ||
          model.status.value?.installed !== true ||
          model.status.value?.consumerPages == null
        "
      >
        <AppTextField
          v-model="model.draft.pool"
          :label="t('hugepagesPoolInput')"
          inputmode="numeric"
          autocomplete="off"
          data-testid="hugepages-pool-target"
        />
        <AppTextField
          v-model="model.draft.cma"
          :label="t('hugepagesCmaInput')"
          :supporting-text="t('hugepagesCmaHint')"
          inputmode="numeric"
          autocomplete="off"
          data-testid="hugepages-cma-target"
        />
        <p v-if="model.draft.pool && !model.valid.value" role="alert">
          {{ t('hugepagesInvalidTarget') }}
        </p>
        <div class="buttons">
          <AppButton
            type="submit"
            tone="primary"
            data-testid="hugepages-save"
            :disabled="!model.valid.value"
            >{{ t('hugepagesSave') }}</AppButton
          ><AppButton :disabled="model.loading.value" @click="model.reloadDraft">{{
            t('hugepagesReloadDraft')
          }}</AppButton>
        </div>
      </fieldset>
    </form>
    <h3>{{ t('hugepagesAcquire') }}</h3>
    <p>{{ t('hugepagesAcquireHint') }}</p>
    <div class="buttons">
      <AppButton
        v-for="mode in [1, 2, 3] as const"
        :key="mode"
        :data-testid="`hugepages-acquire-${mode}`"
        tone="tonal"
        :disabled="!model.canPrepare({ kind: 'acquire', mode })"
        @click="model.prepare({ kind: 'acquire', mode })"
        >{{ t('hugepagesMode', { mode }) }}</AppButton
      >
      <AppButton
        data-testid="hugepages-stop"
        :disabled="!model.canPrepare({ kind: 'stop-acquire' })"
        @click="model.prepare({ kind: 'stop-acquire' })"
        >{{ t('hugepagesStop') }}</AppButton
      >
    </div>
  </section>
</template>
