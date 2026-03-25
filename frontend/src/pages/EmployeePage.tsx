import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/Layout";
import { CopilotPanel } from "../components/CopilotPanel";
import { LiveMap } from "../components/LiveMap";
import { AIInsightsPanel, InfoRow, LiveStatusBadge, RideTable } from "../components/common";
import { useCopilot } from "../hooks/useCopilot";
import { useLiveStream } from "../hooks/useLiveStream";
import { api } from "../lib/api";
import type {
  EmployeeLiveSnapshot,
  MapMarkerSpec,
  MapPolylineSpec,
  RideSummary,
  RoutePlan,
} from "../lib/types";
import { useAuth } from "../state/auth";

const EMPTY_RIDE_FORM = {
  pickup_address: "",
  pickup_latitude: "",
  pickup_longitude: "",
  destination_address: "",
  destination_latitude: "",
  destination_longitude: "",
  scheduled_time: "",
};

export function EmployeeDashboard() {
  const { token, user } = useAuth();
  const { snapshot, connectionState, lastMessageAt, streamError } =
    useLiveStream<EmployeeLiveSnapshot>(token);
  const { brief, reply, loading, asking, error: copilotError, refreshBrief, askCopilot } =
    useCopilot(token);
  const [fallbackActiveRide, setFallbackActiveRide] = useState<RideSummary | null>(null);
  const [fallbackRideHistory, setFallbackRideHistory] = useState<RideSummary[]>([]);
  const [routePreview, setRoutePreview] = useState<RoutePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [resolvingField, setResolvingField] = useState<"pickup" | "destination" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_RIDE_FORM);
  const [profileDefaultsApplied, setProfileDefaultsApplied] = useState(false);

  useEffect(() => {
    if (!token) return;
    void refresh();
  }, [token]);

  useEffect(() => {
    if (!user || profileDefaultsApplied) {
      return;
    }

    setForm((current) => ({
      ...current,
      pickup_address: current.pickup_address || user.home_address || "",
      pickup_latitude: current.pickup_latitude || formatCoordinate(user.home_latitude),
      pickup_longitude: current.pickup_longitude || formatCoordinate(user.home_longitude),
      destination_address:
        current.destination_address || user.default_destination_address || "",
      destination_latitude:
        current.destination_latitude ||
        formatCoordinate(user.default_destination_latitude),
      destination_longitude:
        current.destination_longitude ||
        formatCoordinate(user.default_destination_longitude),
    }));
    setProfileDefaultsApplied(true);
  }, [profileDefaultsApplied, user]);

  useEffect(() => {
    if (!token) return;
    const pickupLatitude = Number(form.pickup_latitude);
    const pickupLongitude = Number(form.pickup_longitude);
    const destinationLatitude = Number(form.destination_latitude);
    const destinationLongitude = Number(form.destination_longitude);
    if (
      !Number.isFinite(pickupLatitude) ||
      !Number.isFinite(pickupLongitude) ||
      !Number.isFinite(destinationLatitude) ||
      !Number.isFinite(destinationLongitude)
    ) {
      setRoutePreview(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void api
        .previewRoute(token, {
          origin: {
            latitude: pickupLatitude,
            longitude: pickupLongitude,
            address: form.pickup_address,
            label: "Pickup",
            kind: "origin",
          },
          destination: {
            latitude: destinationLatitude,
            longitude: destinationLongitude,
            address: form.destination_address,
            label: "Destination",
            kind: "destination",
          },
        })
        .then(setRoutePreview)
        .catch(() => setRoutePreview(null));
    }, 550);

    return () => window.clearTimeout(timeoutId);
  }, [
    form.destination_address,
    form.destination_latitude,
    form.destination_longitude,
    form.pickup_address,
    form.pickup_latitude,
    form.pickup_longitude,
    token,
  ]);

  const activeRide = snapshot?.data.active_ride ?? fallbackActiveRide;
  const rideHistory = snapshot?.data.ride_history ?? fallbackRideHistory;
  const insights = snapshot?.insights ?? [];
  const mapMarkers = useMemo(
    () => (activeRide ? buildActiveRideMarkers(activeRide) : buildPreviewMarkers(form)),
    [activeRide, form],
  );
  const mapPolylines = useMemo<MapPolylineSpec[]>(
    () =>
      activeRide?.route_polyline
        ? [{ id: "active-ride", encodedPath: activeRide.route_polyline, color: "#58b6ff" }]
        : routePreview?.encoded_polyline
          ? [{ id: "preview-route", encodedPath: routePreview.encoded_polyline, color: "#ff8a4c" }]
          : [],
    [activeRide?.route_polyline, routePreview?.encoded_polyline],
  );

  async function refresh() {
    if (!token) return;
    const [active, history] = await Promise.all([
      api.getActiveRide(token),
      api.getRideHistory(token),
    ]);
    setFallbackActiveRide(active);
    setFallbackRideHistory(history);
  }

  async function handleRequestRide(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const ride = await api.requestRide(token, {
        pickup: {
          address: form.pickup_address,
          latitude: Number(form.pickup_latitude),
          longitude: Number(form.pickup_longitude),
        },
        destination: {
          address: form.destination_address,
          latitude: Number(form.destination_latitude),
          longitude: Number(form.destination_longitude),
        },
        scheduled_time: form.scheduled_time
          ? new Date(form.scheduled_time).toISOString()
          : null,
      });
      setMessage(
        ride.trip_id
          ? `Ride assigned to ${ride.van_license_plate || "a van"} with live route tracking.`
          : "Ride request submitted and waiting for assignment.",
      );
      await Promise.all([refresh(), refreshBrief()]);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not request ride.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setError("This browser does not support location access.");
      return;
    }

    setLocationBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);
        setForm((current) => ({
          ...current,
          pickup_address: `${latitude}, ${longitude}`,
          pickup_latitude: latitude,
          pickup_longitude: longitude,
        }));
        setLocationBusy(false);
        setMessage("Pickup coordinates updated from your current location.");
      },
      (geolocationError) => {
        setLocationBusy(false);
        setError(geolocationError.message || "Could not read your current location.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function resolveAddress(field: "pickup" | "destination") {
    if (!token) return;
    const address =
      field === "pickup" ? form.pickup_address.trim() : form.destination_address.trim();
    if (!address) {
      return;
    }
    setResolvingField(field);
    setError(null);
    try {
      const result = await api.geocodeAddress(token, address);
      if (field === "pickup") {
        setForm((current) => ({
          ...current,
          pickup_address: result.address,
          pickup_latitude: result.latitude.toFixed(6),
          pickup_longitude: result.longitude.toFixed(6),
        }));
      } else {
        setForm((current) => ({
          ...current,
          destination_address: result.address,
          destination_latitude: result.latitude.toFixed(6),
          destination_longitude: result.longitude.toFixed(6),
        }));
      }
      setMessage(`${field === "pickup" ? "Pickup" : "Destination"} resolved with Google Maps.`);
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : "Could not resolve that address.",
      );
    } finally {
      setResolvingField(null);
    }
  }

  return (
    <AppLayout
      title="Employee Ride Desk"
      subtitle={`Book and track commute requests for ${user?.name}.`}
    >
      <div className="content-grid three-column">
        <section className="panel standout">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Realtime Feed</p>
              <h3>Ride signal</h3>
            </div>
            <LiveStatusBadge state={connectionState} lastUpdatedAt={lastMessageAt} />
          </div>
          <div className="stack compact">
            <InfoRow
              label="Live tracking"
              value={activeRide?.van_license_plate ? "Driver feed active" : "Waiting for assignment"}
            />
            <InfoRow
              label="Vehicle ping"
              value={
                activeRide?.van_last_location_update
                  ? formatTimestamp(activeRide.van_last_location_update)
                  : "No live ping yet"
              }
            />
            <InfoRow
              label="Connection"
              value={streamError || "Listening for ride, van, and ETA updates"}
            />
          </div>
        </section>

        <section className="panel standout">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Active Ride</p>
              <h3>{activeRide ? activeRide.status.replaceAll("_", " ") : "No live ride"}</h3>
            </div>
          </div>
          {activeRide ? (
            <div className="stack">
              <InfoRow label="Pickup" value={activeRide.pickup_address} />
              <InfoRow label="Destination" value={activeRide.destination_address} />
              <InfoRow
                label="Van"
                value={activeRide.van_license_plate || "Awaiting van assignment"}
              />
              <InfoRow
                label="Driver"
                value={activeRide.driver_name || "Assignment in progress"}
              />
              <InfoRow
                label="ETA"
                value={
                  activeRide.route_duration_minutes
                    ? `${activeRide.route_duration_minutes} min route`
                    : activeRide.estimated_wait_minutes
                      ? `${activeRide.estimated_wait_minutes} min wait`
                      : "TBD"
                }
              />
              <InfoRow
                label="Next stop"
                value={activeRide.next_stop_address || "Awaiting next movement"}
              />
            </div>
          ) : (
            <p className="muted-copy">
              No active ride yet. Submit a request and the system will match or pool it in realtime.
            </p>
          )}
        </section>

        <AIInsightsPanel insights={insights} title="Live dispatch cues" />
      </div>

      <div className="content-grid two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Request Ride</p>
              <h3>Book your next pooled van</h3>
            </div>
          </div>
          <form className="stack" onSubmit={handleRequestRide}>
            <div className="button-row">
              <button
                className="secondary-button"
                disabled={locationBusy}
                onClick={handleUseCurrentLocation}
                type="button"
              >
                {locationBusy ? "Reading location..." : "Use my live pickup"}
              </button>
              <button
                className="ghost-button"
                disabled={resolvingField === "pickup"}
                onClick={() => void resolveAddress("pickup")}
                type="button"
              >
                {resolvingField === "pickup" ? "Resolving..." : "Resolve pickup"}
              </button>
              <button
                className="ghost-button"
                disabled={resolvingField === "destination"}
                onClick={() => void resolveAddress("destination")}
                type="button"
              >
                {resolvingField === "destination" ? "Resolving..." : "Resolve destination"}
              </button>
            </div>
            <label>
              Pickup address
              <input
                value={form.pickup_address}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    pickup_address: event.target.value,
                  }))
                }
              />
            </label>
            <div className="inline-grid">
              <label>
                Pickup lat
                <input
                  value={form.pickup_latitude}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pickup_latitude: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Pickup lng
                <input
                  value={form.pickup_longitude}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pickup_longitude: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label>
              Destination address
              <input
                value={form.destination_address}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    destination_address: event.target.value,
                  }))
                }
              />
            </label>
            <div className="inline-grid">
              <label>
                Destination lat
                <input
                  value={form.destination_latitude}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      destination_latitude: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Destination lng
                <input
                  value={form.destination_longitude}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      destination_longitude: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label>
              Schedule for later
              <input
                type="datetime-local"
                value={form.scheduled_time}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scheduled_time: event.target.value,
                  }))
                }
              />
            </label>
            {(routePreview || activeRide) && (
              <div className="route-meta">
                <InfoRow
                  label="Route source"
                  value={activeRide?.route_polyline ? "Active trip route" : routePreview?.source || "Preview"}
                />
                <InfoRow
                  label="Distance"
                  value={formatDistance(activeRide?.route_distance_meters || routePreview?.distance_meters)}
                />
                <InfoRow
                  label="Duration"
                  value={
                    activeRide?.route_duration_minutes
                      ? `${activeRide.route_duration_minutes} min`
                      : routePreview?.duration_minutes
                        ? `${routePreview.duration_minutes} min`
                        : "TBD"
                  }
                />
              </div>
            )}
            {message && <div className="success-banner">{message}</div>}
            {error && <div className="error-banner">{error}</div>}
            <button className="primary-button" disabled={busy}>
              {busy ? "Submitting..." : "Request pooled ride"}
            </button>
          </form>
        </section>

        <LiveMap
          title={activeRide ? "Assigned route" : "Trip preview"}
          subtitle={
            activeRide
              ? "Watch your assigned van, pickup, and destination on the live map."
              : "Preview the route the matcher will use once your request is submitted."
          }
          markers={mapMarkers}
          polylines={mapPolylines}
          emptyMessage="Resolve addresses or enable live ride data to populate the map."
        />
      </div>

      <CopilotPanel
        title="Commute copilot"
        brief={brief}
        reply={reply}
        loading={loading}
        asking={asking}
        error={copilotError}
        onRefresh={() => void refreshBrief()}
        onAsk={askCopilot}
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Ride Timeline</p>
            <h3>Recent requests</h3>
          </div>
        </div>
        <RideTable rides={rideHistory.slice(0, 6)} />
      </section>
    </AppLayout>
  );
}

