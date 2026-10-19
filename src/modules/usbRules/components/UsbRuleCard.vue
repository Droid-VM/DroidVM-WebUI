<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UsbRule, UsbRuleTarget } from '../api/gateway'
import { deviceSubject, ruleIssues, ruleLayers, type RuleLayer } from '../model/document'
import type { UsbDevice } from '../../resources'
import AppButton from '../../../shared/ui/AppButton.vue'

const props = defineProps<{
  layer: RuleLayer
  index: number
  count: number
  rule: Readonly<UsbRule>
  targets: readonly UsbRuleTarget[]
  devices: readonly UsbDevice[]
  disabled: boolean
}>()
const emit = defineEmits<{ update: [rule: UsbRule]; remove: []; move: [direction: -1 | 1] }>()
const { t } = useI18n()
const definition = computed(() => ruleLayers.find((layer) => layer.key === props.layer)!)
const issues = computed(() => ruleIssues(props.layer, props.rule))
const currentVm = computed(() => props.targets.find((target) => target.vmId === props.rule.vm))
const unavailableVm = computed(
  () => !!props.rule.vm && (!currentVm.value || !currentVm.value.controllerId),
)
const oldController = computed(
  () => !!props.rule.controller && props.rule.controller !== currentVm.value?.controllerId,
)
const fieldId = (field: string) => `usb-rule-${props.layer}-${props.index}-${field}`
function value(event: Event) {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}
function update(field: 'id' | 'port' | 'controller', text: string) {
  const next = { ...props.rule }
  if (field === 'controller' && !text) delete next.controller
  else next[field] = text
  emit('update', next)
}
function target(text: string) {
  if (!['host', 'vm', 'sink'].includes(text)) return
  const next: UsbRule = { ...props.rule, target: text as UsbRule['target'] }
  delete next.vm
  delete next.controller
  if (next.target === 'vm') next.vm = ''
  emit('update', next)
}
function vm(text: string) {
  const next = { ...props.rule, vm: text }
  delete next.controller
  const found = props.targets.find((item) => item.vmId === text)
  if (found?.controllerId) next.controller = found.controllerId
  emit('update', next)
}
function pick(event: Event) {
  const device = props.devices.find((item) => item.id === value(event))
  if (device) {
    const subject = deviceSubject(device)
    emit('update', {
      ...props.rule,
      ...(definition.value.id ? { id: subject.id } : {}),
      ...(definition.value.port ? { port: subject.port } : {}),
    })
  }
  ;(event.target as HTMLSelectElement).value = ''
}
</script>

