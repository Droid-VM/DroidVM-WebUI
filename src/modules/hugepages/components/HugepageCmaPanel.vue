<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHugepages } from '../model/hugepages'
import { useHugepageFormatting } from './format'
import AppButton from '../../../shared/ui/AppButton.vue'
const model = useHugepages()
const { t } = useI18n(),
  { pageLabel, flag, leverLabel } = useHugepageFormatting()
const lever = computed(() => (model.draft.lever === 'none' ? null : model.draft.lever))
const trial = computed(() => ({
  kind: 'cma' as const,
  enabled: true,
  pages: model.draft.cmaTrial,
  persist: false,
  lever: lever.value,
}))
const save = computed(() => ({
  kind: 'cma-save' as const,
  pages: model.status.value?.actualCmaPages ?? '',
  lever: lever.value,
}))
const disable = { kind: 'cma' as const, enabled: false, pages: '0', persist: true, lever: null }
const belowSavedPool = computed(
  () =>
    model.status.value?.actualCmaPages != null &&
    model.status.value?.savedPoolPages != null &&
    BigInt(model.status.value.actualCmaPages) > 0n &&
    BigInt(model.status.value.actualCmaPages) < BigInt(model.status.value.savedPoolPages),
)
</script>
<template>
  <section
    id="hugepages-cma"
    class="panel"
    data-testid="hugepages-group-cma"
    aria-labelledby="hugepages-cma-heading"
  >
    <h2 id="hugepages-cma-heading">{{ t('hugepagesGroupCma') }}</h2>
    <p>{{ t('hugepagesCmaIntro') }}</p>
    <p v-if="model.status.value?.hasCma !== true" role="status">
      {{ t('hugepagesCmaUnavailable') }}
    </p>
    <dl class="facts">
      <div>
        <dt>{{ t('hugepagesActualCma') }}</dt>
        <dd>{{ pageLabel(model.status.value?.actualCmaPages) }}</dd>
      </div>
      <div>
        <dt>{{ t('hugepagesSavedCma') }}</dt>
        <dd>{{ pageLabel(model.status.value?.savedCmaPages) }}</dd>
      </div>
      <div>
        <dt>{{ t('hugepagesCmaVendorAllowed') }}</dt>
        <dd>{{ flag(model.status.value?.cma?.vendorAllowed) }}</dd>
      </div>
      <div>
        <dt>{{ t('hugepagesCmaFlagLive') }}</dt>
        <dd>{{ flag(model.status.value?.cma?.restrictEnabled) }}</dd>
      </div>
      <div>
        <dt>{{ t('hugepagesCmaHookLive') }}</dt>
        <dd>{{ flag(model.status.value?.cma?.gfpHookEnabled) }}</dd>
      </div>
      <div>
        <dt>{{ t('hugepagesCmaLeverSaved') }}</dt>
        <dd>
          {{
            model.status.value?.cma
              ? leverLabel(model.status.value.cma.savedLever)
              : t('notAvailable')
          }}
        </dd>
      </div>
    </dl>
    <fieldset
      :disabled="
        !model.editable.value ||
        model.status.value?.loaded !== true ||
        model.status.value?.hasCma !== true
      "
    >
      <label
        >{{ t('hugepagesCmaTrialTarget')
        }}<input
          v-model="model.draft.cmaTrial"
          inputmode="numeric"
          autocomplete="off"
          data-testid="hugepages-cma-trial-target"
      /></label>
      <label
        >{{ t('hugepagesCmaLever')
        }}<select v-model="model.draft.lever" data-testid="hugepages-cma-lever">
          <option value="none">{{ t('hugepagesLeverNone') }}</option>
          <option
            value="flag"
            :disabled="
              model.status.value?.cma?.vendorAllowed !== true &&
              model.status.value?.features?.restrict !== true
            "
          >
            {{ t('hugepagesLeverFlag') }}
          </option>
          <option
            value="hook"
            :disabled="
              model.status.value?.cma?.vendorAllowed !== true &&
              model.status.value?.features?.gfpHook !== true
            "
          >
            {{ t('hugepagesLeverHook') }}
          </option>
        </select></label
      >
      <p v-if="lever !== null" class="hint">{{ t('hugepagesCmaRisk') }}</p>
      <div class="buttons">
        <AppButton
          tone="tonal"
          data-testid="hugepages-cma-trial"
          :disabled="!model.canPrepare(trial)"
          @click="model.trialCma"
          >{{ t('hugepagesCmaTrial') }}</AppButton
        ><AppButton
          data-testid="hugepages-cma-disable"
          :disabled="!model.canPrepare(disable)"
          @click="model.prepare(disable)"
          >{{ t('hugepagesCmaDisable') }}</AppButton
        >
      </div>
    </fieldset>
    <h3>{{ t('hugepagesCmaSaveHeading') }}</h3>
    <p>{{ t('hugepagesCmaSaveHint') }}</p>
    <p class="hint">{{ t('hugepagesCmaSavedMethodHint') }}</p>
    <p>
      {{
        t('hugepagesCmaSaveValues', {
          target: pageLabel(model.status.value?.actualCmaPages),
          lever: leverLabel(lever),
        })
      }}
    </p>
    <p v-if="belowSavedPool" role="status">{{ t('hugepagesCmaBelowSavedPool') }}</p>
    <AppButton
      data-testid="hugepages-cma-save"
      :disabled="!model.canPrepare(save)"
      @click="model.saveCma"
      >{{ t('hugepagesCmaSave') }}</AppButton
    >
  </section>
</template>
