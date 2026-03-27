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

export function DriverDashboard({ operationsOnly = false }: { operationsOnly?: boolean }) {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { snapshot, connectionState, lastMessageAt, streamError, recentEvents } =
    useLiveStream<DriverLiveSnapshot>(token);
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
  const [location, setLocation] = useState({ latitude: "", longitude: "" });
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    if (!token) return;
    void refresh();
  }, [token]);

  const dashboard = snapshot?.data.dashboard ?? fallbackDashboard;
  const trip = snapshot?.data.active_trip ?? fallbackTrip;
  const notifications = snapshot?.data.notifications ?? [];
  const unreadNotifications = snapshot?.data.notifications_unread_count ?? 0;
  const insights = snapshot?.insights ?? fallbackInsights;
  const mapMarkers = buildDriverMapMarkers(dashboard, trip);
  const mapPolylines = buildRoutePolylines(trip?.route);

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

  async function syncLocation(
    latitude: number,
    longitude: number,
    successMessage = "Driver location updated.",
  ) {
    if (!token) return;
    try {
      await api.updateDriverLocation(token, latitude, longitude);
      setLastLocationSync(new Date().toISOString());
      setStatusMessage(successMessage);
      setShareError(null);
      await refresh();
    } catch (locationError) {
      setShareError(
        locationError instanceof Error ? locationError.message : "Could not update location.",
      );
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
              <LiveStatusBadge state={connectionState} lastUpdatedAt={lastMessageAt} />
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
            </div>

            <div className="stack compact">
              <InfoRow label="Sharing mode" value={sharingMode} />
              <InfoRow
                label="Last location sync"
                value={lastLocationSync ? formatTimestamp(lastLocationSync) : "No sync yet"}
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
              </div>

              <div className="stack compact">
                {trip.passengers.map((passenger) => (
                  <div className="list-card" key={passenger.ride_request_id}>
                    <div>
                      <strong>{passenger.passenger_name || "Passenger"}</strong>
                      <p>{passenger.pickup_address}</p>
                      <p>{passenger.destination_address}</p>
                    </div>
                    <div className="button-row wrap">
                      <span className="status-pill">{passenger.status}</span>
                      <button
                        className="ghost-button"
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
                ))}
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
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
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
