export { createVmTerminalGateway } from './api/websocket'
export type { TerminalSocketOptions } from './api/websocket'
export type {
  VmTerminalGateway,
  TerminalMetadata,
  TerminalCursor,
  TerminalConnection,
  TerminalObserver,
} from './api/gateway'
export { createVmTerminal, vmTerminalKey, useVmTerminal } from './model/terminal'
export { default as VmTerminal } from './components/VmTerminal.vue'
