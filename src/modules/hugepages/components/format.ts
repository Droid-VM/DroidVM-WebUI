import { useI18n } from 'vue-i18n'

export function useHugepageFormatting() {
  const { t, locale } = useI18n()
  const pageLabel = (value: string | null | undefined) =>
    value == null
      ? t('notAvailable')
      : t('hugepagesPageValue', {
          pages: BigInt(value).toLocaleString(locale.value),
          mib: (BigInt(value) * 2n).toLocaleString(locale.value),
        })
  const flag = (value: boolean | null | undefined) =>
    t(value == null ? 'notAvailable' : value ? 'hugepagesYes' : 'hugepagesNo')
  const leverLabel = (value: 'flag' | 'hook' | null | undefined) =>
    t(
      value === 'flag'
        ? 'hugepagesLeverFlag'
        : value === 'hook'
          ? 'hugepagesLeverHook'
          : 'hugepagesLeverNone',
    )
  return { pageLabel, flag, leverLabel }
}

// Golden-angle hue per owner rank (ascending PID), shared by the usage bar and the process
// list so a VM keeps one colour on both screens.
export const ownerHue = (rank: number) => Math.round((rank * 137.508) % 360)
