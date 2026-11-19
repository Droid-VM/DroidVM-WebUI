<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UsbRule, UsbRuleTarget } from '../api/gateway'
import { deviceSubject, ruleIssues, ruleLayers, type RuleLayer } from '../model/document'
import type { UsbDevice } from '../../resources'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppOption from '../../../shared/ui/AppOption.vue'
import AppSelect from '../../../shared/ui/AppSelect.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'

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
function update(field: 'id' | 'port' | 'class' | 'controller', text: string) {
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
  // A pick fills the fields once; the menu returns to its placeholder.
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
      <AppSelect
        v-if="definition.id || definition.port"
        :label="t('usbRulesPickDevice')"
        value=""
        @change="pick"
      >
        <AppOption value="">{{ t('usbRulesCustom') }}</AppOption>
        <AppOption v-for="device in devices" :key="device.id" :value="device.id">
          {{ device.product || `${device.vendorId}:${device.productId}` }} · {{ device.sysfs
          }}{{ device.serial ? ` · ${device.serial}` : '' }}
        </AppOption>
      </AppSelect>
      <AppTextField
        v-if="definition.id"
        :id="fieldId('id')"
        :label="t('usbRulesId')"
        :supporting-text="t('usbRulesIdHint')"
        :value="rule.id"
        spellcheck="false"
        autocomplete="off"
        :aria-invalid="issues.some((issue) => issue.field === 'id')"
        @input="update('id', value($event))"
      />
      <AppTextField
        v-if="definition.port"
        :id="fieldId('port')"
        :label="t('usbRulesPortPath')"
        :value="rule.port"
        spellcheck="false"
        autocomplete="off"
        :aria-invalid="issues.some((issue) => issue.field === 'port')"
        @input="update('port', value($event))"
      />
      <AppTextField
        v-if="definition.cls"
        :id="fieldId('class')"
        :label="t('usbRulesClassCode')"
        :supporting-text="t('usbRulesClassCodeHint')"
        :value="rule.class"
        spellcheck="false"
        autocomplete="off"
        :aria-invalid="issues.some((issue) => issue.field === 'class')"
        @input="update('class', value($event))"
      />
      <AppSelect
        :id="fieldId('target')"
        :label="t('usbTarget')"
        :value="rule.target"
        @change="target(value($event))"
      >
        <AppOption v-if="layer !== 'any' || rule.target === 'host'" value="host">
          {{ t('usbTargetHost') }}
        </AppOption>
        <AppOption value="vm">{{ t('usbRulesTargetVm') }}</AppOption>
        <AppOption value="sink">{{ t('usbRulesTargetSink') }}</AppOption>
      </AppSelect>
      <template v-if="rule.target === 'vm'">
        <AppSelect
          :id="fieldId('vm')"
          :label="t('usbRulesVm')"
          :value="rule.vm || ''"
          :aria-invalid="!rule.vm"
          @change="vm(value($event))"
        >
          <AppOption value="" disabled>{{ t('usbRulesChooseVm') }}</AppOption>
          <AppOption v-if="rule.vm && !currentVm" :value="rule.vm">
            {{ t('usbRulesMissingVm', { id: rule.vm }) }}
          </AppOption>
          <AppOption
            v-for="item in targets"
            :key="item.vmId"
            :value="item.vmId"
            :disabled="!item.controllerId"
          >
            {{ item.vmName || item.vmId
            }}{{ !item.controllerId ? ` · ${t('usbRulesNoController')}` : '' }}
          </AppOption>
        </AppSelect>
        <AppSelect
          :id="fieldId('controller')"
          :label="t('configControllerId')"
          :value="rule.controller ?? ''"
          @change="update('controller', value($event))"
        >
          <AppOption value="">{{ t('usbRulesDefaultController') }}</AppOption>
          <AppOption v-if="currentVm?.controllerId" :value="currentVm.controllerId">
            {{ currentVm.controllerId }}
          </AppOption>
          <AppOption v-if="oldController" :value="rule.controller!">
            {{ t('usbRulesOldController', { id: rule.controller }) }}
          </AppOption>
        </AppSelect>
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
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--app-color-card);
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
  font-size: var(--md-sys-typescale-body-medium-size);
}
fieldset {
  border: 0;
  padding: 0;
  margin: var(--space-3) 0 0;
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.rule-errors {
  color: var(--md-sys-color-error);
  padding-left: var(--space-4);
  margin: 0;
}
.reference-warning {
  color: var(--app-color-warning);
  margin: 0;
}
@media (width >= 840px) {
  fieldset {
    grid-template-columns: 1fr 1fr;
  }
  .rule-errors,
  .reference-warning {
    grid-column: 1 / -1;
  }
}
</style>
