// A whole card selects its item, except clicks that land on a control inside it
// or that finish a text selection.
const controls =
  'a,button,input,select,textarea,label,summary,[role="button"],md-filled-button,md-filled-tonal-button,md-text-button,md-icon-button,md-outlined-select,md-switch,md-checkbox'

export function selectsCard(event: MouseEvent) {
  const target = event.target as Element | null
  return !!target && !target.closest(controls) && !getSelection()?.toString()
}
