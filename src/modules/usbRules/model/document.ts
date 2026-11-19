import type { MessageKey } from '../../../shared/i18n'
import type { UsbDevice } from '../../resources'
import type { UsbRule, UsbRulesDocument } from '../api/gateway'

export const ruleLayers = [
  {
    key: 'exact',
    label: 'usbRulesExact',
    hint: 'usbRulesExactHint',
    id: true,
    port: true,
    cls: false,
  },
  {
    key: 'port',
    label: 'usbRulesPort',
    hint: 'usbRulesPortHint',
    id: false,
    port: true,
    cls: false,
  },
  {
    key: 'device',
    label: 'usbRulesDevice',
    hint: 'usbRulesDeviceHint',
    id: true,
    port: false,
    cls: false,
  },
  {
    key: 'class',
    label: 'usbRulesClass',
    hint: 'usbRulesClassHint',
    id: false,
    port: false,
    cls: true,
  },
  { key: 'any', label: 'usbRulesAny', hint: 'usbRulesAnyHint', id: false, port: false, cls: false },
] as const
export type RuleLayer = (typeof ruleLayers)[number]['key']
export interface RuleIssue {
  layer: RuleLayer
  index: number
  field: keyof UsbRule
  message: MessageKey
}
const validId = (id: string) =>
  /^[\da-f]{4}:[\da-f]{4}(?::[^\n\v\f\r\u0085\u2028\u2029]+)?(?![\s\S])/i.test(id)
// A USB class code: two hex digits, as the daemon stores it (lowercase).
const validClass = (value: string) => /^[\da-f]{2}$/i.test(value)
const validPort = (port: string) =>
  /^\p{Decimal_Number}+(?:\.\p{Decimal_Number}+)*(?![\s\S])/u.test(port)
export function ruleIssues(
  layer: RuleLayer,
  rule: Readonly<UsbRule>,
): { field: keyof UsbRule; message: MessageKey }[] {
  const definition = ruleLayers.find((item) => item.key === layer)!
  const issues: { field: keyof UsbRule; message: MessageKey }[] = []
  if (definition.id ? !validId(rule.id ?? '') : rule.id !== undefined)
    issues.push({ field: 'id', message: 'usbRulesBadId' })
  if (definition.port ? !validPort(rule.port ?? '') : rule.port !== undefined)
    issues.push({ field: 'port', message: 'usbRulesBadPort' })
  if (definition.cls ? !validClass(rule.class ?? '') : rule.class !== undefined)
    issues.push({ field: 'class', message: 'usbRulesBadClass' })
  if (rule.target === 'vm') {
    if (!rule.vm) issues.push({ field: 'vm', message: 'usbRulesChooseVm' })
    if (rule.controller === '')
      issues.push({ field: 'controller', message: 'usbRulesBadController' })
  } else if (rule.vm !== undefined || rule.controller !== undefined)
    issues.push({ field: 'target', message: 'usbRulesBadTarget' })
  return issues
}
export function documentIssues(document: UsbRulesDocument): RuleIssue[] {
  return ruleLayers.flatMap(({ key }) =>
    (document[key] ?? []).flatMap((rule, index) =>
      ruleIssues(key, rule).map((issue) => ({ ...issue, layer: key, index })),
    ),
  )
}
export function normalizedRules(document: UsbRulesDocument): UsbRulesDocument {
  return {
    ...document,
    ...Object.fromEntries(
      // The class layer is optional in older documents; the editor always holds one.
      ruleLayers.map(({ key }) => [
        key,
        (document[key] ?? []).map((rule) => ({
          ...rule,
          ...(rule.id ? { id: rule.id.slice(0, 9).toLowerCase() + rule.id.slice(9) } : {}),
          ...(rule.class ? { class: rule.class.toLowerCase() } : {}),
        })),
      ]),
    ),
  }
}
export function deviceSubject(device: Readonly<UsbDevice>) {
  return {
    id: `${device.vendorId.toLowerCase()}:${device.productId.toLowerCase()}${device.serial ? `:${device.serial}` : ''}`,
    port: device.sysfs.slice(device.sysfs.indexOf('-') + 1),
  }
}
