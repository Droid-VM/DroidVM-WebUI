<script setup lang="ts">
import { onBeforeUnmount, provide, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { LinuxVmWizardPanel, useLinuxVmWizard } from '../modules/linuxVm'
import { diskActionsKey } from '../modules/resources'
import { agentOperationsKey } from '../modules/agent'
import { configurationEditorKey } from '../modules/configuration'
import ConfirmDialog from '../shared/ui/ConfirmDialog.vue'
const wizard = useLinuxVmWizard(),
  { t } = useI18n(),
  router = useRouter()
provide(diskActionsKey, wizard.diskActions)
provide(agentOperationsKey, wizard.agent)
provide(configurationEditorKey, wizard.editor)
const destination = ref('')
let allowLeave = false
onBeforeRouteLeave((to) => {
  if (!allowLeave && wizard.hasWork.value && !wizard.completed.value) {
    destination.value = to.fullPath
    return false
  }
})
function leave() {
  allowLeave = true
  void router.push(destination.value)
}
onBeforeUnmount(wizard.leave)
</script>
<template>
  <div class="linux-vm-page">
    <RouterLink to="/vms">{{ t('navVms') }}</RouterLink
    ><LinuxVmWizardPanel /><ConfirmDialog
      :open="!!destination"
      :title="t('linuxVmLeaveTitle')"
      :description="t('linuxVmLeaveHint')"
      :confirm-label="t('close')"
      @cancel="destination = ''"
      @confirm="leave"
    />
  </div>
</template>
<style scoped>
.linux-vm-page {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
