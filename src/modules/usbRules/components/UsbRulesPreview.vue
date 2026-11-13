<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsbRulesEditor } from '../model/editor'
import { deviceSubject, ruleLayers, type RuleLayer } from '../model/document'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import SearchField from '../../../shared/ui/SearchField.vue'

const editor = useUsbRulesEditor(),
  { t, locale } = useI18n()
const emit = defineEmits<{ locate: [layer: RuleLayer, index: number] }>()
const query = ref(''),
  page = ref(0),
  pageSize = 20
const filtered = computed(() =>
  (editor.previewData.value?.items ?? []).filter(({ device }) =>
    [
      device.product,
      device.sysfs,
      device.serial,
      deviceSubject(device).id,
      device.owner?.vmName,
      device.owner?.vmId,
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.value.trim().toLocaleLowerCase()),
  ),
)
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const rows = computed(() =>
  filtered.value.slice(page.value * pageSize, (page.value + 1) * pageSize),
)
const observedAt = computed(() =>
  new Date(editor.previewTime.value).toLocaleTimeString(locale.value),
)
watch([query, editor.previewData], () => {
  page.value = 0
})
const name = (id: string) => editor.targets.value.find((vm) => vm.vmId === id)?.vmName || id
const label = (layer: RuleLayer) => t(ruleLayers.find((value) => value.key === layer)!.label)
</script>

<template>
  <section
    v-if="editor.previewSupported.value"
    class="rules-preview"
    :aria-label="t('usbRulesPreviewTitle')"
  >
    <h2>{{ t('usbRulesPreviewTitle') }}</h2>
    <AppButton :disabled="!editor.canPreview.value" @click="editor.preview">{{
      t(editor.previewLoading.value ? 'processing' : 'usbRulesPreviewRead')
    }}</AppButton>
    <p v-if="editor.dirty.value" class="muted">{{ t('usbRulesPreviewDirty') }}</p>
    <AppNotice
      v-if="editor.previewProblem.value"
      tone="warning"
      :title="t(editor.previewProblem.value.titleKey)"
    >
      <p>{{ t(editor.previewProblem.value.descriptionKey) }}</p>
      <p v-if="editor.previewProblem.value.code === 'conflict'">
        {{ t('usbRulesPreviewConflict') }}
      </p>
    </AppNotice>
    <template v-if="editor.previewData.value">
      <p class="muted" role="status">{{ t('usbRulesPreviewSnapshot', { time: observedAt }) }}</p>
      <SearchField
        v-model="query"
        :label="t('resourceSearch')"
        :placeholder="t('resourceSearch')"
      />
      <p v-if="!filtered.length" class="muted">
        {{ t(query.trim() ? 'usbNoMatches' : 'usbNoDevices') }}
      </p>
      <article v-for="item in rows" :key="item.device.id" :data-preview-device="item.device.id">
        <h3>{{ item.device.product || deviceSubject(item.device).id }}</h3>
        <p class="muted">{{ item.device.sysfs }} · {{ deviceSubject(item.device).id }}</p>
        <template v-if="item.match">
          <p>
            {{
              item.match.layer
                ? t('usbRulesPreviewMatch', {
                    layer: label(item.match.layer),
                    number: item.match.index + 1,
                  })
                : t('usbRulesPreviewDefault')
            }}
          </p>
          <p>
            {{ t('usbTarget') }}：{{
              item.match.target === 'vm'
                ? name(item.match.vmId!)
                : t(item.match.target === 'host' ? 'usbTargetHost' : 'usbRulesTargetSink')
            }}<span v-if="item.match.target === 'vm'">
              · {{ item.match.controllerId || t('usbRulesDefaultController') }}</span
            >
          </p>
          <AppButton
            v-if="item.match.layer"
            @click="emit('locate', item.match.layer, item.match.index)"
            >{{ t('usbRulesPreviewLocate') }}</AppButton
          >
        </template>
        <p v-else>{{ t('usbRulesPreviewDisabled') }}</p>
        <p v-if="item.eligible" class="eligible">{{ t('usbRulesPreviewEligible') }}</p>
        <template v-else-if="editor.previewData.value.enabled">
          <p v-if="item.device.locked" class="muted">
            {{ t('usbLocked') }} · {{ t('usbRulesPreviewSkipped') }}
          </p>
          <p v-if="item.device.state === 'claimed'" class="muted">
            {{ t('usbStateClaimed') }} ·
            {{
              item.device.owner
                ? item.device.owner.vmName || item.device.owner.vmId
                : t('usbOwnerUnknown')
            }}
          </p>
        </template>
      </article>
      <div v-if="pages > 1" class="pagination">
        <AppButton :disabled="page === 0" @click="page--">{{ t('usbRulesPrevious') }}</AppButton>
        <span>{{ t('usbRulesPage', { page: page + 1, total: pages }) }}</span>
        <AppButton :disabled="page + 1 === pages" @click="page++">{{
          t('usbRulesNext')
        }}</AppButton>
      </div>
    </template>
  </section>
</template>

<style scoped>
.rules-preview {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.rules-preview > .btn {
  justify-self: start;
}
h2,
h3,
p {
  margin: 0;
  overflow-wrap: anywhere;
}
h2 {
  font-size: 1.125rem;
}
h3 {
  font-size: var(--md-sys-typescale-title-medium-size);
}
article {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  padding: var(--space-3);
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  background: var(--app-color-card);
}
article .btn {
  justify-self: start;
}
.eligible {
  color: var(--app-color-success);
}
.pagination {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
