import { useEffect, useState } from "react";

import { api } from "../lib/api";
import type {
  LiveConnectionQuality,
  LiveConnectionState,
  LiveOperationalEvent,
  LiveSnapshot,
} from "../lib/types";

type SnapshotEnvelope<TSnapshot> = {
  event?: string;
  payload?: TSnapshot | { generated_at?: string };
};

type OperationalEventEnvelope = {
  event?: LiveOperationalEvent["event"] | "heartbeat" | "snapshot.updated";
  sequence?: number;
  payload?: LiveOperationalEvent["payload"] | { generated_at?: string };
};

const OPERATIONAL_EVENTS: LiveOperationalEvent["event"][] = [
  "ride.updated",
  "trip.updated",
  "van.updated",
  "driver.updated",
  "alert.created",
  "alert.resolved",
  "notification.created",
  "notification.updated",
];

export function useLiveStream<TSnapshot extends LiveSnapshot>(token: string | null) {
  const [snapshot, setSnapshot] = useState<TSnapshot | null>(null);
  const [connectionState, setConnectionState] =
    useState<LiveConnectionState>("connecting");
  const [connectionQuality, setConnectionQuality] =
    useState<LiveConnectionQuality>("critical");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lastMessageAt, setLastMessageAt] = useState<string | null>(null);
  const [streamLagSeconds, setStreamLagSeconds] = useState<number | null>(null);
  const [recentEvents, setRecentEvents] = useState<LiveOperationalEvent[]>([]);

  useEffect(() => {
    if (!token) {
      setConnectionQuality("critical");
      setStreamLagSeconds(null);
      return;
    }

    const tick = () => {
      if (streamError || connectionState === "error") {
        setConnectionQuality("critical");
      } else if (
        connectionState === "connecting" ||
        connectionState === "reconnecting"
      ) {
        setConnectionQuality("degraded");
      }

      if (!lastMessageAt) {
        setStreamLagSeconds(null);
        return;
      }

      const lag = Math.max(
        0,
        Math.floor((Date.now() - new Date(lastMessageAt).getTime()) / 1000),
      );
      setStreamLagSeconds(lag);

      if (connectionState !== "live") {
        return;
      }
      if (lag <= 6) {
        setConnectionQuality("good");
        return;
      }
      if (lag <= 15) {
        setConnectionQuality("degraded");
        return;
      }
      setConnectionQuality("critical");
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [connectionState, lastMessageAt, streamError, token]);

  useEffect(() => {
    if (!token) {
      setSnapshot(null);
      setRecentEvents([]);
      setConnectionState("error");
      setConnectionQuality("critical");
      setStreamLagSeconds(null);
      setStreamError("Sign in to start realtime updates.");
      return;
    }

    let closed = false;
    let socket: WebSocket | null = null;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let websocketOpened = false;

    const markLive = () => {
      setConnectionState("live");
      setConnectionQuality("good");
      setStreamError(null);
      setLastMessageAt(new Date().toISOString());
      setStreamLagSeconds(0);
    };

    const pushEvent = (event: LiveOperationalEvent) => {
      setRecentEvents((current) => [event, ...current].slice(0, 18));
      markLive();
    };

    const applySnapshot = (payload: TSnapshot) => {
      setSnapshot(payload);
      markLive();
    };

    const applyHeartbeat = () => {
      setLastMessageAt(new Date().toISOString());
      setConnectionState((current) => (current === "error" ? "reconnecting" : current));
    };

    const cleanupTransport = () => {
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        socket = null;
      }
      if (source) {
        source.close();
        source = null;
      }
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const parseOperationalEvent = (
      eventName: string,
      rawPayload: string,
      sequence?: number,
    ) => {
      if (!OPERATIONAL_EVENTS.includes(eventName as LiveOperationalEvent["event"])) {
        return;
      }
      const payload = JSON.parse(rawPayload) as LiveOperationalEvent["payload"];
      pushEvent({
        event: eventName as LiveOperationalEvent["event"],
        sequence,
        payload,
      });
    };

    const connectSse = () => {
      if (closed || source) {
        return;
      }
      cleanupTransport();
      setConnectionState((current) => (current === "live" ? "reconnecting" : "connecting"));
      setStreamError("Realtime is using the compatibility stream.");
      source = new EventSource(api.getLiveStreamUrl(token));

      source.onopen = () => {
        setConnectionState("live");
        setStreamError(null);
      };

      const handleSnapshotEvent = (event: Event) => {
        const message = event as MessageEvent<string>;
        applySnapshot(JSON.parse(message.data) as TSnapshot);
      };

      source.addEventListener("snapshot", handleSnapshotEvent);
      source.addEventListener("snapshot.updated", handleSnapshotEvent);

      source.addEventListener("heartbeat", () => {
        applyHeartbeat();
      });

      for (const eventName of OPERATIONAL_EVENTS) {
        source.addEventListener(eventName, (event) => {
          const message = event as MessageEvent<string>;
          parseOperationalEvent(eventName, message.data);
        });
      }

      source.onerror = () => {
        setConnectionState((current) => (current === "live" ? "reconnecting" : "error"));
        setStreamError("Realtime connection is retrying.");
      };
    };

    const connectWebSocket = () => {
      if (closed) {
        return;
      }
      cleanupTransport();
      websocketOpened = false;
      setConnectionState((current) => (current === "live" ? "reconnecting" : "connecting"));
      setStreamError(null);

      socket = new WebSocket(api.getLiveWebSocketUrl(token));
      const handshakeTimeout = window.setTimeout(() => {
        if (!websocketOpened) {
          socket?.close();
          connectSse();
        }
      }, 2500);

      socket.onopen = () => {
        websocketOpened = true;
        window.clearTimeout(handshakeTimeout);
        setConnectionState("live");
        setStreamError(null);
      };

      socket.onmessage = (event) => {
        const envelope = JSON.parse(event.data) as
          | SnapshotEnvelope<TSnapshot>
          | OperationalEventEnvelope;
        if (envelope.event === "snapshot.updated" && envelope.payload) {
          applySnapshot(envelope.payload as TSnapshot);
          return;
        }
        if (envelope.event === "heartbeat") {
          applyHeartbeat();
          return;
        }
        if (envelope.event && envelope.payload) {
          const sequence =
            "sequence" in envelope && typeof envelope.sequence === "number"
              ? envelope.sequence
              : undefined;
          pushEvent({
            event: envelope.event as LiveOperationalEvent["event"],
            sequence,
            payload: envelope.payload as LiveOperationalEvent["payload"],
          });
        }
      };

      socket.onerror = () => {
        setConnectionState((current) => (current === "live" ? "reconnecting" : "error"));
        setStreamError("Realtime socket is retrying.");
      };

      socket.onclose = () => {
        window.clearTimeout(handshakeTimeout);
        if (closed) {
          return;
        }
        if (!websocketOpened) {
          connectSse();
          return;
        }
        setConnectionState("reconnecting");
        setStreamError("Realtime socket disconnected. Reconnecting.");
        reconnectTimer = window.setTimeout(connectWebSocket, 1500);
      };
    };

    connectWebSocket();

    return () => {
      closed = true;
      cleanupTransport();
    };
  }, [token]);

  return {
    snapshot,
    connectionState,
    connectionQuality,
    streamError,
    lastMessageAt,
    streamLagSeconds,
    recentEvents,
  };
}
