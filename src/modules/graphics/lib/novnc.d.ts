declare module '@novnc/novnc' {
  export default class RFB extends EventTarget {
    constructor(
      target: HTMLElement,
      channel: object,
      options?: { credentials?: { password: string }; shared?: boolean },
    )
    static messages: { clientEncodings(socket: unknown, encodings: number[]): void }
    protected _sock: unknown
    protected _fbDepth: number
    protected _qualityLevel: number
    protected _compressionLevel: number
    protected _rfbConnectionState: string
    protected _keyboard: { ungrab(): void; grab(): void }
    protected _mousePos: { x?: number; y?: number }
    protected _mouseMoveTimer: ReturnType<typeof setTimeout> | null
    protected _mouseButtonMask: number
    protected _accumulatedWheelDeltaX: number
    protected _accumulatedWheelDeltaY: number
    protected _handleMouseButton(x: number, y: number, mask: number): void
    protected _handleMouseMove(x: number, y: number): void
    protected _sendMouse(x: number, y: number, mask: number): void
    protected _handleWheel(event: WheelEvent): void
    protected _handleGesture(event: Event): void
    protected _sendEncodings(): void
    viewOnly: boolean
    scaleViewport: boolean
    resizeSession: boolean
    clipViewport: boolean
    dragViewport: boolean
    focusOnClick: boolean
    background: string
    disconnect(): void
    sendKey(keysym: number, code?: string, down?: boolean): void
    sendCtrlAltDel(): void
    focus(options?: FocusOptions): void
    blur(): void
  }
}
