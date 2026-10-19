<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Hugepages } from '../model/hugepages'
import { useHugepageFormatting } from './format'
import AppButton from '../../../shared/ui/AppButton.vue'
defineProps<{ model: Hugepages }>()
const { t } = useI18n(),
  { flag } = useHugepageFormatting()
</script>
<template>
  <section
    id="hugepages-module"
    class="panel"
    data-testid="hugepages-group-module"
    aria-labelledby="hugepages-module-heading"
  >
    <h2 id="hugepages-module-heading">{{ t('hugepagesGroupModule') }}</h2>
    <p>{{ t('hugepagesModuleHint') }}</p>
    <dl class="facts">
      <div>
        <dt>{{ t('hugepagesLoaded') }}</dt>
        <dd>{{ flag(model.status.value?.loaded) }}</dd>
      </div>
      <div>
        <dt>{{ t('hugepagesBoot') }}</dt>
        <dd>{{ flag(model.status.value?.bootEnabled) }}</dd>
      </div>
    </dl>
    <p v-if="model.status.value?.consumerCount" class="hint">
      {{ t('hugepagesConsumersBlockStop') }}
    </p>
    <div class="buttons">
      <AppButton
        data-testid="hugepages-runtime-enable"
        tone="tonal"
        :disabled="!model.canPrepare({ kind: 'runtime', enabled: true })"
        @click="model.prepare({ kind: 'runtime', enabled: true })"
        >{{ t('hugepagesRuntimeEnable') }}</AppButton
      >
      <AppButton
        data-testid="hugepages-runtime-disable"
        :disabled="!model.canPrepare({ kind: 'runtime', enabled: false })"
        @click="model.prepare({ kind: 'runtime', enabled: false })"
        >{{ t('hugepagesRuntimeDisable') }}</AppButton
      >
      <AppButton
        data-testid="hugepages-unload"
        :disabled="!model.canPrepare({ kind: 'unload' })"
        @click="model.prepare({ kind: 'unload' })"
        >{{ t('hugepagesUnload') }}</AppButton
      >
    </div>
    <h3>{{ t('hugepagesBoot') }}</h3>
    <p>{{ t('hugepagesBootHint') }}</p>
    <div class="buttons">
      <AppButton
        data-testid="hugepages-boot-enable"
        :disabled="
          model.status.value?.bootEnabled === true ||
          !model.canPrepare({ kind: 'boot', enabled: true })
        "
        @click="model.prepare({ kind: 'boot', enabled: true })"
        >{{ t('hugepagesBootEnable') }}</AppButton
      >
      <AppButton
        data-testid="hugepages-boot-disable"
        :disabled="
          model.status.value?.bootEnabled === false ||
          !model.canPrepare({ kind: 'boot', enabled: false })
        "
        @click="model.prepare({ kind: 'boot', enabled: false })"
        >{{ t('hugepagesBootDisable') }}</AppButton
      >
    </div>
  </section>
</template>
