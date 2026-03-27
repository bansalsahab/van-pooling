import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AppLayout } from "../components/Layout";
import { CopilotPanel } from "../components/CopilotPanel";
import { LiveMap } from "../components/LiveMap";
import { NotificationCenterPanel } from "../components/NotificationPanel";
import {
  AIInsightsPanel,
  LiveEventsPanel,
  LiveStatusBadge,
  MetricPanel,
} from "../components/common";
import { useCopilot } from "../hooks/useCopilot";
import { useLiveStream } from "../hooks/useLiveStream";
import { api } from "../lib/api";
import type {
  AlertSummary,
  AdminDashboardSummary,
  AdminLiveSnapshot,
  AdminPendingRideSummary,
  AIInsight,
  DispatchEventSummary,
  MapMarkerSpec,
  MapPolylineSpec,
  TripSummary,
  UserProfile,
  VanSummary,
} from "../lib/types";
import { useAuth } from "../state/auth";

export function AdminDashboard({
  section = "overview",
}: {
  section?: "overview" | "fleet" | "trips" | "requests";
}) {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { snapshot, connectionState, lastMessageAt, streamError, recentEvents } =
    useLiveStream<AdminLiveSnapshot>(token);
  const { brief, reply, loading, asking, error: copilotError, refreshBrief, askCopilot } =
    useCopilot(token);
  const [fallbackDashboard, setFallbackDashboard] =
    useState<AdminDashboardSummary | null>(null);
  const [fallbackVans, setFallbackVans] = useState<VanSummary[]>([]);
  const [fallbackEmployees, setFallbackEmployees] = useState<UserProfile[]>([]);
  const [fallbackDrivers, setFallbackDrivers] = useState<UserProfile[]>([]);
  const [fallbackTrips, setFallbackTrips] = useState<TripSummary[]>([]);
  const [fallbackPendingRequests, setFallbackPendingRequests] = useState<
    AdminPendingRideSummary[]
  >([]);
  const [fallbackAlerts, setFallbackAlerts] = useState<AlertSummary[]>([]);
  const [fallbackInsights, setFallbackInsights] = useState<AIInsight[]>([]);
  const [selectedVanByTrip, setSelectedVanByTrip] = useState<Record<string, string>>({});
  const [selectedTripHistoryId, setSelectedTripHistoryId] = useState<string | null>(null);
  const [selectedTripEvents, setSelectedTripEvents] = useState<DispatchEventSummary[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "employee",
  });
  const [vanForm, setVanForm] = useState({
    license_plate: "",
    capacity: "8",
    driver_id: "",
    status: "offline",
  });

  useEffect(() => {
    if (!token) return;
    void refresh();
  }, [token]);

  const dashboard = snapshot?.data.dashboard ?? fallbackDashboard;
  const vans = snapshot?.data.vans ?? fallbackVans;
  const employees = snapshot?.data.employees ?? fallbackEmployees;
  const drivers = snapshot?.data.drivers ?? fallbackDrivers;
  const trips = snapshot?.data.trips ?? fallbackTrips;
  const pendingRequests = snapshot?.data.pending_requests ?? fallbackPendingRequests;
  const alerts = snapshot?.data.alerts ?? fallbackAlerts;
  const unreadNotifications = snapshot?.data.notifications_unread_count ?? 0;
  const insights = snapshot?.insights ?? fallbackInsights;
  const fleetMarkers = useMemo(() => buildFleetMarkers(vans), [vans]);
  const tripPolylines = useMemo(() => buildTripPolylines(trips), [trips]);
  const availableVans = useMemo(
    () => vans.filter((van) => van.status === "available"),
    [vans],
  );
  const pendingRequestMarkers = useMemo(
    () => buildPendingRequestMarkers(pendingRequests, availableVans),
    [availableVans, pendingRequests],
  );

  async function refresh() {
    if (!token) return;
    const [
      dashboardData,
      vanData,
      employeeData,
      driverData,
      tripData,
      pendingRequestData,
      alertData,
      aiInsights,
    ] =
      await Promise.all([
        api.getAdminDashboard(token),
        api.getAdminVans(token),
        api.getAdminEmployees(token),
        api.getAdminDrivers(token),
        api.getAdminTrips(token),
        api.getAdminPendingRequests(token),
        api.getAdminAlerts(token),
        api.getAIInsights(token),
      ]);
    setFallbackDashboard(dashboardData);
    setFallbackVans(vanData);
    setFallbackEmployees(employeeData);
    setFallbackDrivers(driverData);
    setFallbackTrips(tripData);
    setFallbackPendingRequests(pendingRequestData);
    setFallbackAlerts(alertData);
    setFallbackInsights(aiInsights);
    if (selectedTripHistoryId) {
      const history = await api.getAdminTripEvents(token, selectedTripHistoryId);
      setSelectedTripEvents(history);
    }
  }

  async function loadTripHistory(tripId: string) {
    if (!token) return;
    setSelectedTripHistoryId(tripId);
    setEventsLoading(true);
    setError(null);
    try {
      const history = await api.getAdminTripEvents(token, tripId);
      setSelectedTripEvents(history);
    } catch (historyError) {
      setError(
        historyError instanceof Error
          ? historyError.message
          : "Could not load trip history.",
      );
    } finally {
      setEventsLoading(false);
    }
  }

  async function handleCreateUser(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setMessage(null);
    setError(null);
    try {
      await api.createAdminUser(token, {
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        phone: userForm.phone || undefined,
        role: userForm.role as "employee" | "driver" | "admin",
      });
      setMessage(`Created ${userForm.role} ${userForm.name}.`);
      setUserForm({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "employee",
      });
      await Promise.all([refresh(), refreshBrief()]);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not create user.",
      );
    }
  }

  async function handleCreateVan(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setMessage(null);
    setError(null);
    try {
      await api.createAdminVan(token, {
        license_plate: vanForm.license_plate,
        capacity: Number(vanForm.capacity),
        driver_id: vanForm.driver_id || null,
        status: vanForm.status,
      });
      setMessage(`Created van ${vanForm.license_plate.toUpperCase()}.`);
      setVanForm({
        license_plate: "",
        capacity: "8",
        driver_id: "",
        status: "offline",
      });
      await Promise.all([refresh(), refreshBrief()]);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not create van.",
      );
    }
  }

  async function handleResolveAlert(alertId: string) {
    if (!token) return;
    setMessage(null);
    setError(null);
    try {
      await api.resolveAdminAlert(token, alertId);
      setMessage("Alert resolved.");
      await Promise.all([refresh(), refreshBrief()]);
    } catch (resolveError) {
      setError(
        resolveError instanceof Error ? resolveError.message : "Could not resolve alert.",
      );
    }
  }

  async function handleReassignTrip(tripId: string) {
    if (!token) return;
    const selectedVanId = selectedVanByTrip[tripId];
    if (!selectedVanId) {
      setError("Choose an available van before reassigning the trip.");
      return;
    }
    setMessage(null);
    setError(null);
    try {
      await api.reassignAdminTrip(token, tripId, { van_id: selectedVanId });
      setMessage("Trip reassigned to the selected van.");
      await Promise.all([refresh(), refreshBrief()]);
    } catch (reassignError) {
      setError(
        reassignError instanceof Error ? reassignError.message : "Could not reassign trip.",
      );
    }
  }

  async function handleCancelTrip(tripId: string) {
    if (!token) return;
    setMessage(null);
    setError(null);
    try {
      await api.cancelAdminTrip(token, tripId);
      setMessage("Trip cancelled by dispatch.");
      await Promise.all([refresh(), refreshBrief()]);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : "Could not cancel trip.",
      );
    }
  }

  return (
    <AppLayout
      notificationUnreadCount={unreadNotifications}
      pendingRequestCount={pendingRequests.length}
      title="Operations Command"
      subtitle={`A live control surface for ${user?.company_name || "your company"}.`}
    >
      <div className="content-grid five-column">
        <MetricPanel
          label="Employees"
          value={String(dashboard?.employees_count || 0)}
          detail="registered riders"
          onClick={() => navigate("/admin/fleet")}
        />
        <MetricPanel
          label="Pending Requests"
          value={String(dashboard?.pending_requests || 0)}
          detail="waiting for dispatch"
          onClick={() => navigate("/admin/requests")}
        />
        <MetricPanel
          label="Available Vans"
          value={String(dashboard?.available_vans || 0)}
          detail={`${dashboard?.total_vans || 0} total vans`}
          onClick={() => navigate("/admin/fleet")}
        />
        <MetricPanel
          label="Open Alerts"
          value={String(dashboard?.open_alerts || 0)}
          detail="dispatch exceptions"
          onClick={() => navigate("/admin/notifications")}
        />
        <section className="metric-panel">
          <span>Realtime Feed</span>
          <LiveStatusBadge state={connectionState} lastUpdatedAt={lastMessageAt} />
          <p>{streamError || "Fleet, trip, and demand signals are streaming live."}</p>
        </section>
      </div>

      {(message || error) && (
        <div className="stack compact">
          {message && <div className="success-banner">{message}</div>}
          {error && <div className="error-banner">{error}</div>}
        </div>
      )}

      {section === "overview" && (
        <>
          <div className="content-grid two-column">
            <LiveMap
              title="Operations map"
              subtitle="Watch fleet positions and trip overlays on real map tiles."
              markers={fleetMarkers}
              polylines={tripPolylines}
              emptyMessage="Start live driver sharing to populate the operations map."
              height={420}
            />
            <CopilotPanel
              title="Dispatch command brief"
              brief={brief}
              reply={reply}
              loading={loading}
              asking={asking}
              error={copilotError}
              onRefresh={() => void refreshBrief()}
              onAsk={askCopilot}
            />
          </div>

          <div className="content-grid two-column">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Operational Alerts</p>
                  <h3>Dispatch exceptions</h3>
                </div>
              </div>
              <div className="stack compact">
                {alerts.length === 0 ? (
                  <p className="muted-copy">No open operational alerts right now.</p>
                ) : (
                  alerts.slice(0, 6).map((alert) => (
                    <div className="list-card" key={alert.id}>
                      <div>
                        <strong>{alert.title || "Operational alert"}</strong>
                        <p>{alert.message}</p>
                        <p>
                          {alert.created_at
                            ? `Raised ${formatTimestamp(alert.created_at)}`
                            : "Raised recently"}
                        </p>
                      </div>
                      <div className="stack compact align-end">
                        <span className={`priority-pill ${alert.severity}`}>
                          {alert.severity}
                        </span>
                        <button
                          className="ghost-button"
                          onClick={() => void handleResolveAlert(alert.id)}
                          type="button"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <AIInsightsPanel insights={insights} title="Live dispatch cues" />
          </div>
        </>
      )}

      {section === "fleet" && (
        <div className="content-grid two-column">
          <section className="panel">
            <LiveMap
              title="Fleet tracking"
              subtitle="Monitor every van with live coordinates and operational states."
              markers={fleetMarkers}
              emptyMessage="No live coordinates yet."
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Van</th>
                    <th>Status</th>
                    <th>Occupancy</th>
                    <th>Driver</th>
                    <th>Coordinates</th>
                    <th>Last ping</th>
                  </tr>
                </thead>
                <tbody>
                  {vans.map((van) => (
                    <tr key={van.id}>
                      <td>{van.license_plate}</td>
                      <td>{van.status}</td>
                      <td>
                        {van.current_occupancy}/{van.capacity}
                      </td>
                      <td>{van.driver_name || "Unassigned"}</td>
                      <td>
                        {typeof van.latitude === "number" && typeof van.longitude === "number"
                          ? `${van.latitude.toFixed(4)}, ${van.longitude.toFixed(4)}`
                          : "No live fix"}
                      </td>
                      <td>
                        {van.last_location_update
                          ? formatTimestamp(van.last_location_update)
                          : "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">People and Fleet Ops</p>
                <h3>Provisioning</h3>
              </div>
            </div>
            <div className="content-grid two-column">
              <form className="panel inset-panel stack" onSubmit={handleCreateUser}>
                <div>
                  <p className="eyebrow">Add User</p>
                  <h3>Create employee or driver</h3>
                </div>
                <label>
                  Name
                  <input
                    value={userForm.name}
                    onChange={(event) =>
                      setUserForm((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(event) =>
                      setUserForm((current) => ({ ...current, email: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="text"
                    value={userForm.password}
                    onChange={(event) =>
                      setUserForm((current) => ({ ...current, password: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={userForm.phone}
                    onChange={(event) =>
                      setUserForm((current) => ({ ...current, phone: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Role
                  <select
                    value={userForm.role}
                    onChange={(event) =>
                      setUserForm((current) => ({ ...current, role: event.target.value }))
                    }
                  >
                    <option value="employee">Employee</option>
                    <option value="driver">Driver</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <button className="primary-button" type="submit">
                  Create user
                </button>
              </form>

              <form className="panel inset-panel stack" onSubmit={handleCreateVan}>
                <div>
                  <p className="eyebrow">Add Van</p>
                  <h3>Create fleet vehicle</h3>
                </div>
                <label>
                  License plate
                  <input
                    value={vanForm.license_plate}
                    onChange={(event) =>
                      setVanForm((current) => ({
                        ...current,
                        license_plate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  Capacity
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={vanForm.capacity}
                    onChange={(event) =>
                      setVanForm((current) => ({ ...current, capacity: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Assign driver
                  <select
                    value={vanForm.driver_id}
                    onChange={(event) =>
                      setVanForm((current) => ({ ...current, driver_id: event.target.value }))
                    }
                  >
                    <option value="">No driver</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={vanForm.status}
                    onChange={(event) =>
                      setVanForm((current) => ({ ...current, status: event.target.value }))
                    }
                  >
                    <option value="offline">offline</option>
                    <option value="available">available</option>
                    <option value="maintenance">maintenance</option>
                  </select>
                </label>
                <button className="primary-button" type="submit">
                  Create van
                </button>
              </form>
            </div>
            <div className="content-grid two-column">
              <div className="stack compact">
                {employees.map((employee) => (
                  <div className="list-card" key={employee.id}>
                    <div>
                      <strong>{employee.name}</strong>
                      <p>{employee.email}</p>
                    </div>
                    <span className="status-pill">{employee.status}</span>
                  </div>
                ))}
              </div>
              <div className="stack compact">
                {drivers.map((driver) => (
                  <div className="list-card" key={driver.id}>
                    <div>
                      <strong>{driver.name}</strong>
                      <p>{driver.email}</p>
                    </div>
                    <span className="status-pill">driver</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {section === "trips" && (
        <div className="content-grid two-column">
          <LiveMap
            title="Trip overlays"
            subtitle="See current routed trips alongside their assigned vans."
            markers={fleetMarkers}
            polylines={tripPolylines}
            emptyMessage="Trips will appear once riders are matched to vans."
          />
          <AIInsightsPanel insights={insights} title="Trip optimization cues" />
          <section className="panel span-two">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Trips</p>
                <h3>Assigned and pooled routes</h3>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Trip</th>
                    <th>Van</th>
                    <th>Status</th>
                    <th>Driver Ack</th>
                    <th>Passengers</th>
                    <th>ETA</th>
                    <th>Started</th>
                    <th>Dispatch Ops</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip) => (
                    <tr key={trip.id}>
                      <td>{trip.id.slice(0, 8)}</td>
                      <td>{trip.van_license_plate || trip.van_id}</td>
                      <td>{trip.status.replaceAll("_", " ")}</td>
                      <td>{formatTripAcknowledgement(trip.accepted_at, trip.started_at)}</td>
                      <td>{trip.passenger_count}</td>
                      <td>
                        {trip.route?.duration_minutes
                          ? `${trip.route.duration_minutes} min`
                          : trip.estimated_duration_minutes
                            ? `${trip.estimated_duration_minutes} min`
                            : "TBD"}
                      </td>
                      <td>{trip.started_at ? formatTimestamp(trip.started_at) : "Not started"}</td>
                      <td>
                        <div className="table-actions">
                          <select
                            value={selectedVanByTrip[trip.id] || ""}
                            onChange={(event) =>
                              setSelectedVanByTrip((current) => ({
                                ...current,
                                [trip.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Choose van</option>
                            {availableVans
                              .filter((van) => van.id !== trip.van_id)
                              .map((van) => (
                                <option key={van.id} value={van.id}>
                                  {van.license_plate}
                                </option>
                              ))}
                          </select>
                          <button
                            className="ghost-button"
                            onClick={() => void handleReassignTrip(trip.id)}
                            type="button"
                          >
                            Reassign
                          </button>
                          <button
                            className="ghost-button"
                            onClick={() => void handleCancelTrip(trip.id)}
                            type="button"
                          >
                            Cancel
                          </button>
                          <button
                            className="ghost-button"
                            onClick={() => void loadTripHistory(trip.id)}
                            type="button"
                          >
                            History
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel span-two">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Trip Audit Trail</p>
                <h3>
                  {selectedTripHistoryId
                    ? `Trip ${selectedTripHistoryId.slice(0, 8)} history`
                    : "Select a trip to inspect dispatch history"}
                </h3>
              </div>
            </div>
            {eventsLoading ? (
              <p className="muted-copy">Loading persisted dispatch events...</p>
            ) : selectedTripHistoryId && selectedTripEvents.length > 0 ? (
              <div className="stack compact">
                {selectedTripEvents.map((event) => (
                  <div className="list-card compact-card event-card" key={event.id}>
                    <div>
                      <strong>{event.event_type.replaceAll(".", " ")}</strong>
                      <p>
                        {event.actor_name || event.actor_type} moved
                        {" "}
                        {event.from_state ? event.from_state.replaceAll("_", " ") : "n/a"}
                        {" -> "}
                        {event.to_state ? event.to_state.replaceAll("_", " ") : "n/a"}
                      </p>
                      {event.reason && <p>{event.reason}</p>}
                    </div>
                    <div className="stack compact align-end">
                      <span className="status-pill">{event.actor_type}</span>
                      <span className="muted-copy">
                        {event.created_at ? formatTimestamp(event.created_at) : "recent"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-copy">
                Use the history action on any trip row to inspect its persisted dispatch events.
              </p>
            )}
          </section>
        </div>
      )}

      {section === "requests" && (
        <>
          <div className="content-grid two-column">
            <LiveMap
              title="Pending demand map"
              subtitle="See unmatched pickup demand alongside vans that are currently available."
              markers={pendingRequestMarkers}
              emptyMessage="No pending requests are waiting for dispatch."
            />
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Dispatch Queue</p>
                  <h3>Pending ride requests</h3>
                </div>
              </div>
              <div className="stack compact">
                <div className="list-card compact-card">
                  <div>
                    <strong>{pendingRequests.length} request(s) waiting</strong>
                    <p>Requests shown here have not been matched to a trip yet.</p>
                  </div>
                </div>
                <div className="list-card compact-card">
                  <div>
                    <strong>{availableVans.length} van(s) available now</strong>
                    <p>Use Fleet and Trips to inspect driver readiness before demand ages out.</p>
                  </div>
                </div>
                <div className="list-card compact-card">
                  <div>
                    <strong>
                      {pendingRequests.length > 0
                        ? `Oldest open request: ${formatAge(pendingRequests[0].age_minutes)}`
                        : "Queue is clear"}
                    </strong>
                    <p>
                      Scheduled requests remain here until the dispatch window opens, then move
                      into active matching.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Requests</p>
                <h3>Unmatched and scheduled demand</h3>
              </div>
            </div>
            {pendingRequests.length === 0 ? (
              <p className="muted-copy">
                No pending requests right now. New rider demand will appear here before it becomes a live trip.
              </p>
            ) : (
              <div className="stack compact">
                {pendingRequests.map((request) => (
                  <div className="list-card" key={request.id}>
                    <div>
                      <strong>{request.rider_name || "Employee request"}</strong>
                      <p>{request.rider_email || "No email on file"}</p>
                      <p>
                        {request.pickup_address}
                        {" -> "}
                        {request.destination_address}
                      </p>
                      <p>{request.dispatch_note || "Waiting for dispatch."}</p>
                    </div>
                    <div className="stack compact align-end">
                      <span className="status-pill">
                        {request.status.replaceAll("_", " ")}
                      </span>
                      <span className="status-pill">{request.request_kind}</span>
                      <span className="muted-copy">{formatAge(request.age_minutes)}</span>
                      <span className="muted-copy">
                        {request.scheduled_time
                          ? `Scheduled ${formatDateTime(request.scheduled_time)}`
                          : request.estimated_wait_minutes
                            ? `ETA ${request.estimated_wait_minutes} min`
                            : "ETA pending"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {(section === "trips" || section === "requests") && (
        <LiveEventsPanel
          events={recentEvents}
          title={section === "requests" ? "Pending request feed" : "Dispatch event feed"}
        />
      )}
    </AppLayout>
  );
}

export function AdminNotificationsPage() {
  const { token, user } = useAuth();
  const { snapshot } = useLiveStream<AdminLiveSnapshot>(token);
  const [unreadCount, setUnreadCount] = useState(0);
  const pendingRequestCount = snapshot?.data.pending_requests?.length ?? 0;

  useEffect(() => {
    setUnreadCount(snapshot?.data.notifications_unread_count ?? 0);
  }, [snapshot?.data.notifications_unread_count]);

  return (
    <AppLayout
      notificationUnreadCount={unreadCount}
      pendingRequestCount={pendingRequestCount}
      title="Notifications"
      subtitle={`Track alerts, dispatch changes, and rider-facing notices for ${user?.company_name || "your company"}.`}
    >
      <NotificationCenterPanel
        title="Operations notifications"
        eyebrow="Notifications"
        includeAlerts
        initialNotifications={snapshot?.data.notifications ?? []}
        initialUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
        emptyMessage="Operational alerts, reassignments, and rider notifications will appear here."
        onUnreadCountChange={setUnreadCount}
      />
    </AppLayout>
  );
}

function buildFleetMarkers(vans: VanSummary[]): MapMarkerSpec[] {
  return vans
    .filter(
      (van) => typeof van.latitude === "number" && typeof van.longitude === "number",
    )
    .map((van) => ({
      id: van.id,
      latitude: van.latitude as number,
      longitude: van.longitude as number,
      title: van.license_plate,
      subtitle: van.driver_name || van.status,
      tone: van.status === "maintenance" ? "warning" : "van",
    }));
}

function buildTripPolylines(trips: TripSummary[]): MapPolylineSpec[] {
  return trips
    .filter((trip) => Boolean(trip.route?.encoded_polyline))
    .slice(0, 6)
    .map((trip) => ({
      id: trip.id,
      encodedPath: trip.route.encoded_polyline,
      color: trip.status.startsWith("active_") ? "#58b6ff" : "#ff8a4c",
    }));
}

function buildPendingRequestMarkers(
  pendingRequests: AdminPendingRideSummary[],
  availableVans: VanSummary[],
): MapMarkerSpec[] {
  const requestMarkers = pendingRequests
    .filter(
      (request) =>
        typeof request.pickup_latitude === "number" &&
        typeof request.pickup_longitude === "number",
    )
    .map((request) => ({
      id: `request-${request.id}`,
      latitude: request.pickup_latitude as number,
      longitude: request.pickup_longitude as number,
      title: request.rider_name || "Pending request",
      subtitle: request.pickup_address,
      tone: "pickup" as const,
    }));

  const vanMarkers = availableVans
    .filter((van) => typeof van.latitude === "number" && typeof van.longitude === "number")
    .map((van) => ({
      id: `available-${van.id}`,
      latitude: van.latitude as number,
      longitude: van.longitude as number,
      title: van.license_plate,
      subtitle: "Available van",
      tone: "van" as const,
    }));

  return [...requestMarkers, ...vanMarkers];
}

function formatTripAcknowledgement(
  acceptedAt?: string | null,
  startedAt?: string | null,
) {
  if (startedAt) {
    return `Accepted ${formatTimestamp(acceptedAt || startedAt)}`;
  }
  if (acceptedAt) {
    return formatTimestamp(acceptedAt);
  }
  return "Awaiting driver";
}

function formatAge(ageMinutes: number) {
  if (ageMinutes < 1) {
    return "Just requested";
  }
  if (ageMinutes === 1) {
    return "1 minute old";
  }
  return `${ageMinutes} minutes old`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
