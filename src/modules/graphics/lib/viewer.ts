import RFB from '@novnc/novnc'
import { validateClipboard, type ClipboardMode, type ClipboardSendResult } from './clipboard'

/** Pinned noVNC 1.7.0 adapter. Keep private API usage confined to this class.
 * Both noVNC and the Android server use encoding 50, with different extensions.
 * Mirror the pinned upstream list except encoding 50; keep all other extensions.
 */
class StandardRfb extends RFB {
  private inputActive = true
  onClipboardMode?: (mode: ClipboardMode) => void
  setInputActive(value: boolean) {
    if (!value && this.inputActive) this.releaseInput()
    this.inputActive = value
    if (!value) {
      this._keyboard.ungrab()
      this.blur()
    } else if (this._rfbConnectionState === 'connected' && !this.viewOnly) this._keyboard.grab()
  }
  override sendKey(symbol: number, code?: string, down?: boolean) {
    if (this.inputActive) super.sendKey(symbol, code, down)
  }
  protected override _handleMouseButton(x: number, y: number, mask: number) {
    if (this.inputActive) super._handleMouseButton(x, y, mask)
  }
  protected override _handleMouseMove(x: number, y: number) {
    if (this.inputActive) super._handleMouseMove(x, y)
  }
  protected override _sendMouse(x: number, y: number, mask: number) {
    if (this.inputActive) super._sendMouse(x, y, mask)
  }
  protected override _handleWheel(event: WheelEvent) {
    if (this.inputActive) super._handleWheel(event)
  }
  protected override _handleGesture(event: Event) {
    if (this.inputActive) super._handleGesture(event)
  }
  get clipboardMode(): ClipboardMode {
    if (this._rfbConnectionState !== 'connected' || this.viewOnly) return 'unavailable'
    const formats = this._clipboardServerCapabilitiesFormats
    const actions = this._clipboardServerCapabilitiesActions
    // Match noVNC's Notify branch and only promise UTF-8 when its full text
    // exchange is negotiated. An incomplete extension cannot safely fall back.
    if (formats[1] && actions[1 << 27])
      return actions[1 << 25] && actions[1 << 28] ? 'utf8' : 'unavailable'
    return 'latin1'
  }
  protected override _handleServerCutText() {
    const handled = super._handleServerCutText()
    if (handled) this.onClipboardMode?.(this.clipboardMode)
    return handled
  }
  protected override _sendEncodings() {
    const encodings = this._fbDepth === 24 ? [1, 7, -260, 16, 21, 5, 2, 6, 0] : [1, 0]
    encodings.push(
      -32 + this._qualityLevel,
      -256 + this._compressionLevel,
      -223,
      -224,
      -258,
      -261,
      -308,
      -309,
      -312,
      -313,
      -307,
      0xc0a1e5ce,
      -316,
    )
    if (this._fbDepth === 24) encodings.push(0x574d5664, -239)
    RFB.messages.clientEncodings(this._sock, encodings)
  }
  releaseInput() {
    if (this._rfbConnectionState !== 'connected') return
    this._keyboard.ungrab()
    if (this._mouseMoveTimer !== null) clearTimeout(this._mouseMoveTimer)
    this._mouseMoveTimer = null
    this._handleMouseButton(this._mousePos.x ?? 0, this._mousePos.y ?? 0, 0)
    this._mouseButtonMask = 0
    this._accumulatedWheelDeltaX = this._accumulatedWheelDeltaY = 0
    if (this.inputActive && !this.viewOnly) this._keyboard.grab()
  }
}

