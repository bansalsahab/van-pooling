import { useEffect, useMemo, useRef, useState } from "react";

import { AppLayout } from "../components/Layout";
import { CopilotPanel } from "../components/CopilotPanel";
import { LiveMap } from "../components/LiveMap";
import { NotificationCenterPanel } from "../components/NotificationPanel";
import {
  AIInsightsPanel,
  InfoRow,
  LiveEventsPanel,
  LiveStatusBadge,
  RideTable,
} from "../components/common";
import { useCopilot } from "../hooks/useCopilot";
import { useLiveStream } from "../hooks/useLiveStream";
import { loadGoogleMapsApi } from "../lib/googleMaps";
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

type AddressField = "pickup" | "destination";

interface PlaceSuggestion {
  placeId: string;
  description: string;
  primaryText: string;
  secondaryText?: string;
}

export function EmployeeDashboard() {
  const { token, user } = useAuth();
  const { snapshot, connectionState, lastMessageAt, streamError, recentEvents } =
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
  const [suggestions, setSuggestions] = useState<Record<AddressField, PlaceSuggestion[]>>({
    pickup: [],
    destination: [],
  });
  const [suggestionsLoading, setSuggestionsLoading] = useState<
    Record<AddressField, boolean>
  >({
    pickup: false,
    destination: false,
  });
  const [activeAutocompleteField, setActiveAutocompleteField] =
    useState<AddressField | null>(null);
  const autocompleteServiceRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

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
    const pickupLatitude = parseCoordinateInput(form.pickup_latitude);
    const pickupLongitude = parseCoordinateInput(form.pickup_longitude);
    const destinationLatitude = parseCoordinateInput(form.destination_latitude);
    const destinationLongitude = parseCoordinateInput(form.destination_longitude);
    if (
      pickupLatitude === null ||
      pickupLongitude === null ||
      destinationLatitude === null ||
      destinationLongitude === null
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

  useEffect(
    () =>
      queueAutocompleteSuggestions(
        "pickup",
        form.pickup_address,
        form.pickup_latitude,
        form.pickup_longitude,
      ),
    [form.pickup_address, form.pickup_latitude, form.pickup_longitude],
  );

  useEffect(
    () =>
      queueAutocompleteSuggestions(
        "destination",
        form.destination_address,
        form.destination_latitude,
        form.destination_longitude,
      ),
    [form.destination_address, form.destination_latitude, form.destination_longitude],
  );

  const activeRide = snapshot?.data.active_ride ?? fallbackActiveRide;
  const rideHistory = snapshot?.data.ride_history ?? fallbackRideHistory;
  const notifications = snapshot?.data.notifications ?? [];
  const unreadNotifications = snapshot?.data.notifications_unread_count ?? 0;
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

  async function ensureAutocompleteServices() {
    const google = await loadGoogleMapsApi();
    if (!google?.maps?.places) {
      return null;
    }
    if (!autocompleteServiceRef.current) {
      autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
    }
    if (!geocoderRef.current) {
      geocoderRef.current = new google.maps.Geocoder();
    }
    return {
      google,
      autocompleteService: autocompleteServiceRef.current,
      geocoder: geocoderRef.current,
    };
  }

  function queueAutocompleteSuggestions(
    field: AddressField,
    address: string,
    latitudeValue: string,
    longitudeValue: string,
  ) {
    const query = address.trim();
    const hasCoordinates =
      parseCoordinateInput(latitudeValue) !== null &&
      parseCoordinateInput(longitudeValue) !== null;
    if (query.length < 3 || hasCoordinates) {
      setSuggestions((current) => ({ ...current, [field]: [] }));
      setSuggestionsLoading((current) => ({ ...current, [field]: false }));
      return () => {};
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setSuggestionsLoading((current) => ({ ...current, [field]: true }));
        const services = await ensureAutocompleteServices();
        if (!services) {
          setSuggestions((current) => ({ ...current, [field]: [] }));
          return;
        }

        const predictions = await new Promise<any[]>((resolve) => {
          services.autocompleteService.getPlacePredictions(
            {
              input: query,
              componentRestrictions: { country: "in" },
              types: ["geocode"],
            },
            (results: any[] | null) => resolve(results || []),
          );
        });

        setSuggestions((current) => ({
          ...current,
          [field]: predictions.slice(0, 5).map((prediction) => ({
            placeId: prediction.place_id,
            description: prediction.description,
            primaryText:
              prediction.structured_formatting?.main_text || prediction.description,
            secondaryText: prediction.structured_formatting?.secondary_text,
          })),
        }));
      } catch {
        setSuggestions((current) => ({ ...current, [field]: [] }));
      } finally {
        setSuggestionsLoading((current) => ({ ...current, [field]: false }));
      }
    }, 260);

    return () => window.clearTimeout(timeoutId);
  }

  async function applyAutocompleteSuggestion(
    field: AddressField,
    suggestion: PlaceSuggestion,
  ) {
    const services = await ensureAutocompleteServices();
    if (!services) {
      if (!token) return;
      setForm((current) =>
        field === "pickup"
          ? { ...current, pickup_address: suggestion.description }
          : { ...current, destination_address: suggestion.description },
      );
      await resolveAddress(field, suggestion.description);
      return;
    }

    setResolvingField(field);
    setError(null);
    try {
      const results = await new Promise<any[]>((resolve, reject) => {
        services.geocoder.geocode(
          { placeId: suggestion.placeId },
          (items: any[] | null, status: string) => {
            if (status !== "OK" || !items?.length) {
              reject(new Error("Could not resolve that place."));
              return;
            }
            resolve(items);
          },
        );
      });

      const selected = results[0];
      const location = selected.geometry?.location;
      const latitude = typeof location?.lat === "function" ? location.lat() : null;
      const longitude = typeof location?.lng === "function" ? location.lng() : null;
      if (latitude === null || longitude === null) {
        throw new Error("Could not read coordinates for the selected place.");
      }

      if (field === "pickup") {
        setForm((current) => ({
          ...current,
          pickup_address: selected.formatted_address || suggestion.description,
          pickup_latitude: latitude.toFixed(6),
          pickup_longitude: longitude.toFixed(6),
        }));
      } else {
        setForm((current) => ({
          ...current,
          destination_address: selected.formatted_address || suggestion.description,
          destination_latitude: latitude.toFixed(6),
          destination_longitude: longitude.toFixed(6),
        }));
      }
      setSuggestions((current) => ({ ...current, [field]: [] }));
      setActiveAutocompleteField(null);
      setMessage(
        `${field === "pickup" ? "Pickup" : "Destination"} selected from live map suggestions.`,
      );
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "Could not resolve that place.",
      );
    } finally {
      setResolvingField(null);
    }
  }

  async function handleRequestRide(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    const pickupLatitude = parseCoordinateInput(form.pickup_latitude);
    const pickupLongitude = parseCoordinateInput(form.pickup_longitude);
    const destinationLatitude = parseCoordinateInput(form.destination_latitude);
    const destinationLongitude = parseCoordinateInput(form.destination_longitude);
    if (
      pickupLatitude === null ||
      pickupLongitude === null ||
      destinationLatitude === null ||
      destinationLongitude === null
    ) {
      setError("Resolve or enter valid pickup and destination coordinates before requesting a ride.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const ride = await api.requestRide(token, {
        pickup: {
          address: form.pickup_address,
          latitude: pickupLatitude,
          longitude: pickupLongitude,
        },
        destination: {
          address: form.destination_address,
          latitude: destinationLatitude,
          longitude: destinationLongitude,
        },
        scheduled_time: form.scheduled_time
          ? new Date(form.scheduled_time).toISOString()
          : null,
      });
      setMessage(
        ride.trip_id
          ? `Ride assigned to ${ride.van_license_plate || "a van"} with live route tracking.`
          : ride.scheduled_time
            ? "Scheduled ride queued and waiting for its dispatch window."
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

  async function resolveAddress(
    field: "pickup" | "destination",
    explicitAddress?: string,
  ) {
    if (!token) return;
    const address = explicitAddress?.trim()
      || (field === "pickup" ? form.pickup_address.trim() : form.destination_address.trim());
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

  async function handleCancelRide() {
    if (!token || !activeRide) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.cancelRide(token, activeRide.id);
      setMessage("Ride cancelled before pickup and capacity released.");
      await Promise.all([refresh(), refreshBrief()]);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : "Could not cancel the ride.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout
      notificationUnreadCount={unreadNotifications}
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
                label="Driver confirmation"
                value={
                  activeRide.driver_acknowledged_at
                    ? formatTimestamp(activeRide.driver_acknowledged_at)
                    : activeRide.trip_id
                      ? "Waiting for driver confirmation"
                      : "Assignment in progress"
                }
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
              {isRideCancellable(activeRide.status) && (
                <button
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => void handleCancelRide()}
                  type="button"
                >
                  {busy ? "Cancelling..." : "Cancel before pickup"}
                </button>
              )}
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
            <label className="address-field">
              Pickup address
              <input
                value={form.pickup_address}
                onFocus={() => setActiveAutocompleteField("pickup")}
                onBlur={() =>
                  window.setTimeout(() => {
                    setActiveAutocompleteField((current) =>
                      current === "pickup" ? null : current,
                    );
                  }, 120)
                }
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    pickup_address: event.target.value,
                    pickup_latitude: "",
                    pickup_longitude: "",
                  }))
                }
              />
              {activeAutocompleteField === "pickup" &&
                (suggestionsLoading.pickup || suggestions.pickup.length > 0) && (
                <div className="autocomplete-list">
                  {suggestionsLoading.pickup && (
                    <div className="autocomplete-status">Searching places...</div>
                  )}
                  {!suggestionsLoading.pickup &&
                    suggestions.pickup.map((suggestion) => (
                      <button
                        className="autocomplete-option"
                        key={suggestion.placeId}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => void applyAutocompleteSuggestion("pickup", suggestion)}
                        type="button"
                      >
                        <strong>{suggestion.primaryText}</strong>
                        {suggestion.secondaryText && <span>{suggestion.secondaryText}</span>}
                      </button>
                    ))}
                </div>
              )}
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
            <label className="address-field">
              Destination address
              <input
                value={form.destination_address}
                onFocus={() => setActiveAutocompleteField("destination")}
                onBlur={() =>
                  window.setTimeout(() => {
                    setActiveAutocompleteField((current) =>
                      current === "destination" ? null : current,
                    );
                  }, 120)
                }
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    destination_address: event.target.value,
                    destination_latitude: "",
                    destination_longitude: "",
                  }))
                }
              />
              {activeAutocompleteField === "destination" &&
                (suggestionsLoading.destination || suggestions.destination.length > 0) && (
                <div className="autocomplete-list">
                  {suggestionsLoading.destination && (
                    <div className="autocomplete-status">Searching places...</div>
                  )}
                  {!suggestionsLoading.destination &&
                    suggestions.destination.map((suggestion) => (
                      <button
                        className="autocomplete-option"
                        key={suggestion.placeId}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => void applyAutocompleteSuggestion("destination", suggestion)}
                        type="button"
                      >
                        <strong>{suggestion.primaryText}</strong>
                        {suggestion.secondaryText && <span>{suggestion.secondaryText}</span>}
                      </button>
                    ))}
                </div>
              )}
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
                  value={
                    activeRide?.route_polyline
                      ? "Active trip route"
                      : routePreview?.source || "Preview"
                  }
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

      <LiveEventsPanel events={recentEvents} title="Ride lifecycle feed" />

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
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
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

