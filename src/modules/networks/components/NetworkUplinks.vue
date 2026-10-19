<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHostNetwork } from '../model/host'
import AppButton from '../../../shared/ui/AppButton.vue'

const props = defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{
  selected: [value: { value: string; bridgeable: boolean }]
}>()
const host = useHostNetwork(),
  { t } = useI18n()
const options = computed(() => {
  const data = host.data.value
  if (!data) return []
  return [
    ...data.uplinks.identifiers.map((item) => ({
      value: item.id,
      name: item.name,
      bridgeable: item.bridgeable,
    })),
    ...data.uplinks.devices
      .filter((item) => !data.uplinks.identifiers.some((id) => id.id === item.name))
      .map((item) => ({ value: item.name, name: item.name, bridgeable: item.bridgeable })),
  ]
})
const selected = computed(() => options.value.find((item) => item.value === props.modelValue))
const interfaceName = computed(() => selected.value?.name ?? props.modelValue)
const observedInterface = computed(() =>
  host.data.value?.interfaces.find((item) => item.name === interfaceName.value),
)
const addresses = computed(
  () =>
    host.data.value?.addresses.filter((item) => item.interfaceName === interfaceName.value) ?? [],
)
function choose(event: Event) {
  const select = event.target as HTMLSelectElement
  const option = options.value.find((item) => item.value === select.value)
  select.value = ''
  if (option && !props.disabled)
    emit('selected', { value: option.value, bridgeable: option.bridgeable })
}
onMounted(() => void host.ensure())
</script>
<template>
  <div v-if="host.supported.value" class="uplink-suggestions" :aria-busy="host.loading.value">
    <div class="uplink-picker">
      <select
        value=""
        :aria-label="t('networkUplinkSuggestions')"
        :disabled="disabled || host.loading.value || !options.length"
        @change="choose"
      >
        <option value="">{{ t('networkUplinkSuggestions') }}</option>
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.value
          }}{{ option.name && option.name !== option.value ? ` · ${option.name}` : ''
          }}{{ !option.name ? ` · ${t('networkUplinkUnresolved')}` : '' }}
        </option>
      </select>
      <AppButton :disabled="host.loading.value" @click="host.refresh">{{
        t('refreshList')
      }}</AppButton>
    </div>
    <p v-if="host.loading.value" role="status">{{ t('processing') }}</p>
    <p v-if="host.problem.value" class="error" role="status">
      {{ t(host.problem.value.titleKey) }} · {{ t('networkUplinkDiscoveryFailed') }}
    </p>
    <p v-else-if="host.data.value && !options.length">{{ t('networkUplinkNoSuggestions') }}</p>
    <p v-if="selected && !selected.name">{{ t('networkUplinkUnresolvedHint') }}</p>
    <p v-if="selected && !selected.bridgeable">{{ t('networkUplinkPseudoRequired') }}</p>
    <p v-if="observedInterface">
      {{ observedInterface.name }} · {{ observedInterface.state }}
      <span v-if="observedInterface.master">
        · {{ t('networkUplinkMaster', { name: observedInterface.master }) }}</span
      >
    </p>
    <ul v-if="addresses.length" :aria-label="t('networkUplinkAddresses')">
      <li v-for="address in addresses" :key="`${address.family}:${address.address}`">
        IPv{{ address.family }} · {{ address.address }}
      </li>
    </ul>
    <p>{{ t('networkUplinkCustomHint') }}</p>
  </div>
</template>
<style scoped>
.uplink-suggestions {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  color: var(--muted);
  font-size: var(--font-sm);
  overflow-wrap: anywhere;
}
.uplink-picker {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
select {
  flex: 1 1 180px;
  min-width: 0;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
p,
ul {
  margin: 0;
}
ul {
  padding-left: var(--space-4);
}
.error {
  color: var(--danger);
}
</style>
