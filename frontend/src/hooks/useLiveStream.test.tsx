import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";

import { useLiveStream } from "./useLiveStream";

vi.mock("../lib/api", () => ({
  api: {
    getLiveWebSocketUrl: () => "ws://test/live/ws",
    getLiveStreamUrl: () => "http://test/live/stream",
  },
}));

class MockWebSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  close() {
    this.onclose?.(new Event("close"));
  }

  static instances: MockWebSocket[] = [];
}

class MockEventSource {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(_eventName: string, _listener: EventListenerOrEventListenerObject) {}

  close() {}

  static instances: MockEventSource[] = [];
}

describe("useLiveStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    MockEventSource.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("falls back to EventSource when WebSocket handshake times out", async () => {
    const { result } = renderHook(() => useLiveStream("token-123"));

    await act(async () => {
      vi.advanceTimersByTime(2600);
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockEventSource.instances).toHaveLength(1);

    await act(async () => {
      MockEventSource.instances[0].onopen?.(new Event("open"));
    });

    expect(result.current.connectionState).toBe("live");
    expect(result.current.streamError).toBeNull();
  });
});
