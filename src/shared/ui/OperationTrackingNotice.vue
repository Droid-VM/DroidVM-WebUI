<script setup lang="ts">
import AppLinkButton from './AppLinkButton.vue'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppNotice from './AppNotice.vue'
import AppButton from './AppButton.vue'
import AppCheckbox from './AppCheckbox.vue'

const props = defineProps<{ problem: 'invalid' | 'unavailable' | null }>()
const emit = defineEmits<{ clear: [] }>()
const { t } = useI18n()
const confirmed = ref(false)
watch(
  () => props.problem,
  () => {
    confirmed.value = false
  },
)
function clear() {
  if (!props.problem || !confirmed.value) return
  confirmed.value = false
  emit('clear')
}
</script>

<template>
  <AppNotice
    v-if="problem"
    tone="warning"
    :title="t('operationTrackingTitle')"
    data-testid="operation-tracking-notice"
    :data-state="problem"
  >
    <div class="tracking-content">
      <p>
        {{ t(problem === 'invalid' ? 'operationTrackingInvalid' : 'operationTrackingUnavailable') }}
      </p>
      <p>{{ t('operationTrackingHint') }}</p>
      <AppLinkButton tone="tonal" to="/tasks">{{ t('diskTaskLink') }}</AppLinkButton>
      <AppCheckbox v-model="confirmed" data-testid="operation-tracking-confirm">{{
        t('operationTrackingConfirm')
      }}</AppCheckbox>
      <AppButton data-testid="operation-tracking-clear" :disabled="!confirmed" @click="clear">
        {{ t('operationTrackingClear') }}
      </AppButton>
    </div>
  </AppNotice>
</template>

<style scoped>
.tracking-content {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  overflow-wrap: anywhere;
}
p {
  margin: 0;
}
.btn {
  justify-self: start;
}
</style>
