import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../lib/api";
import type { NotificationFeed, NotificationSummary } from "../lib/types";
import { useAuth } from "../state/auth";

const NOTIFICATION_LIMIT = 12;

interface NotificationCenterPanelProps {
  title?: string;
  eyebrow?: string;
  includeAlerts?: boolean;
  enableIncidentActions?: boolean;
  initialNotifications: NotificationSummary[];
  initialUnreadCount: number;
  emptyMessage?: string;
  onUnreadCountChange?: (count: number) => void;
}

export function NotificationCenterPanel({
  title = "Notification center",
  eyebrow = "Notifications",
  includeAlerts = false,
  enableIncidentActions = false,
  initialNotifications,
  initialUnreadCount,
  emptyMessage = "No notifications yet. New assignments, alerts, and trip updates will appear here.",
  onUnreadCountChange,
}: NotificationCenterPanelProps) {
  const notificationState = useNotificationFeedState({
    includeAlerts,
    enableIncidentActions,
    initialNotifications,
    initialUnreadCount,
    onUnreadCountChange,
  });

  return (
    <NotificationFeedCard
      emptyMessage={emptyMessage}
      eyebrow={eyebrow}
      loadingLabel="Refreshing..."
      markAllLabel="Mark all read"
      state={notificationState}
      title={title}
      variant="panel"
    />
  );
}

interface NotificationRailProps {
  title?: string;
  includeAlerts?: boolean;
  enableIncidentActions?: boolean;
  initialNotifications: NotificationSummary[];
  initialUnreadCount: number;
}

export function NotificationRail({
  title = "Notifications",
  includeAlerts = false,
  enableIncidentActions = false,
  initialNotifications,
  initialUnreadCount,
}: NotificationRailProps) {
  const notificationState = useNotificationFeedState({
    includeAlerts,
    enableIncidentActions,
    initialNotifications,
    initialUnreadCount,
  });

  return (
    <NotificationFeedCard
      emptyMessage="Your latest notifications will appear here."
      eyebrow="Inbox"
      loadingLabel="Refreshing..."
      markAllLabel="Clear unread"
      state={notificationState}
      title={title}
      variant="rail"
    />
  );
}

