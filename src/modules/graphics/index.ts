export { createVmGraphicsGateway } from './api/websocket'
export type {
  VmGraphicsGateway,
  DisplayMetadata,
  DisplayConnection,
  DisplayObserver,
} from './api/gateway'
export { createVmGraphics, vmGraphicsKey, useVmGraphics } from './model/graphics'
export { default as VmConsole } from './components/VmConsole.vue'
