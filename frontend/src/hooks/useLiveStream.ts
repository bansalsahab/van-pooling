import { useEffect, useState } from "react";

import { api } from "../lib/api";
import type { LiveConnectionState, LiveSnapshot } from "../lib/types";

type LiveEnvelope<TSnapshot> = {
  event?: string;
  payload?: TSnapshot | { generated_at?: string };
};

export function useLiveStream<TSnapshot extends LiveSnapshot>(token: string | null) {
  const [snapshot, setSnapshot] = useState<TSnapshot | null>(null);
  const [connectionState, setConnectionState] =
    useState<LiveConnectionState>("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lastMessageAt, setLastMessageAt] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setSnapshot(null);
      setConnectionState("error");
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
      setStreamError(null);
      setLastMessageAt(new Date().toISOString());
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

      source.addEventListener("snapshot", (event) => {
        const message = event as MessageEvent<string>;
        applySnapshot(JSON.parse(message.data) as TSnapshot);
      });

      source.addEventListener("heartbeat", () => {
        applyHeartbeat();
      });

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
        const envelope = JSON.parse(event.data) as LiveEnvelope<TSnapshot>;
        if (envelope.event === "snapshot.updated" && envelope.payload) {
          applySnapshot(envelope.payload as TSnapshot);
          return;
        }
        if (envelope.event === "heartbeat") {
          applyHeartbeat();
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
    streamError,
    lastMessageAt,
  };
}