export function EmployeeHistoryPage() {
  const { token } = useAuth();
  const { snapshot, connectionState, lastMessageAt } =
    useLiveStream<EmployeeLiveSnapshot>(token);
  const [rides, setRides] = useState<RideSummary[]>([]);

  useEffect(() => {
    if (!token) return;
    void api.getRideHistory(token).then(setRides);
  }, [token]);

  const history = snapshot?.data.ride_history ?? rides;

  return (
    <AppLayout
      title="Ride History"
      subtitle="A focused view of your booked, matched, and completed commute requests."
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Realtime Feed</p>
            <h3>History sync</h3>
          </div>
          <LiveStatusBadge state={connectionState} lastUpdatedAt={lastMessageAt} />
        </div>
        <RideTable rides={history} />
      </section>
    </AppLayout>
  );
}

function buildActiveRideMarkers(ride: RideSummary): MapMarkerSpec[] {
  const markers: MapMarkerSpec[] = [];
  if (
    typeof ride.pickup_latitude === "number" &&
    typeof ride.pickup_longitude === "number"
  ) {
    markers.push({
      id: `${ride.id}-pickup`,
      latitude: ride.pickup_latitude,
      longitude: ride.pickup_longitude,
      title: "Pickup",
      subtitle: ride.pickup_address,
      tone: "pickup",
    });
  }
  if (
    typeof ride.destination_latitude === "number" &&
    typeof ride.destination_longitude === "number"
  ) {
    markers.push({
      id: `${ride.id}-destination`,
      latitude: ride.destination_latitude,
      longitude: ride.destination_longitude,
      title: "Destination",
      subtitle: ride.destination_address,
      tone: "destination",
    });
  }
  if (typeof ride.van_latitude === "number" && typeof ride.van_longitude === "number") {
    markers.push({
      id: `${ride.id}-van`,
      latitude: ride.van_latitude,
      longitude: ride.van_longitude,
      title: ride.van_license_plate || "Assigned van",
      subtitle: ride.driver_name || "Driver en route",
      tone: "van",
    });
  }
  return markers;
}