<template>
  <article class="rule-card" :data-rule="`${layer}-${index}`" tabindex="-1">
    <header>
      <h3>{{ t('usbRulesNumber', { number: index + 1 }) }}</h3>
      <div class="rule-actions">
        <AppButton
          :disabled="disabled || index === 0"
          :aria-label="t('usbRulesMoveUp')"
          @click="emit('move', -1)"
          >↑</AppButton
        >
        <AppButton
          :disabled="disabled || index + 1 === count"
          :aria-label="t('usbRulesMoveDown')"
          @click="emit('move', 1)"
          >↓</AppButton
        >
        <AppButton :disabled="disabled" @click="emit('remove')">{{
          t('usbRulesRemove')
        }}</AppButton>
      </div>
    </header>
    <fieldset :disabled="disabled">
      <legend class="sr-only">{{ t('usbRulesNumber', { number: index + 1 }) }}</legend>
      <label v-if="definition.id || definition.port">
        {{ t('usbRulesPickDevice') }}
        <select value="" @change="pick">
          <option value="">{{ t('usbRulesCustom') }}</option>
          <option v-for="device in devices" :key="device.id" :value="device.id">
            {{ device.product || `${device.vendorId}:${device.productId}` }} · {{ device.sysfs
            }}{{ device.serial ? ` · ${device.serial}` : '' }}
          </option>
        </select>
      </label>
      <label v-if="definition.id">
        {{ t('usbRulesId') }}
        <input
          :id="fieldId('id')"
          :aria-label="t('usbRulesId')"
          :value="rule.id"
          spellcheck="false"
          autocomplete="off"
          :aria-invalid="issues.some((issue) => issue.field === 'id')"
          :aria-describedby="`${fieldId('id')}-hint`"
          @input="update('id', value($event))"
        />
        <small :id="`${fieldId('id')}-hint`">{{ t('usbRulesIdHint') }}</small>
      </label>
      <label v-if="definition.port">
        {{ t('usbRulesPortPath') }}
        <input
          :id="fieldId('port')"
          :value="rule.port"
          spellcheck="false"
          autocomplete="off"
          :aria-invalid="issues.some((issue) => issue.field === 'port')"
          @input="update('port', value($event))"
        />
      </label>
      <label>
        {{ t('usbTarget') }}
        <select :id="fieldId('target')" :value="rule.target" @change="target(value($event))">
          <option v-if="layer !== 'any' || rule.target === 'host'" value="host">
            {{ t('usbTargetHost') }}
          </option>
          <option value="vm">{{ t('usbRulesTargetVm') }}</option>
          <option value="sink">{{ t('usbRulesTargetSink') }}</option>
        </select>
      </label>
      <template v-if="rule.target === 'vm'">
        <label>
          {{ t('usbRulesVm') }}
          <select
            :id="fieldId('vm')"
            :value="rule.vm || ''"
            :aria-invalid="!rule.vm"
            @change="vm(value($event))"
          >
            <option value="" disabled>{{ t('usbRulesChooseVm') }}</option>
            <option v-if="rule.vm && !currentVm" :value="rule.vm">
              {{ t('usbRulesMissingVm', { id: rule.vm }) }}
            </option>
            <option
              v-for="item in targets"
              :key="item.vmId"
              :value="item.vmId"
              :disabled="!item.controllerId"
            >
              {{ item.vmName || item.vmId
              }}{{ !item.controllerId ? ` · ${t('usbRulesNoController')}` : '' }}
            </option>
          </select>
        </label>
        <label>
          {{ t('configControllerId') }}
          <select
            :id="fieldId('controller')"
            :value="rule.controller ?? ''"
            @change="update('controller', value($event))"
          >
            <option value="">{{ t('usbRulesDefaultController') }}</option>
            <option v-if="currentVm?.controllerId" :value="currentVm.controllerId">
              {{ currentVm.controllerId }}
            </option>
            <option v-if="oldController" :value="rule.controller">
              {{ t('usbRulesOldController', { id: rule.controller }) }}
            </option>
          </select>
        </label>
        <p v-if="unavailableVm || oldController" class="reference-warning">
          {{ t('usbRulesReferenceHint') }}
        </p>
      </template>
      <ul v-if="issues.length" class="rule-errors">
        <li v-for="issue in issues" :key="issue.field">{{ t(issue.message) }}</li>
      </ul>
    </fieldset>
  </article>
</template>

<style scoped>
.rule-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  padding: var(--space-3);
  min-width: 0;
  overflow-wrap: anywhere;
}
header,
.rule-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
header {
  justify-content: space-between;
}
h3 {
  margin: 0;
  font-size: var(--font-body);
}
fieldset {
  border: 0;
  padding: 0;
  margin: var(--space-3) 0 0;
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
label {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
input,
select {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
small {
  color: var(--muted);
}
.rule-errors {
  color: var(--danger);
  padding-left: var(--space-4);
  margin: 0;
}
.reference-warning {
  color: var(--warn);
  margin: 0;
}
@media (min-width: 760px) {
  fieldset {
    grid-template-columns: 1fr 1fr;
  }
  .rule-errors,
  .reference-warning {
    grid-column: 1 / -1;
  }
}
</style>
