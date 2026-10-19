import type { InjectionKey, Ref } from 'vue'

// md-outlined-select drops a falsy `value` set before its options render, so each
// AppOption marks itself selected from the value its AppSelect provides.
export const selectedValue: InjectionKey<Readonly<Ref<string>>> = Symbol('selected-value')
