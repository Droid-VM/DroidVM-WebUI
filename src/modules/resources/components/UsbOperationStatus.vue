<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useUsbActions } from '../model/usbOperations'
import { taskStateKeys } from '../../tasks'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'

const { t } = useI18n(),
  actions = useUsbActions()
</script>

<template>
  <OperationTrackingNotice
    :problem="actions.recoveryProblem.value"
    @clear="actions.clearTracking"
  />
  <section
    v-if="Object.keys(actions.entries.value).length"
    :aria-label="t('usbOperations')"
    class="usb-operations"
  >
    <AppButton :disabled="actions.checking.value" @click="actions.reconcile">{{
      t('queryStatus')
    }}</AppButton>
    <article
      v-for="entry in actions.entries.value"
      :key="entry.request.requestId"
      :data-usb-operation="entry.request.deviceId"
    >
      <p>{{ t('usbChangeTarget') }} · {{ entry.request.deviceId }}</p>
      <p v-if="entry.restored" data-testid="operation-tracking-restored">
        {{ t('operationTrackingHint') }}
      </p>
      <p v-if="entry.state === 'unknown'" role="status">{{ t('vmOperationUnknown') }}</p>
      <p v-else-if="entry.state === 'posting'" role="status">{{ t('processing') }}</p>
      <p v-if="entry.task" role="status">
        {{ t(taskStateKeys[entry.task.state])
        }}<span v-if="entry.task.errorCode"> · {{ entry.task.errorCode }}</span>
      </p>
      <p v-if="entry.task && entry.state === 'waiting'" class="muted">
        {{ t('usbAwaitObservation') }}
      </p>
      <p v-if="entry.state === 'done' && entry.task?.state === 'succeeded'" class="muted">
        {{ t('usbTargetDone') }}
      </p>
      <AppNotice v-if="entry.problem" tone="error" :title="t(entry.problem.titleKey)"
        ><p>{{ t(entry.problem.descriptionKey) }}</p></AppNotice
      >
    </article>
  </section>
</template>

<style scoped>
.usb-operations {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
article {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: var(--space-3);
  overflow-wrap: anywhere;
}
p {
  margin: var(--space-2) 0;
}
.btn {
  justify-self: start;
}
</style>
