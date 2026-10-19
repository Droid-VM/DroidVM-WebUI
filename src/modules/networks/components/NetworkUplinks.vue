<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHostNetwork } from '../model/host'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'

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
  // A pick applies once; the menu returns to its placeholder.
  select.value = ''
  if (option && !props.disabled)
    emit('selected', { value: option.value, bridgeable: option.bridgeable })
}
onMounted(() => void host.ensure())
</script>
<template>
  <div v-if="host.supported.value" class="uplink-suggestions" :aria-busy="host.loading.value">
    <div class="uplink-picker">
      <AppSelect
        class="uplink-select"
        value=""
        :aria-label="t('networkUplinkSuggestions')"
        :disabled="disabled || host.loading.value || !options.length"
        @change="choose"
      >
        <AppOption value="">{{ t('networkUplinkSuggestions') }}</AppOption>
        <AppOption v-for="option in options" :key="option.value" :value="option.value">
          {{ option.value
          }}{{ option.name && option.name !== option.value ? ` · ${option.name}` : ''
          }}{{ !option.name ? ` · ${t('networkUplinkUnresolved')}` : '' }}
        </AppOption>
      </AppSelect>
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
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium-size);
  overflow-wrap: anywhere;
}
.uplink-picker {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.uplink-picker .uplink-select {
  flex: 1 1 180px;
  width: auto;
}
.uplink-picker {
  align-items: center;
}
p,
ul {
  margin: 0;
}
ul {
  padding-left: var(--space-4);
}
.error {
  color: var(--md-sys-color-error);
}
</style>
