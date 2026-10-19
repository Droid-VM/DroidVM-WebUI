import { onScopeDispose, ref } from 'vue'

export function useMediaQuery(query: string) {
  const list = matchMedia(query)
  const matches = ref(list.matches)
  const update = () => (matches.value = list.matches)
  list.addEventListener('change', update)
  onScopeDispose(() => list.removeEventListener('change', update))
  return matches
}
