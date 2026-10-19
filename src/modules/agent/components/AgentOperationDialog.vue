<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentOperations, validAgentPassword, type AgentOperation } from '../model/operations'
import AppDialog from '../../../shared/ui/AppDialog.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'

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
        <p>{{ t('agentTargetHint') }}</p>
        <AppNotice v-if="!agent.writable.value" tone="warning" :title="t('agentDiskUnavailable')" />
        <template v-if="isPassword">
          <p>{{ t('agentPasswordHint') }}</p>
          <label
            >{{ t('agentPasswordNew') }}
            <input
              v-model="password"
              type="password"
              autocomplete="new-password"
              maxlength="128"
              :disabled="!agent.writable.value"
              required
              data-testid="agent-password"
            />
          </label>
          <label
            >{{ t('agentPasswordConfirm') }}
            <input
              v-model="confirmation"
              type="password"
              autocomplete="new-password"
              maxlength="128"
              :disabled="!agent.writable.value"
              required
              data-testid="agent-password-confirm"
            />
          </label>
          <p class="muted">{{ t('agentPasswordRule', { symbols: '!@#%^*+-=_.,:?' }) }}</p>
          <p v-if="password && !validAgentPassword(password)" role="status">
            {{ t('agentPasswordInvalid') }}
          </p>
          <p v-else-if="confirmation && confirmation !== password" role="status">
            {{ t('agentPasswordMismatch') }}
          </p>
          <label v-if="!rootOnly" class="check"
            ><input v-model="normalUsers" type="checkbox" :disabled="!agent.writable.value" />
            <span>{{ t('agentNormalUsers') }}</span></label
          >
        </template>
        <p v-else>{{ t('agentGrowHint') }}</p>
        <p>{{ t('agentAutomaticCleanupHint') }}</p>
        <label v-if="allowRescue && agent.rescueSupported.value" class="check"
          ><input v-model="rescue" type="checkbox" :disabled="!agent.writable.value" /><span>{{
            t('agentRescueKeep')
          }}</span></label
        >
        <template v-if="allowRescue && rescue"
          ><p>{{ t('agentRescueKeepWarning') }}</p>
          <p>{{ t('agentRescueLifetime') }}</p></template
        >
        <label class="check"
          ><input v-model="confirmed" type="checkbox" :disabled="!agent.writable.value" />
          <span>{{ t('agentConfirmWrites') }}</span></label
        >
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
label {
  display: grid;
  gap: var(--space-2);
}
input[type='password'] {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
.check {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  min-height: 44px;
}
.check input {
  flex: 0 0 auto;
  margin-top: 4px;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
@media (max-width: 600px) {
  .buttons .btn {
    flex: 1 1 100%;
  }
}
</style>
