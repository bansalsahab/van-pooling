import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AppLayout } from "../components/Layout";
import { CopilotPanel } from "../components/CopilotPanel";
import { LiveMap } from "../components/LiveMap";
import { NotificationCenterPanel } from "../components/NotificationPanel";
import {
  AIInsightsPanel,
  InfoRow,
  LiveEventsPanel,
  LiveStatusBadge,
  MetricPanel,
} from "../components/common";
import { useCopilot } from "../hooks/useCopilot";
import { useLiveStream } from "../hooks/useLiveStream";
import { api } from "../lib/api";
import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsSearchUrl,
} from "../lib/mapsLinks";
import type {
  AIInsight,
  DriverDashboardSummary,
  DriverLiveSnapshot,
  DriverTripSummary,
  MapMarkerSpec,
  MapPolylineSpec,
  RoutePlan,
} from "../lib/types";
import { useAuth } from "../state/auth";

type SharingMode = "off" | "gps" | "simulated";

const DRIVER_LOCATION_QUEUE_STORAGE_KEY = "vanpool.driver.location_queue.v1";
const DRIVER_LOCATION_QUEUE_MAX_ITEMS = 120;
const LOCATION_QUEUE_RETRY_INTERVAL_MS = 8000;

interface DriverLocationQueueItem {
  id: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

export function DriverDashboard({ operationsOnly = false }: { operationsOnly?: boolean }) {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const {
    snapshot,
    connectionState,
    connectionQuality,
    lastMessageAt,
    streamLagSeconds,
    streamError,
    recentEvents,
  } = useLiveStream<DriverLiveSnapshot>(token);
  const { brief, reply, loading, asking, error: copilotError, refreshBrief, askCopilot } =
    useCopilot(token);
  const [fallbackDashboard, setFallbackDashboard] =
    useState<DriverDashboardSummary | null>(null);
  const [fallbackTrip, setFallbackTrip] = useState<DriverTripSummary | null>(null);
  const [fallbackInsights, setFallbackInsights] = useState<AIInsight[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharingMode, setSharingMode] = useState<SharingMode>("off");
  const [lastLocationSync, setLastLocationSync] = useState<string | null>(null);
  const [lastQueueFlushAt, setLastQueueFlushAt] = useState<string | null>(null);
  const [queueSyncing, setQueueSyncing] = useState(false);
  const [locationQueue, setLocationQueue] = useState<DriverLocationQueueItem[]>(
    () => loadDriverLocationQueue(),
  );
  const [location, setLocation] = useState({ latitude: "", longitude: "" });
  const lastSentAtRef = useRef(0);
  const queueSyncInFlightRef = useRef(false);
  const locationQueueRef = useRef<DriverLocationQueueItem[]>(locationQueue);

  useEffect(() => {
    if (!token) return;
    void refresh();
  }, [token]);

  useEffect(() => {
    locationQueueRef.current = locationQueue;
    persistDriverLocationQueue(locationQueue);
  }, [locationQueue]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const handleOnline = () => {
      setStatusMessage("Connectivity restored. Syncing queued location updates.");
      setShareError(null);
      void flushLocationQueue({ showError: false });
    };

    window.addEventListener("online", handleOnline);
    const intervalId = window.setInterval(() => {
      void flushLocationQueue({ showError: false });
    }, LOCATION_QUEUE_RETRY_INTERVAL_MS);

    void flushLocationQueue({ showError: false });

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
    };
  }, [token]);

  const dashboard = snapshot?.data.dashboard ?? fallbackDashboard;
  const trip = snapshot?.data.active_trip ?? fallbackTrip;
  const unreadNotifications = snapshot?.data.notifications_unread_count ?? 0;
  const insights = snapshot?.insights ?? fallbackInsights;
  const mapMarkers = buildDriverMapMarkers(dashboard, trip);
  const mapPolylines = buildRoutePolylines(trip?.route);
  const tripAccepted = Boolean(trip?.accepted_at);
  const tripStarted = Boolean(trip?.started_at);
  const upcomingScheduledWork = dashboard?.upcoming_scheduled_work ?? [];
  const isBrowserOnline =
    typeof navigator === "undefined" ? true : navigator.onLine;

  useEffect(() => {
    if (
      typeof dashboard?.van?.latitude === "number" &&
      typeof dashboard?.van?.longitude === "number"
    ) {
      setLocation({
        latitude: dashboard.van.latitude.toFixed(6),
        longitude: dashboard.van.longitude.toFixed(6),
      });
    }
  }, [dashboard?.van?.latitude, dashboard?.van?.longitude]);

  useEffect(() => {
    if (sharingMode !== "gps" || !token) return;
    if (!navigator.geolocation) {
      setShareError("This browser does not support GPS location sharing.");
      setSharingMode("off");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation({
          latitude: next.latitude.toFixed(6),
          longitude: next.longitude.toFixed(6),
        });
        if (Date.now() - lastSentAtRef.current < 4000) {
          return;
        }
        lastSentAtRef.current = Date.now();
        void syncLocation(next.latitude, next.longitude, "Browser GPS sharing active.");
      },
      (gpsError) => {
        setShareError(gpsError.message || "Could not access live GPS.");
        setSharingMode("off");
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 2000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [sharingMode, token]);

  useEffect(() => {
    if (sharingMode !== "simulated" || !token) return;

    const startingPoint = resolveManualCoordinates(location, dashboard);
    if (!startingPoint) {
      setShareError("Set a starting location or enable GPS before simulating the route.");
      setSharingMode("off");
      return;
    }

    const intervalId = window.setInterval(() => {
      setLocation((current) => {
        const currentCoordinates =
          resolveManualCoordinates(current, dashboard) || startingPoint;
        if (!currentCoordinates) {
          return current;
        }
        const target = extractTargetCoordinates(trip?.route);
        const next = stepToward(
          currentCoordinates.latitude,
          currentCoordinates.longitude,
          target,
        );
        void syncLocation(next.latitude, next.longitude, "Simulated route is broadcasting.");
        return {
          latitude: next.latitude.toFixed(6),
          longitude: next.longitude.toFixed(6),
        };
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [
    dashboard?.van?.latitude,
    dashboard?.van?.longitude,
    location.latitude,
    location.longitude,
    sharingMode,
    token,
    trip?.route,
  ]);

  async function refresh() {
    if (!token) return;
    const [driverDashboard, activeTrip, aiInsights] = await Promise.all([
      api.getDriverDashboard(token),
      api.getDriverActiveTrip(token),
      api.getAIInsights(token),
    ]);
    setFallbackDashboard(driverDashboard);
    setFallbackTrip(activeTrip);
    setFallbackInsights(aiInsights);
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setStatusMessage(null);
    setShareError(null);
    await action();
    setStatusMessage(successMessage);
    await Promise.all([refresh(), refreshBrief()]);
  }

  function enqueueLocationUpdate(latitude: number, longitude: number) {
    const update: DriverLocationQueueItem = {
      id: buildQueueId(),
      latitude,
      longitude,
      created_at: new Date().toISOString(),
    };
    const nextQueue = trimLocationQueue(
      [...locationQueueRef.current, update],
      DRIVER_LOCATION_QUEUE_MAX_ITEMS,
    );
    locationQueueRef.current = nextQueue;
    setLocationQueue(nextQueue);
    return nextQueue.length;
  }

  async function flushLocationQueue({
    showError = true,
  }: {
    showError?: boolean;
  } = {}) {
    if (!token || queueSyncInFlightRef.current) {
      return {
        sentCount: 0,
        pendingCount: locationQueueRef.current.length,
        errorMessage: null as string | null,
      };
    }
    if (
      typeof navigator !== "undefined" &&
      !navigator.onLine
    ) {
      return {
        sentCount: 0,
        pendingCount: locationQueueRef.current.length,
        errorMessage: null as string | null,
      };
    }

    const queued = locationQueueRef.current;
    if (queued.length === 0) {
      return { sentCount: 0, pendingCount: 0, errorMessage: null as string | null };
    }

    queueSyncInFlightRef.current = true;
    setQueueSyncing(true);
    let sentCount = 0;
    let errorMessage: string | null = null;
    const flushedIds = new Set<string>();

    try {
      for (const update of queued) {
        try {
          await api.updateDriverLocation(token, update.latitude, update.longitude);
          flushedIds.add(update.id);
          sentCount += 1;
          setLastLocationSync(new Date().toISOString());
        } catch (syncError) {
          errorMessage =
            syncError instanceof Error
              ? syncError.message
              : "Could not sync queued location update.";
          break;
        }
      }

      if (flushedIds.size > 0) {
        const nextQueue = locationQueueRef.current.filter((item) => !flushedIds.has(item.id));
        locationQueueRef.current = nextQueue;
        setLocationQueue(nextQueue);
        setLastQueueFlushAt(new Date().toISOString());
        await refresh();
      }

      if (errorMessage && showError) {
        setShareError(`Queued updates are waiting to sync. ${errorMessage}`);
      }

      return {
        sentCount,
        pendingCount: locationQueueRef.current.length,
        errorMessage,
      };
    } finally {
      queueSyncInFlightRef.current = false;
      setQueueSyncing(false);
    }
  }

  async function syncLocation(
    latitude: number,
    longitude: number,
    successMessage = "Driver location updated.",
  ) {
    if (!token) return;

    const queuedCount = enqueueLocationUpdate(latitude, longitude);
    setShareError(null);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatusMessage(`Offline detected. Queued ${queuedCount} location update(s) for retry.`);
      return;
    }

    const flushResult = await flushLocationQueue();
    if (flushResult.sentCount > 0) {
      setStatusMessage(
        flushResult.pendingCount > 0
          ? `${successMessage} ${flushResult.pendingCount} update(s) still queued.`
          : successMessage,
      );
      setShareError(null);
      return;
    }

    if (flushResult.errorMessage) {
      setStatusMessage("Location update queued. Retry will continue in the background.");
      return;
    }
  }

  return (
    <AppLayout
      notificationUnreadCount={unreadNotifications}
      title={operationsOnly ? "Trip Operations" : "Driver Console"}
      subtitle={`Dispatch and fulfil trips for ${user?.name}.`}
    >
      {!operationsOnly && (
        <>
          <div className="content-grid four-column">
            <MetricPanel
              label="Assigned Van"
              value={dashboard?.van?.license_plate || "Not assigned"}
              detail={dashboard?.van?.status || "offline"}
              onClick={() => navigate("/driver/operations")}
            />
            <MetricPanel
              label="Occupancy"
              value={`${dashboard?.van?.current_occupancy || 0}/${dashboard?.van?.capacity || 0}`}
              detail="passengers onboard"
              onClick={() => navigate("/driver/operations")}
            />
            <MetricPanel
              label="Active Trip"
              value={trip ? trip.status.replaceAll("_", " ") : "No trip"}
              detail={
                trip ? `${trip.passenger_count} passenger(s)` : "waiting for dispatch"
              }
              onClick={() => navigate("/driver/operations")}
            />
            <section className="metric-panel">
              <span>Realtime Feed</span>
              <LiveStatusBadge
                state={connectionState}
                quality={connectionQuality}
                lagSeconds={streamLagSeconds}
                lastUpdatedAt={lastMessageAt}
              />
              <p>{streamError || "Trip and van updates are streaming live."}</p>
            </section>
          </div>

          <div className="content-grid two-column">
            <LiveMap
              title="Driver route board"
              subtitle="Track the van, queued pickups, and shared destination on real map tiles."
              markers={mapMarkers}
              polylines={mapPolylines}
              emptyMessage="Push a live location and receive a trip assignment to populate the route."
            />
            <CopilotPanel
              title="Driver copilot"
              brief={brief}
              reply={reply}
              loading={loading}
              asking={asking}
              error={copilotError}
              onRefresh={() => void refreshBrief()}
              onAsk={askCopilot}
            />
          </div>
        </>
      )}

      {(statusMessage || shareError) && (
        <div className="stack compact">
          {statusMessage && <div className="success-banner">{statusMessage}</div>}
          {shareError && <div className="error-banner">{shareError}</div>}
        </div>
      )}

      <div className="content-grid two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Vehicle Controls</p>
              <h3>Status and location</h3>
            </div>
          </div>
          <div className="stack">
            <div className="button-row">
              {["available", "on_trip", "offline", "maintenance"].map((status) => (
                <button
                  className="secondary-button"
                  key={status}
                  onClick={() =>
                    token &&
                    void runAction(
                      () => api.updateDriverStatus(token, status),
                      `Driver status updated to ${status}.`,
                    )
                  }
                  type="button"
                >
                  {status.replaceAll("_", " ")}
                </button>
              ))}
            </div>

            <div className="inline-grid">
              <label>
                Latitude
                <input
                  value={location.latitude}
                  onChange={(event) =>
                    setLocation((current) => ({
                      ...current,
                      latitude: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Longitude
                <input
                  value={location.longitude}
                  onChange={(event) =>
                    setLocation((current) => ({
                      ...current,
                      longitude: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="button-row">
              <button
                className="primary-button"
                onClick={() => {
                  const currentCoordinates = resolveManualCoordinates(location, dashboard);
                  if (!currentCoordinates) {
                    setShareError("Enter a valid latitude and longitude before pushing location.");
                    return;
                  }
                  void syncLocation(
                    currentCoordinates.latitude,
                    currentCoordinates.longitude,
                  );
                }}
                type="button"
              >
                Push vehicle location
              </button>
              <button
                className={sharingMode === "gps" ? "primary-button" : "secondary-button"}
                onClick={() => {
                  setSharingMode("gps");
                  setStatusMessage("Browser GPS sharing requested.");
                  setShareError(null);
                }}
                type="button"
              >
                Start GPS sharing
              </button>
              <button
                className={sharingMode === "simulated" ? "primary-button" : "secondary-button"}
                onClick={() => {
                  setSharingMode("simulated");
                  setStatusMessage("Simulated route broadcasting started.");
                  setShareError(null);
                }}
                type="button"
              >
                Simulate route
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  setSharingMode("off");
                  setStatusMessage("Continuous location sharing paused.");
                }}
                type="button"
              >
                Stop sharing
              </button>
              <button
                className="ghost-button"
                disabled={locationQueue.length === 0 || queueSyncing}
                onClick={() => void flushLocationQueue()}
                type="button"
              >
                {queueSyncing
                  ? "Syncing queued updates..."
                  : locationQueue.length > 0
                    ? `Retry queued sync (${locationQueue.length})`
                    : "Queue clear"}
              </button>
            </div>

            <div className="stack compact">
              <InfoRow label="Sharing mode" value={sharingMode} />
              <InfoRow
                label="Connection"
                value={isBrowserOnline ? "online" : "offline (queueing updates)"}
              />
              <InfoRow
                label="Last location sync"
                value={lastLocationSync ? formatTimestamp(lastLocationSync) : "No sync yet"}
              />
              <InfoRow
                label="Queue backlog"
                value={`${locationQueue.length} pending update(s)`}
              />
              <InfoRow
                label="Last queue flush"
                value={lastQueueFlushAt ? formatTimestamp(lastQueueFlushAt) : "No flush yet"}
              />
              <InfoRow
                label="Vehicle ping"
                value={
                  dashboard?.van?.last_location_update
                    ? formatTimestamp(dashboard.van.last_location_update)
                    : "Waiting for first update"
                }
              />
              <InfoRow
                label="Route source"
                value={trip?.route?.source || "Awaiting trip route"}
              />
            </div>

          </div>
        </section>

        <section className="panel standout">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Trip Board</p>
              <h3>{trip ? `Trip ${trip.id.slice(0, 8)}` : "No active assignment"}</h3>
            </div>
          </div>
          {trip ? (
            <div className="stack">
              <InfoRow label="Status" value={trip.status.replaceAll("_", " ")} />
              <InfoRow
                label="Driver acknowledgement"
                value={
                  trip.accepted_at
                    ? formatTimestamp(trip.accepted_at)
                    : "Waiting for your acceptance"
                }
              />
              <InfoRow label="Passenger count" value={`${trip.passenger_count} passenger(s)`} />
              <InfoRow
                label="Route duration"
                value={
                  trip.route?.duration_minutes
                    ? `${trip.route.duration_minutes} min`
                    : trip.estimated_duration_minutes
                      ? `${trip.estimated_duration_minutes} min`
                      : "TBD"
                }
              />
              <InfoRow
                label="Route distance"
                value={formatDistance(trip.route?.distance_meters)}
              />

              <div className="button-row">
                {!tripAccepted && (
                  <button
                    className="primary-button"
                    onClick={() =>
                      token &&
                      void runAction(() => api.acceptTrip(token, trip.id), "Trip accepted.")
                    }
                    type="button"
                  >
                    Accept trip
                  </button>
                )}
                {tripAccepted && !tripStarted && (
                  <button
                    className="primary-button"
                    onClick={() =>
                      token &&
                      void runAction(() => api.startTrip(token, trip.id), "Trip started.")
                    }
                    type="button"
                  >
                    Start trip
                  </button>
                )}
                {tripStarted && (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      token &&
                      void runAction(
                        () => api.completeTrip(token, trip.id),
                        "Trip completed and van released.",
                      )
                    }
                    type="button"
                  >
                    Complete trip
                  </button>
                )}
              </div>

              <div className="stack compact">
                {trip.passengers.map((passenger) => {
                  const pickupMapUrl = buildGoogleMapsSearchUrl(passenger.pickup_address);
                  const directionsUrl = buildGoogleMapsDirectionsUrl({
                    origin: passenger.pickup_address,
                    destination: passenger.destination_address,
                  });
                  return (
                    <div className="list-card" key={passenger.ride_request_id}>
                      <div>
                        <strong>{passenger.passenger_name || "Passenger"}</strong>
                        <p>{passenger.pickup_address}</p>
                        <p>{passenger.destination_address}</p>
                      </div>
                      <div className="button-row wrap">
                        <span className="status-pill">{passenger.status}</span>
                        {pickupMapUrl && (
                          <a
                            className="ghost-button inline-link-button"
                            href={pickupMapUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Pickup map
                          </a>
                        )}
                        {directionsUrl && (
                          <a
                            className="ghost-button inline-link-button"
                            href={directionsUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Directions
                          </a>
                        )}
                        <button
                          className="ghost-button"
                          disabled={!tripStarted}
                          onClick={() =>
                            token &&
                            void runAction(
                              () =>
                                api.pickupPassenger(
                                  token,
                                  trip.id,
                                  passenger.ride_request_id,
                                ),
                              `Picked up ${passenger.passenger_name || "passenger"}.`,
                            )
                          }
                          type="button"
                        >
                          Pick up
                        </button>
                        <button
                          className="ghost-button"
                          disabled={!tripStarted}
                          onClick={() =>
                            token &&
                            void runAction(
                              () =>
                                api.dropoffPassenger(
                                  token,
                                  trip.id,
                                  passenger.ride_request_id,
                                ),
                              `Dropped off ${passenger.passenger_name || "passenger"}.`,
                            )
                          }
                          type="button"
                        >
                          Drop off
                        </button>
                        {["assigned", "notified"].includes(passenger.status) && (
                          <button
                            className="ghost-button"
                            disabled={!tripStarted}
                            onClick={() =>
                              token &&
                              void runAction(
                                () =>
                                  api.noShowPassenger(
                                    token,
                                    trip.id,
                                    passenger.ride_request_id,
                                  ),
                                `${passenger.passenger_name || "Passenger"} marked as no-show.`,
                              )
                            }
                            type="button"
                          >
                            No-show
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {trip.route?.steps?.length > 0 && (
                <div className="stack compact">
                  <strong>Route steps</strong>
                  {trip.route.steps.slice(0, 5).map((step, index) => (
                    <div className="list-card compact-card route-step-card" key={`${step.instruction}-${index}`}>
                      <strong>{step.instruction}</strong>
                      <p>
                        {formatDistance(step.distance_meters)} - {Math.max(1, Math.ceil(step.duration_seconds / 60))} min
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="muted-copy">
              No active trip yet. Once employees request rides and a van is available, trips
              will appear here live.
            </p>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Scheduled Workload</p>
            <h3>Upcoming assigned pickups</h3>
          </div>
        </div>
        {upcomingScheduledWork.length === 0 ? (
          <p className="muted-copy">
            No scheduled assignments are waiting right now.
          </p>
        ) : (
          <div className="stack compact">
            {upcomingScheduledWork.map((item) => {
              const pickupMapUrl = buildGoogleMapsSearchUrl(item.pickup_address);
              const directionsUrl = buildGoogleMapsDirectionsUrl({
                origin: item.pickup_address,
                destination: item.destination_address,
              });
              return (
                <div className="list-card compact-card" key={item.ride_id}>
                  <div>
                    <strong>{item.passenger_name || `Ride ${item.ride_id.slice(0, 8)}`}</strong>
                    <p>
                      {item.pickup_address}
                      {" -> "}
                      {item.destination_address}
                    </p>
                    <p>
                      {item.assignment_timing_note ||
                        item.delay_explanation ||
                        "Assignment timing is being updated."}
                    </p>
                    <div className="button-row">
                      {pickupMapUrl && (
                        <a
                          className="ghost-button inline-link-button"
                          href={pickupMapUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Pickup map
                        </a>
                      )}
                      {directionsUrl && (
                        <a
                          className="ghost-button inline-link-button"
                          href={directionsUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Directions
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="stack compact align-end">
                    <span className="status-pill">
                      {item.schedule_phase?.replaceAll("_", " ") || "scheduled"}
                    </span>
                    <span className="status-pill">{item.ride_status.replaceAll("_", " ")}</span>
                    <span className="muted-copy">
                      {item.scheduled_time
                        ? `Pickup ${formatDateTime(item.scheduled_time)}`
                        : "Pickup time pending"}
                    </span>
                    <span className="muted-copy">
                      {formatScheduledCountdown(item.minutes_until_pickup, item.minutes_until_dispatch_window)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="content-grid two-column">
        {!operationsOnly ? (
          <AIInsightsPanel insights={insights} title="Live dispatch cues" />
        ) : (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Operational Cues</p>
                <h3>Trip guidance</h3>
              </div>
            </div>
            <p className="muted-copy">
              Return to the main driver console to review the full AI dispatch brief.
            </p>
          </section>
        )}
        <LiveEventsPanel events={recentEvents} title="Trip event feed" />
      </div>
    </AppLayout>
  );
}

export function DriverNotificationsPage() {
  const { token, user } = useAuth();
  const { snapshot } = useLiveStream<DriverLiveSnapshot>(token);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setUnreadCount(snapshot?.data.notifications_unread_count ?? 0);
  }, [snapshot?.data.notifications_unread_count]);

  return (
    <AppLayout
      notificationUnreadCount={unreadCount}
      title="Notifications"
      subtitle={`Review dispatch, route, and vehicle updates for ${user?.name}.`}
    >
      <NotificationCenterPanel
        title="Driver notifications"
        eyebrow="Notifications"
        initialNotifications={snapshot?.data.notifications ?? []}
        initialUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
        emptyMessage="Trip assignments, route changes, and stale GPS warnings will appear here."
        onUnreadCountChange={setUnreadCount}
      />
    </AppLayout>
  );
}

function extractTargetCoordinates(route?: RoutePlan | null) {
  if (!route) {
    return null;
  }

  const nextStop = route.pickup_sequence?.find((item) =>
    ["assigned", "notified"].includes(item.status || ""),
  );
  if (
    typeof nextStop?.pickup_latitude === "number" &&
    typeof nextStop?.pickup_longitude === "number"
  ) {
    return {
      latitude: nextStop.pickup_latitude,
      longitude: nextStop.pickup_longitude,
    };
  }

  if (
    typeof route.destination_latitude === "number" &&
    typeof route.destination_longitude === "number"
  ) {
    return {
      latitude: route.destination_latitude,
      longitude: route.destination_longitude,
    };
  }

  return null;
}

function stepToward(
  currentLatitude: number,
  currentLongitude: number,
  target: { latitude: number; longitude: number } | null,
) {
  if (!target) {
    return {
      latitude: currentLatitude + 0.0004,
      longitude: currentLongitude + 0.0004,
    };
  }

  const latitudeDelta = target.latitude - currentLatitude;
  const longitudeDelta = target.longitude - currentLongitude;

  return {
    latitude: currentLatitude + latitudeDelta * 0.28,
    longitude: currentLongitude + longitudeDelta * 0.28,
  };
}

function buildDriverMapMarkers(
  dashboard: DriverDashboardSummary | null,
  trip: DriverTripSummary | null,
): MapMarkerSpec[] {
  const markers: MapMarkerSpec[] = [];
  if (
    typeof dashboard?.van?.latitude === "number" &&
    typeof dashboard?.van?.longitude === "number"
  ) {
    markers.push({
      id: "driver-van",
      latitude: dashboard.van.latitude,
      longitude: dashboard.van.longitude,
      title: dashboard.van.license_plate,
      subtitle: dashboard.van.status,
      tone: "van",
    });
  }
  for (const stop of trip?.route?.pickup_sequence || []) {
    if (
      typeof stop.pickup_latitude === "number" &&
      typeof stop.pickup_longitude === "number"
    ) {
      markers.push({
        id: `${stop.ride_request_id}-pickup`,
        latitude: stop.pickup_latitude,
        longitude: stop.pickup_longitude,
        title: stop.passenger_name || "Pickup",
        subtitle: stop.pickup_address || undefined,
        tone: stop.status === "assigned" ? "pickup" : "warning",
      });
    }
  }
  if (
    typeof trip?.route?.destination_latitude === "number" &&
    typeof trip?.route?.destination_longitude === "number"
  ) {
    markers.push({
      id: "driver-destination",
      latitude: trip.route.destination_latitude,
      longitude: trip.route.destination_longitude,
      title: "Shared destination",
      subtitle: trip.route.destination_address || undefined,
      tone: "destination",
    });
  }
  return markers;
}

function buildRoutePolylines(route?: RoutePlan | null): MapPolylineSpec[] {
  if (!route) {
    return [];
  }
  if (route.encoded_polyline) {
    return [{ id: "route", encodedPath: route.encoded_polyline, color: "#58b6ff" }];
  }

  const points = [
    route.origin
      ? { latitude: route.origin.latitude, longitude: route.origin.longitude }
      : null,
    ...route.waypoints.map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
    })),
    route.destination
      ? { latitude: route.destination.latitude, longitude: route.destination.longitude }
      : null,
  ].filter(Boolean) as Array<{ latitude: number; longitude: number }>;

  return points.length > 1 ? [{ id: "route", points, color: "#58b6ff" }] : [];
}

function resolveManualCoordinates(
  location: { latitude: string; longitude: string },
  dashboard: DriverDashboardSummary | null,
) {
  const latitude = parseCoordinateInput(location.latitude);
  const longitude = parseCoordinateInput(location.longitude);
  if (latitude !== null && longitude !== null) {
    return { latitude, longitude };
  }
  if (
    typeof dashboard?.van?.latitude === "number" &&
    typeof dashboard?.van?.longitude === "number"
  ) {
    return {
      latitude: dashboard.van.latitude,
      longitude: dashboard.van.longitude,
    };
  }
  return null;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDistance(value?: number | null) {
  if (!value) {
    return "TBD";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} km`;
  }
  return `${value} m`;
}

function parseCoordinateInput(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatScheduledCountdown(
  minutesUntilPickup?: number | null,
  minutesUntilDispatchWindow?: number | null,
) {
  if (typeof minutesUntilPickup === "number") {
    if (minutesUntilPickup > 0) {
      return `${minutesUntilPickup} min until pickup`;
    }
    if (minutesUntilPickup === 0) {
      return "Pickup window is now";
    }
    return `${Math.abs(minutesUntilPickup)} min past pickup window`;
  }
  if (
    typeof minutesUntilDispatchWindow === "number" &&
    minutesUntilDispatchWindow > 0
  ) {
    return `Dispatch starts in ${minutesUntilDispatchWindow} min`;
  }
  return "Dispatch timing in progress";
}

function loadDriverLocationQueue(): DriverLocationQueueItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(DRIVER_LOCATION_QUEUE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const sanitized = parsed.filter(isDriverLocationQueueItem);
    return trimLocationQueue(sanitized, DRIVER_LOCATION_QUEUE_MAX_ITEMS);
  } catch {
    return [];
  }
}

function persistDriverLocationQueue(queue: DriverLocationQueueItem[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      DRIVER_LOCATION_QUEUE_STORAGE_KEY,
      JSON.stringify(trimLocationQueue(queue, DRIVER_LOCATION_QUEUE_MAX_ITEMS)),
    );
  } catch {
    // Ignore local storage write failures to avoid blocking dispatch operations.
  }
}

function trimLocationQueue(queue: DriverLocationQueueItem[], maxItems: number) {
  if (queue.length <= maxItems) {
    return queue;
  }
  return queue.slice(queue.length - maxItems);
}

function isDriverLocationQueueItem(value: unknown): value is DriverLocationQueueItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.latitude === "number" &&
    typeof candidate.longitude === "number" &&
    typeof candidate.created_at === "string"
  );
}

function buildQueueId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `queue-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}
