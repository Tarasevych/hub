// Minimale typen voor guacamole-common-js 1.5.0 (het pakket heeft er zelf geen). Alleen wat src/extern gebruikt.
declare module 'guacamole-common-js' {
  namespace Guacamole {
    class Status { code: number; message: string; constructor(code: number, message?: string); isError(): boolean }
    class Tunnel { state: number; uuid: string | null; oninstruction: ((opcode: string, args: string[]) => void) | null; onstatechange: ((state: number) => void) | null; onerror: ((s: Status) => void) | null; onuuid: ((uuid: string) => void) | null; sendMessage(...elements: Array<string | number>): void; isConnected(): boolean; disconnect(): void }
    class WebSocketTunnel extends Tunnel { constructor(url: string) }
    class OutputStream { index: number }
    class InputStream { index: number }
    class StringWriter { constructor(stream: OutputStream); sendText(text: string): void; sendEnd(): void }
    class StringReader { constructor(stream: InputStream); ontext: ((text: string) => void) | null; onend: (() => void) | null }
    class Display { getElement(): HTMLElement; getWidth(): number; getHeight(): number; scale(s: number): void; getScale(): number; onresize: ((w: number, h: number) => void) | null; showCursor(v: boolean): void }
    class Client {
      constructor(tunnel: Tunnel);
      connect(data?: string): void; disconnect(): void;
      getDisplay(): Display;
      sendKeyEvent(pressed: 0 | 1 | boolean, keysym: number): void;
      sendMouseState(state: Mouse.State, applyDisplayScale?: boolean): void;
      sendSize(w: number, h: number): void;
      createClipboardStream(mimetype: string): OutputStream;
      onstatechange: ((state: number) => void) | null;
      onerror: ((status: Status) => void) | null;
      onclipboard: ((stream: InputStream, mimetype: string) => void) | null;
      onname: ((name: string) => void) | null;
    }
    class Mouse { constructor(el: Element); onEach(types: string[], f: (e: { state: Mouse.State }) => void): void }
    namespace Mouse { class State { x: number; y: number; left: boolean; middle: boolean; right: boolean; up: boolean; down: boolean } class Touchscreen { constructor(el: Element); onEach(types: string[], f: (e: { state: Mouse.State }) => void): void } class Touchpad { constructor(el: Element); onEach(types: string[], f: (e: { state: Mouse.State }) => void): void } }
    class Keyboard { constructor(el?: Element | Document); onkeydown: ((keysym: number) => boolean | void) | null; onkeyup: ((keysym: number) => void) | null; reset(): void; listenTo(el: Element | Document): void }
    class InputSink { constructor(); getElement(): HTMLElement; focus(): void }
  }
  const Guacamole: typeof Guacamole;
  export default Guacamole;
}