function buildPreviewMarkers(form: {
  pickup_address: string;
  pickup_latitude: string;
  pickup_longitude: string;
  destination_address: string;
  destination_latitude: string;
  destination_longitude: string;
}): MapMarkerSpec[] {
  const markers: MapMarkerSpec[] = [];
  const pickupLatitude = Number(form.pickup_latitude);
  const pickupLongitude = Number(form.pickup_longitude);
  const destinationLatitude = Number(form.destination_latitude);
  const destinationLongitude = Number(form.destination_longitude);

  if (Number.isFinite(pickupLatitude) && Number.isFinite(pickupLongitude)) {
    markers.push({
      id: "preview-pickup",
      latitude: pickupLatitude,
      longitude: pickupLongitude,
      title: "Pickup",
      subtitle: form.pickup_address,
      tone: "pickup",
    });
  }
  if (Number.isFinite(destinationLatitude) && Number.isFinite(destinationLongitude)) {
    markers.push({
      id: "preview-destination",
      latitude: destinationLatitude,
      longitude: destinationLongitude,
      title: "Destination",
      subtitle: form.destination_address,
      tone: "destination",
    });
  }
  return markers;
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

function formatCoordinate(value?: number | null) {
  return typeof value === "number" ? value.toFixed(6) : "";
}
