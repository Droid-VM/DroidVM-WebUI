<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentOperations, validAgentPassword, type AgentOperation } from '../model/operations'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppCheckbox from '../../../shared/ui/AppCheckbox.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'

const props = withDefaults(defineProps<{ rootOnly?: boolean; allowRescue?: boolean }>(), {
  rootOnly: false,
  allowRescue: true,
})
const { t } = useI18n()
const agent = useAgentOperations()
const password = ref(''),
  confirmation = ref(''),
  normalUsers = ref(false),
  rescue = ref(false),
  confirmed = ref(false)
const isPassword = computed(() => agent.action.value === 'chpasswd')
const valid = computed(
  () =>
    !isPassword.value ||
    (validAgentPassword(password.value) && password.value === confirmation.value),
)
function clear() {
  password.value = ''
  confirmation.value = ''
  normalUsers.value = false
  rescue.value = false
  confirmed.value = false
}
function close() {
  clear()
  agent.close()
}
function submit() {
  const detail = agent.preparation.value?.detail
  if (!detail || !valid.value || !confirmed.value || !agent.allowed.value || !agent.writable.value)
    return
  const operation: AgentOperation = isPassword.value
    ? {
        action: 'chpasswd',
        diskId: detail.disk.id,
        password: password.value,
        normalUsers: props.rootOnly ? false : normalUsers.value,
      }
    : { action: 'autogrow', diskId: detail.disk.id }
  const keepRescue = props.allowRescue && rescue.value && agent.rescueSupported.value
  clear()
  void agent.submit(operation, keepRescue)
}
watch(
  agent.open,
  (value) => {
    if (!value) clear()
  },
  { flush: 'sync' },
)
onBeforeUnmount(clear)
</script>
<template>
  <AppDialog
    :open="agent.open.value"
    :title="t(isPassword ? 'agentPasswordTitle' : 'agentGrowTitle')"
    @close="close"
  >
    <form class="agent-form" autocomplete="off" @submit.prevent="submit">
      <p v-if="agent.loading.value" role="status">{{ t('processing') }}</p>
      <AppNotice v-if="agent.problem.value" tone="error" :title="t(agent.problem.value.titleKey)">
        <p>{{ t(agent.problem.value.descriptionKey) }}</p>
      </AppNotice>
      <template v-if="agent.preparation.value">
        <strong>{{
          agent.preparation.value.detail.disk.name || agent.preparation.value.detail.disk.id
        }}</strong>
        <p class="path">{{ agent.preparation.value.detail.disk.path }}</p>
        <AppNotice v-if="!agent.writable.value" tone="warning" :title="t('agentDiskUnavailable')" />
        <template v-if="isPassword">
          <AppTextField
            v-model="password"
            :label="t('agentPasswordNew')"
            type="password"
            autocomplete="new-password"
            maxlength="128"
            :disabled="!agent.writable.value"
            required
            data-testid="agent-password"
          />
          <AppTextField
            v-model="confirmation"
            :label="t('agentPasswordConfirm')"
            type="password"
            autocomplete="new-password"
            maxlength="128"
            :disabled="!agent.writable.value"
            required
            data-testid="agent-password-confirm"
          />
          <p class="muted">{{ t('agentPasswordRule', { symbols: '!@#%^*+-=_.,:?' }) }}</p>
          <p v-if="password && !validAgentPassword(password)" role="status">
            {{ t('agentPasswordInvalid') }}
          </p>
          <p v-else-if="confirmation && confirmation !== password" role="status">
            {{ t('agentPasswordMismatch') }}
          </p>
          <AppCheckbox v-if="!rootOnly" v-model="normalUsers" :disabled="!agent.writable.value">{{
            t('agentNormalUsers')
          }}</AppCheckbox>
        </template>
        <AppCheckbox
          v-if="allowRescue && agent.rescueSupported.value"
          v-model="rescue"
          :disabled="!agent.writable.value"
          >{{ t('agentRescueKeep') }}</AppCheckbox
        >
        <template v-if="allowRescue && rescue"
          ><p>{{ t('agentRescueKeepWarning') }}</p>
          <p>{{ t('agentRescueLifetime') }}</p></template
        >
        <AppCheckbox v-model="confirmed" :disabled="!agent.writable.value">{{
          t('agentConfirmWrites')
        }}</AppCheckbox>
      </template>
      <div class="buttons">
        <AppButton @click="close">{{ t('cancel') }}</AppButton>
        <AppButton
          type="submit"
          tone="primary"
          :disabled="!agent.allowed.value || !agent.writable.value || !valid || !confirmed"
          data-testid="agent-submit"
          >{{ t(isPassword ? 'agentPasswordTitle' : 'agentGrowTitle') }}</AppButton
        >
      </div>
    </form>
  </AppDialog>
</template>
<style scoped>
.agent-form {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
p {
  margin: 0;
  overflow-wrap: anywhere;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
@media (width < 600px) {
  .buttons .btn {
    flex: 1 1 100%;
  }
}
</style>
