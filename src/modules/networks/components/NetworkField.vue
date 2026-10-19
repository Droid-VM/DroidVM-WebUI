<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNetworkEditor } from '../model/editor'
import { fieldValue, representable, textValue, type NetworkField } from '../model/document'
import { encodeDocument } from '../../../shared/model/configurationDocument'
import NetworkUplinks from './NetworkUplinks.vue'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'
import AppSwitch from '../../../shared/ui/AppSwitch.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'
const props = defineProps<{ field: NetworkField }>()
const editor = useNetworkEditor(),
  { t } = useI18n()
const row = computed(() => editor.draft.value!),
  value = computed(() => fieldValue(row.value, props.field))
const supported = computed(() => representable(row.value, props.field))
const text = computed(
  () => editor.buffers.value[props.field.key] ?? textValue(row.value, props.field),
)
const disabled = computed(() => !editor.editable.value || props.field.inactive || !supported.value)
const issues = computed(() => editor.issues.value.filter((item) => item.path === props.field.key))
function update(event: Event) {
  editor.update(props.field, (event.target as HTMLInputElement).value)
}
function toggle(selected: boolean) {
  editor.update(props.field, selected)
}
function chooseUplink(value: { value: string; bridgeable: boolean }) {
  editor.update(props.field, value.value)
  const pseudo = {
    key: 'l2.pseudo_bridge',
    label: 'networkPseudoBridge' as const,
    type: 'boolean' as const,
  }
  if (props.field.key === 'l2.uplink' && !value.bridgeable && representable(row.value, pseudo))
    editor.update(pseudo, true)
}
</script>
<template>
  <div class="network-field" :class="{ inactive: field.inactive }">
    <template v-if="supported">
      <AppSwitch
        v-if="field.type === 'boolean'"
        :selected="value === true"
        :disabled="disabled"
        @update:model-value="toggle"
        >{{ t(field.label) }}</AppSwitch
      >
      <AppSelect
        v-else-if="field.type === 'select'"
        :label="t(field.label)"
        :value="text"
        :disabled="disabled"
        :aria-invalid="!!issues.length"
        @change="update"
      >
        <AppOption v-if="!field.options?.includes(text)" :value="text">
          {{ text || t('networkDefault') }}
        </AppOption>
        <AppOption
          v-for="option in field.options"
          :key="option"
          :value="option"
          :disabled="option === 'dhcp_pd' && row.bridge_type === 'gvisor'"
        >
          {{ option }}
        </AppOption>
      </AppSelect>
      <AppTextField
        v-else-if="field.type === 'list'"
        type="textarea"
        :label="t(field.label)"
        :value="text"
        :disabled="disabled"
        rows="3"
        :aria-invalid="!!issues.length"
        spellcheck="false"
        @input="update"
      />
      <AppTextField
        v-else
        type="text"
        :label="t(field.label)"
        :inputmode="field.type === 'integer' ? 'numeric' : undefined"
        :value="text"
        :disabled="disabled"
        :aria-invalid="!!issues.length"
        autocomplete="off"
        spellcheck="false"
        @input="update"
      />
    </template>
    <template v-else
      ><span>{{ t(field.label) }}</span>
      <p class="muted">{{ t('networkUnknownKept') }}</p>
      <pre>{{ encodeDocument(value) }}</pre>
    </template>
    <p v-if="field.inactive" class="muted">{{ t('networkInactiveKept') }}</p>
    <NetworkUplinks
      v-if="
        supported &&
        !field.inactive &&
        (field.key === 'l2.uplink' || field.key.endsWith('.ipv6.pd.uplink'))
      "
      :model-value="text"
      :disabled="disabled"
      @selected="chooseUplink"
    />
    <p v-for="issue in issues" :key="issue.message" class="error">{{ t(issue.message) }}</p>
  </div>
</template>
<style scoped>
.network-field {
  display: grid;
  align-content: start;
  gap: var(--space-2);
  min-width: 0;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
p {
  margin: 0;
  font-size: var(--md-sys-typescale-body-medium-size);
}
.error {
  color: var(--md-sys-color-error);
}
.inactive {
  opacity: 0.7;
}
</style>