export function EmployeeNotificationsPage() {
  const { token } = useAuth();
  const { snapshot } = useLiveStream<EmployeeLiveSnapshot>(token);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setUnreadCount(snapshot?.data.notifications_unread_count ?? 0);
  }, [snapshot?.data.notifications_unread_count]);

  return (
    <AppLayout
      notificationUnreadCount={unreadCount}
      title="Notifications"
      subtitle="Review ride assignment, arrival, delay, and completion updates in one place."
    >
      <NotificationCenterPanel
        title="Ride notifications"
        eyebrow="Notifications"
        initialNotifications={snapshot?.data.notifications ?? []}
        initialUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
        emptyMessage="Ride assignment, arrival, and cancellation updates will appear here."
        onUnreadCountChange={setUnreadCount}
      />
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
  const pickupLatitude = parseCoordinateInput(form.pickup_latitude);
  const pickupLongitude = parseCoordinateInput(form.pickup_longitude);
  const destinationLatitude = parseCoordinateInput(form.destination_latitude);
  const destinationLongitude = parseCoordinateInput(form.destination_longitude);

  if (pickupLatitude !== null && pickupLongitude !== null) {
    markers.push({
      id: "preview-pickup",
      latitude: pickupLatitude,
      longitude: pickupLongitude,
      title: "Pickup",
      subtitle: form.pickup_address,
      tone: "pickup",
    });
  }
  if (destinationLatitude !== null && destinationLongitude !== null) {
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

function parseCoordinateInput(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function isRideCancellable(status: string) {
  return [
    "requested",
    "matching",
    "matched",
    "driver_en_route",
    "arrived_at_pickup",
    "scheduled_requested",
    "scheduled_queued",
    "matching_at_dispatch_window",
  ].includes(status);
}