export function createGraphicsViewer(
  target: HTMLElement,
  events: {
    ready(): void
    closed(): void
    clipboard(text: string): void
    clipboardMode(mode: ClipboardMode): void
  },
) {
  let rfb: StandardRfb | undefined,
    active = false,
    inputActive = true,
    generation = 0
  const held = new Map<string, number>()
  function release() {
    for (const [code, symbol] of held) rfb?.sendKey(symbol, code, false)
    held.clear()
    rfb?.releaseInput()
  }
  function stop() {
    release()
    active = false
    generation++
    const previous = rfb
    rfb = undefined
    if (previous) previous.onClipboardMode = undefined
    previous?.disconnect()
    target.replaceChildren()
  }
  return {
    start(socket: WebSocket, password: string, inputEnabled: boolean) {
      stop()
      active = true
      const epoch = generation
      const current = () => active && epoch === generation
      // noVNC receives a bounded binary transport, never the authentication JSON.
      const channel = {
        binaryType: 'arraybuffer',
        protocol: socket.protocol,
        get readyState() {
          return socket.readyState
        },
        onopen: null as ((event: Event) => void) | null,
        onmessage: null as ((event: MessageEvent<ArrayBuffer>) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onclose: null as ((event: CloseEvent) => void) | null,
        send(data: Uint8Array) {
          if (!current() || socket.readyState !== WebSocket.OPEN) return
          if (socket.bufferedAmount > 1048576) {
            socket.close(1009)
            return
          }
          // RFB is a stream, so splitting a WebSocket message is lossless.
          for (let offset = 0; offset < data.byteLength; offset += 65536)
            socket.send(data.slice(offset, offset + 65536))
        },
        close() {
          socket.close()
        },
      }
      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (!current()) return
        if (!(event.data instanceof ArrayBuffer) || event.data.byteLength > 65536) {
          socket.close(1002)
          return
        }
        channel.onmessage?.(event as MessageEvent<ArrayBuffer>)
      }
      socket.onclose = (event) => {
        if (current()) channel.onclose?.(event)
      }
      socket.onerror = (event) => {
        if (current()) channel.onerror?.(event)
      }
      rfb = new StandardRfb(target, channel, { credentials: { password }, shared: true })
      const instance = rfb
      const currentInstance = () => current() && rfb === instance
      instance.onClipboardMode = (mode) => {
        if (currentInstance()) events.clipboardMode(mode)
      }
      rfb.viewOnly = !inputEnabled
      rfb.setInputActive(inputActive)
      rfb.scaleViewport = true
      rfb.resizeSession = false
      rfb.background = '#11151c'
      rfb.addEventListener('connect', () => {
        if (!currentInstance()) return
        const canvas = target.querySelector('canvas')
        if (canvas) {
          canvas.dataset.testid = 'graphic-canvas'
          canvas.dataset.guestInput = 'true'
        }
        events.ready()
        if (currentInstance()) instance.setInputActive(inputActive)
        if (currentInstance()) events.clipboardMode(instance.clipboardMode)
      })
      rfb.addEventListener('clipboard', (event) => {
        if (!currentInstance() || instance.viewOnly) return
        const text: unknown = (event as CustomEvent<{ text?: unknown }>).detail?.text
        if (typeof text === 'string') events.clipboard(text)
      })
      rfb.addEventListener('disconnect', () => {
        if (currentInstance()) events.closed()
      })
      rfb.addEventListener('securityfailure', () => {
        if (currentInstance()) events.closed()
      })
      rfb.addEventListener('credentialsrequired', () => {
        if (currentInstance()) events.closed()
      })
    },
    stop,
    release,
    setInputActive(value: boolean) {
      if (!value && inputActive) release()
      inputActive = value
      rfb?.setInputActive(value)
    },
    clipboard(text: string): ClipboardSendResult {
      if (!active || !rfb) return 'unavailable'
      const failure = validateClipboard(text, rfb.clipboardMode)
      if (failure) return failure
      rfb.clipboardPasteFrom(text)
      return 'sent'
    },
    focus() {
      rfb?.focus({ preventScroll: true })
    },
    scale(fit: boolean) {
      if (rfb) {
        rfb.scaleViewport = fit
        rfb.clipViewport = false
      }
    },
    key(symbol: number, code: string, down?: boolean) {
      if (!inputActive) return
      if (down === true) held.set(code, symbol)
      if (down === false) held.delete(code)
      rfb?.sendKey(symbol, code, down)
    },
    text(value: string) {
      if (!inputActive) return
      for (const character of Array.from(value).slice(0, 256)) {
        const point = character.codePointAt(0)!
        if (point === 10) rfb?.sendKey(0xff0d, 'Enter')
        else if (point >= 32) rfb?.sendKey(point <= 255 ? point : 0x01000000 | point)
      }
    },
    ctrlAltDel() {
      if (inputActive) rfb?.sendCtrlAltDel()
    },
  }
}
