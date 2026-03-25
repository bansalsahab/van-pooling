import { useEffect, useState } from "react";

import { api } from "../lib/api";
import type { LiveConnectionState, LiveSnapshot } from "../lib/types";

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
      return;
    }

    const source = new EventSource(api.getLiveStreamUrl(token));
    setConnectionState("connecting");
    setStreamError(null);

    source.onopen = () => {
      setConnectionState("live");
      setStreamError(null);
    };

    source.addEventListener("snapshot", (event) => {
      const message = event as MessageEvent<string>;
      setSnapshot(JSON.parse(message.data) as TSnapshot);
      setConnectionState("live");
      setStreamError(null);
      setLastMessageAt(new Date().toISOString());
    });

    source.addEventListener("heartbeat", () => {
      setLastMessageAt(new Date().toISOString());
      setConnectionState((current) => (current === "error" ? "reconnecting" : current));
    });

    source.onerror = () => {
      setConnectionState((current) => (current === "live" ? "reconnecting" : "error"));
      setStreamError("Realtime connection is retrying.");
    };

    return () => {
      source.close();
    };
  }, [token]);

  return {
    snapshot,
    connectionState,
    streamError,
    lastMessageAt,
  };
}
