<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNetworkEditor } from '../model/editor'
import { fieldValue, representable, textValue, type NetworkField } from '../model/document'
import { encodeDocument } from '../../../shared/model/configurationDocument'
import NetworkUplinks from './NetworkUplinks.vue'
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
  const input = event.target as HTMLInputElement
  editor.update(props.field, props.field.type === 'boolean' ? input.checked : input.value)
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
  <div
    class="network-field"
    :class="{ inactive: field.inactive, toggle: field.type === 'boolean' && supported }"
  >
    <label :for="`network-${field.key}`">{{ t(field.label) }}</label>
    <template v-if="supported">
      <input
        v-if="field.type === 'boolean'"
        :id="`network-${field.key}`"
        type="checkbox"
        :checked="value === true"
        :disabled="disabled"
        @change="update"
      />
      <select
        v-else-if="field.type === 'select'"
        :id="`network-${field.key}`"
        :value="text"
        :disabled="disabled"
        :aria-invalid="!!issues.length"
        @change="update"
      >
        <option v-if="!field.options?.includes(text)" :value="text">
          {{ text || t('networkDefault') }}
        </option>
        <option
          v-for="option in field.options"
          :key="option"
          :value="option"
          :disabled="option === 'dhcp_pd' && row.bridge_type === 'gvisor'"
        >
          {{ option }}
        </option>
      </select>
      <textarea
        v-else-if="field.type === 'list'"
        :id="`network-${field.key}`"
        :value="text"
        :disabled="disabled"
        rows="3"
        :aria-invalid="!!issues.length"
        spellcheck="false"
        @input="update"
      />
      <input
        v-else
        :id="`network-${field.key}`"
        type="text"
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
      ><p class="muted">{{ t('networkUnknownKept') }}</p>
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
input:not([type='checkbox']),
select,
textarea {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
input[type='checkbox'] {
  width: 22px;
  height: 22px;
  margin: 0;
  accent-color: var(--accent);
}
.toggle {
  grid-template-columns: minmax(0, 1fr) 22px;
  align-items: center;
  min-height: var(--touch-target);
}
.toggle label {
  display: flex;
  align-items: center;
  min-height: var(--touch-target);
  cursor: pointer;
}
.toggle p {
  grid-column: 1 / -1;
}
textarea {
  resize: vertical;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
p {
  margin: 0;
  font-size: var(--font-sm);
}
.error {
  color: var(--danger);
}
.inactive {
  opacity: 0.7;
}
</style>
