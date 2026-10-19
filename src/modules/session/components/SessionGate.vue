<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSession } from '../model/session'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppIcon from '../../../shared/ui/AppIcon.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import LanguageSelect from '../../../shared/ui/LanguageSelect.vue'

const { t } = useI18n()
const session = useSession()
const pairing = ref('')
if (session)
  watch(
    session.status,
    () => {
      pairing.value = ''
    },
    { flush: 'sync' },
  )
const heading = ref<HTMLElement>()
const allowed = computed(() => !session || session.status.value === 'authenticated')
const busy = computed(() =>
  ['checking', 'authenticating', 'signing-out'].includes(session?.status.value ?? ''),
)
const title = computed(() => {
  if (session?.status.value === 'logout-error') return 'sessionLogoutUncertain'
  if (session?.status.value === 'signing-out') return 'sessionSigningOut'
  if (session?.status.value === 'checking') return 'sessionChecking'
  return 'sessionLoginTitle'
})
watch(allowed, async () => {
  pairing.value = ''
  await nextTick()
  if (!allowed.value) heading.value?.focus({ preventScroll: true })
  else document.querySelector<HTMLElement>('#main')?.focus({ preventScroll: true })
})
async function login() {
  const token = pairing.value.trim()
  pairing.value = ''
  await session?.login(token)
}
onUnmounted(() => {
  pairing.value = ''
})
</script>

<template>
  <slot v-if="allowed" />
  <main v-else id="main" class="login-screen" tabindex="-1">
    <section class="login-card" :aria-busy="busy" aria-labelledby="login-title">
      <div class="login-brand"><AppIcon name="vm" /><span>DroidVM</span></div>
      <h1 id="login-title" ref="heading" tabindex="-1">{{ t(title) }}</h1>
      <p v-if="busy" role="status" class="muted">{{ t('sessionWait') }}</p>
      <template v-else>
        <AppNotice
          v-if="session?.status.value === 'logout-error'"
          :title="t('sessionLogoutUncertain')"
          tone="warning"
        >
          <p>{{ t('sessionLogoutUncertainHint') }}</p>
          <AppButton tone="tonal" @click="session.logout()">{{
            t('sessionRetryLogout')
          }}</AppButton>
        </AppNotice>
        <template v-else>
          <AppNotice
            v-if="session?.loginUncertain.value"
            :title="t('sessionLoginUncertain')"
            tone="warning"
          >
            {{ t('sessionLoginUncertainHint') }}
          </AppNotice>
          <AppNotice
            v-if="session?.problem.value"
            :title="t(session.problem.value.titleKey)"
            tone="error"
          >
            {{
              t(
                session.problem.value.code === 'unauthenticated'
                  ? 'sessionPairingRejected'
                  : session.problem.value.descriptionKey,
              )
            }}
          </AppNotice>
          <p v-else-if="session?.expired.value" role="status" class="muted">
            {{ t('sessionExpiredHint') }}
          </p>
          <form v-if="session?.status.value === 'anonymous'" @submit.prevent="login">
            <p class="muted">{{ t('sessionLoginHint') }}</p>
            <label for="pairing-token">{{ t('sessionPairingLabel') }}</label>
            <input
              id="pairing-token"
              v-model="pairing"
              type="password"
              autocomplete="off"
              autocapitalize="none"
              :spellcheck="false"
              required
              minlength="64"
              maxlength="64"
              pattern="[0-9a-f]{64}"
              :title="t('sessionPairingFormat')"
              aria-describedby="pairing-hint"
            />
            <small id="pairing-hint" class="muted">{{ t('sessionPairingFormat') }}</small>
            <AppButton type="submit" tone="primary">{{ t('sessionLogin') }}</AppButton>
          </form>
          <AppButton @click="session?.restore()">{{ t('sessionCheck') }}</AppButton>
        </template>
      </template>
      <div class="login-preferences"><LanguageSelect /></div>
    </section>
  </main>
</template>

<style scoped>
.login-screen {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: max(var(--space-4), env(safe-area-inset-top))
    max(var(--space-3), env(safe-area-inset-right)) max(var(--space-4), env(safe-area-inset-bottom))
    max(var(--space-3), env(safe-area-inset-left));
}
.login-card {
  width: 100%;
  max-width: 460px;
  padding: var(--space-6);
  border: 1px solid var(--line);
  border-radius: var(--radius-dialog);
  background: var(--surface);
  overflow-wrap: anywhere;
}
.login-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--accent);
  font-size: var(--font-heading);
  font-weight: 700;
}
h1 {
  font-size: var(--font-mobile-title);
  margin: var(--space-6) 0 var(--space-4);
}
form {
  display: grid;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
form p {
  margin: 0 0 var(--space-2);
  line-height: 1.6;
}
input {
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--soft);
  color: var(--ink);
  font-size: 1rem;
}
.login-preferences {
  margin-top: var(--space-5);
  border-top: 1px solid var(--line);
}
.login-preferences :deep(.menu-row) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  padding-inline: 0;
}
.login-preferences :deep(select) {
  width: 100%;
  max-width: 100%;
}
@media (max-width: 360px) {
  .login-card {
    padding: var(--space-4);
  }
}
</style>