function useNotificationFeedState({
  includeAlerts,
  enableIncidentActions,
  initialNotifications,
  initialUnreadCount,
  onUnreadCountChange,
}: {
  includeAlerts: boolean;
  enableIncidentActions: boolean;
  initialNotifications: NotificationSummary[];
  initialUnreadCount: number;
  onUnreadCountChange?: (count: number) => void;
}) {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [feed, setFeed] = useState<NotificationFeed>({
    items: initialNotifications,
    unread_count: initialUnreadCount,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [activeNotificationId, setActiveNotificationId] = useState<string | null>(null);

  useEffect(() => {
    setFeed({
      items: initialNotifications,
      unread_count: initialUnreadCount,
    });
  }, [initialNotifications, initialUnreadCount]);

  useEffect(() => {
    onUnreadCountChange?.(feed.unread_count);
  }, [feed.unread_count, onUnreadCountChange]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void refresh();
  }, [includeAlerts, token]);

  async function refresh() {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const nextFeed = await api.getNotifications(token, {
        includeAlerts,
        limit: NOTIFICATION_LIMIT,
      });
      setFeed(nextFeed);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRead(notificationId: string) {
    if (!token) {
      return;
    }
    setActiveNotificationId(notificationId);
    setError(null);
    setInfoMessage(null);
    try {
      const updated = await api.readNotification(token, notificationId);
      setFeed((current) => {
        const wasUnread = current.items.some(
          (item) => item.id === notificationId && !item.read_at,
        );
        return {
          unread_count: wasUnread ? Math.max(0, current.unread_count - 1) : current.unread_count,
          items: current.items.map((item) => (item.id === notificationId ? updated : item)),
        };
      });
    } catch (markReadError) {
      setError(
        markReadError instanceof Error
          ? markReadError.message
          : "Could not mark that notification as read.",
      );
    } finally {
      setActiveNotificationId(null);
    }
  }

  async function handleMarkAllRead() {
    if (!token) {
      return;
    }
    setActiveNotificationId("all");
    setError(null);
    setInfoMessage(null);
    try {
      const updatedFeed = await api.readAllNotifications(token, {
        includeAlerts,
        limit: NOTIFICATION_LIMIT,
      });
      setFeed(updatedFeed);
    } catch (markAllError) {
      setError(
        markAllError instanceof Error
          ? markAllError.message
          : "Could not mark notifications as read.",
      );
    } finally {
      setActiveNotificationId(null);
    }
  }

  async function handleResolveIncident(notification: NotificationSummary) {
    if (!token || user?.role !== "admin") {
      return;
    }
    setActiveNotificationId(`resolve:${notification.id}`);
    setError(null);
    setInfoMessage(null);
    try {
      await api.resolveAdminAlert(token, notification.id);
      const resolvedAt = new Date().toISOString();
      setFeed((current) => {
        const wasUnread = current.items.some(
          (item) => item.id === notification.id && !item.read_at,
        );
        return {
          unread_count: wasUnread ? Math.max(0, current.unread_count - 1) : current.unread_count,
          items: current.items.map((item) =>
            item.id !== notification.id
              ? item
              : {
                  ...item,
                  status: "sent",
                  sent_at: item.sent_at || resolvedAt,
                  read_at: item.read_at || resolvedAt,
                },
          ),
        };
      });
      setInfoMessage("Incident resolved and synced to the operations timeline.");
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : "Could not resolve incident.",
      );
    } finally {
      setActiveNotificationId(null);
    }
  }

  function openIncidentContext(notification: NotificationSummary) {
    if (user?.role !== "admin" || !enableIncidentActions) {
      return;
    }
    const entityType = (notification.entity_type || "").toLowerCase();
    if (notification.trip_id || entityType === "trip") {
      navigate("/admin/trips");
      return;
    }
    if (notification.ride_id || entityType === "ride") {
      navigate("/admin/requests");
      return;
    }
    navigate("/admin");
  }

  return {
    activeNotificationId,
    enableIncidentActions: enableIncidentActions && user?.role === "admin",
    error,
    feed,
    handleMarkAllRead,
    handleMarkRead,
    handleResolveIncident,
    infoMessage,
    loading,
    openIncidentContext,
    refresh,
  };
}

function NotificationFeedCard({
  title,
  eyebrow,
  emptyMessage,
  loadingLabel,
  markAllLabel,
  state,
  variant,
}: {
  title: string;
  eyebrow: string;
  emptyMessage: string;
  loadingLabel: string;
  markAllLabel: string;
  state: ReturnType<typeof useNotificationFeedState>;
  variant: "panel" | "rail";
}) {
  const {
    activeNotificationId,
    enableIncidentActions,
    error,
    feed,
    handleMarkAllRead,
    handleMarkRead,
    handleResolveIncident,
    infoMessage,
    loading,
    openIncidentContext,
    refresh,
  } = state;
  const previewItems = variant === "rail" ? feed.items.slice(0, 3) : feed.items;

  return (
    <section className={`panel notification-panel ${variant === "rail" ? "notification-rail" : ""}`}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <div className="stack compact align-end">
          <span className={`status-pill ${feed.unread_count > 0 ? "unread" : "read"}`}>
            {feed.unread_count} unread
          </span>
          <div className="button-row wrap">
            <button
              className="ghost-button"
              disabled={loading}
              onClick={() => void refresh()}
              type="button"
            >
              {loading ? loadingLabel : "Refresh"}
            </button>
            <button
              className="ghost-button"
              disabled={feed.unread_count === 0 || activeNotificationId === "all"}
              onClick={() => void handleMarkAllRead()}
              type="button"
            >
              {activeNotificationId === "all" ? "Marking..." : markAllLabel}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {infoMessage && <div className="success-banner">{infoMessage}</div>}

      {previewItems.length === 0 ? (
        <p className="muted-copy">{loading ? "Loading notifications..." : emptyMessage}</p>
      ) : (
        <div className="stack compact">
          {previewItems.map((notification) => {
            const isUnread = !notification.read_at;
            const isIncident = isIncidentNotification(notification);
            const canResolveIncident =
              enableIncidentActions &&
              isIncident &&
              notification.status === "pending";
            return (
              <article
                className={`list-card compact-card notification-card ${isUnread ? "is-unread" : "is-read"}`}
                key={notification.id}
              >
                <div className="notification-card-main">
                  <div className="notification-card-header">
                    <strong>{notification.title || buildNotificationTitle(notification)}</strong>
                    <div className="signal-row">
                      {notification.kind && (
                        <span className="signal-pill">
                          {notification.kind.replaceAll("_", " ")}
                        </span>
                      )}
                      {notification.breach_type && (
                        <span className="signal-pill">
                          {notification.breach_type.replaceAll("_", " ")}
                        </span>
                      )}
                      {notification.severity && (
                        <span className={`priority-pill ${notification.severity}`}>
                          {notification.severity}
                        </span>
                      )}
                      <span className={`status-pill ${isUnread ? "unread" : "read"}`}>
                        {isUnread ? "Unread" : "Read"}
                      </span>
                    </div>
                  </div>
                  <p>{notification.message}</p>
                  <div className="notification-card-footer">
                    <span className="muted-copy">
                      {notification.created_at
                        ? formatTimestamp(notification.created_at)
                        : "Raised recently"}
                    </span>
                    {notification.trip_id && (
                      <span className="muted-copy">
                        Trip {notification.trip_id.slice(0, 8)}
                      </span>
                    )}
                    {notification.ride_id && (
                      <span className="muted-copy">
                        Ride {notification.ride_id.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  {enableIncidentActions && isIncident && variant === "panel" && (
                    <div className="button-row notification-action-row">
                      <button
                        className="ghost-button"
                        onClick={() => openIncidentContext(notification)}
                        type="button"
                      >
                        Open context
                      </button>
                      {canResolveIncident ? (
                        <button
                          className="secondary-button"
                          disabled={activeNotificationId === `resolve:${notification.id}`}
                          onClick={() => void handleResolveIncident(notification)}
                          type="button"
                        >
                          {activeNotificationId === `resolve:${notification.id}`
                            ? "Resolving..."
                            : "Resolve incident"}
                        </button>
                      ) : (
                        <span className="muted-copy">
                          {isIncident && notification.status !== "pending"
                            ? "Incident already resolved"
                            : "Advisory only"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="stack compact align-end">
                  {isUnread ? (
                    <button
                      className="ghost-button"
                      disabled={activeNotificationId === notification.id}
                      onClick={() => void handleMarkRead(notification.id)}
                      type="button"
                    >
                      {activeNotificationId === notification.id ? "Saving..." : "Mark read"}
                    </button>
                  ) : (
                    <span className="muted-copy">
                      {notification.read_at
                        ? `Read ${formatTimestamp(notification.read_at)}`
                        : "Read"}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function isIncidentNotification(notification: NotificationSummary) {
  return ["operational_alert", "sla_breach"].includes(notification.kind || "");
}

function buildNotificationTitle(notification: NotificationSummary) {
  if (notification.kind) {
    return notification.kind.replaceAll("_", " ");
  }
  if (notification.type) {
    return `${notification.type} update`;
  }
  return "Notification";
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}
