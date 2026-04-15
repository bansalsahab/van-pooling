declare module 'event-source-polyfill' {
  export class EventSourcePolyfill extends EventTarget {
    constructor(url: string, eventSourceInitDict?: EventSourceInitDict);
    readonly readyState: number;
    readonly url: string;
    readonly withCredentials: boolean;
    onopen: ((event: MessageEvent) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: MessageEvent) => void) | null;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
    close(): void;
  }

  interface EventSourceInitDict {
    headers?: Record<string, string>;
    proxy?: string;
    reconnectInterval?: number;
    reconnectIntervalOnError?: number;
  }
}
