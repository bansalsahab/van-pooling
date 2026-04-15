import { useCallback, useEffect, useRef, useState } from 'react';
import { EventSourcePolyfill } from 'event-source-polyfill';
import { API_BASE_URL } from '../api/config';

type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'error';
type ConnectionQuality = 'good' | 'degraded' | 'critical';

interface LiveStreamOptions {
  onRideUpdate?: (ride: unknown) => void;
  onTripUpdate?: (trip: unknown) => void;
  onNotification?: (notification: unknown) => void;
  onHeartbeat?: () => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseLiveStreamReturn {
  connectionState: ConnectionState;
  connectionQuality: ConnectionQuality;
  lastMessageAt: string | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

const OPERATIONAL_EVENTS = [
  'ride.updated',
  'trip.updated',
  'van.updated',
  'driver.updated',
  'alert.created',
  'alert.resolved',
  'notification.created',
  'notification.updated',
  'snapshot',
  'snapshot.updated',
  'heartbeat',
];

export function useLiveStream(
  token: string | null,
  options: LiveStreamOptions = {}
): UseLiveStreamReturn {
  const {
    onRideUpdate,
    onTripUpdate,
    onNotification,
    onHeartbeat,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('critical');
  const [lastMessageAt, setLastMessageAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSourcePolyfill | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const closedRef = useRef(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHeartbeatRef = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent<string>) => {
    setLastMessageAt(new Date().toISOString());
    setConnectionState('live');
    setConnectionQuality('good');
    setError(null);
    reconnectAttemptsRef.current = 0;

    try {
      const data = JSON.parse(event.data);

      if (event.type === 'ride.updated' && onRideUpdate) {
        onRideUpdate(data);
      } else if (event.type === 'trip.updated' && onTripUpdate) {
        onTripUpdate(data);
      } else if (
        (event.type === 'notification.created' || event.type === 'notification.updated') &&
        onNotification
      ) {
        onNotification(data);
      } else if (event.type === 'heartbeat' && onHeartbeat) {
        onHeartbeat();
        lastHeartbeatRef.current = new Date().toISOString();
      }
    } catch {
      // Ignore parse errors
    }
  }, [onRideUpdate, onTripUpdate, onNotification, onHeartbeat]);

  const handleError = useCallback(() => {
    if (closedRef.current) return;

    setConnectionState((prev) => (prev === 'live' ? 'reconnecting' : 'error'));
    setError('Connection lost. Reconnecting...');

    if (reconnectAttemptsRef.current < maxReconnectAttempts) {
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(reconnectInterval * reconnectAttemptsRef.current, 30000);
      reconnectTimerRef.current = setTimeout(() => {
        if (!closedRef.current) {
          connect();
        }
      }, delay);
    } else {
      setConnectionState('error');
      setError('Failed to connect after multiple attempts. Pull to refresh.');
      setConnectionQuality('critical');
    }
  }, [maxReconnectAttempts, reconnectInterval]);

  const connect = useCallback(() => {
    if (!token || closedRef.current) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionState('connecting');
    setError(null);

    const sseUrl = `${API_BASE_URL}/live/stream?token=${encodeURIComponent(token)}`;

    const EventSourceConstructor = EventSourcePolyfill;
    const eventSource = new EventSourceConstructor(sseUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      reconnectInterval,
    });

    eventSource.onopen = () => {
      if (closedRef.current) {
        eventSource.close();
        return;
      }
      setConnectionState('live');
      setConnectionQuality('good');
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    for (const eventName of OPERATIONAL_EVENTS) {
      eventSource.addEventListener(eventName, handleMessage as EventListener);
    }

    eventSource.onerror = () => {
      handleError();
      eventSource.close();
    };

    eventSourceRef.current = eventSource;

    heartbeatTimerRef.current = setInterval(() => {
      if (lastHeartbeatRef.current) {
        const lag = Math.floor(
          (Date.now() - new Date(lastHeartbeatRef.current).getTime()) / 1000
        );
        if (lag > 15) {
          setConnectionQuality('critical');
        } else if (lag > 6) {
          setConnectionQuality('degraded');
        } else {
          setConnectionQuality('good');
        }
      }
    }, 5000);
  }, [token, reconnectInterval, handleMessage, handleError]);

  const disconnect = useCallback(() => {
    closedRef.current = true;
    clearTimers();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setConnectionState('error');
    setConnectionQuality('critical');
  }, [clearTimers]);

  useEffect(() => {
    if (!token) {
      setConnectionState('error');
      setError('Sign in to enable live updates.');
      return;
    }

    closedRef.current = false;
    reconnectAttemptsRef.current = 0;
    connect();

    return () => {
      closedRef.current = true;
      clearTimers();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [token, connect, clearTimers]);

  return {
    connectionState,
    connectionQuality,
    lastMessageAt,
    error,
    connect,
    disconnect,
  };
}
