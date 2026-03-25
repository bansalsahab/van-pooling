import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/Layout";
import { CopilotPanel } from "../components/CopilotPanel";
import { LiveMap } from "../components/LiveMap";
import { AIInsightsPanel, LiveStatusBadge, MetricPanel } from "../components/common";
import { useCopilot } from "../hooks/useCopilot";
import { useLiveStream } from "../hooks/useLiveStream";
import { api } from "../lib/api";
import type {
  AdminDashboardSummary,
  AdminLiveSnapshot,
  AIInsight,
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
  section?: "overview" | "fleet" | "trips";
}) {
  const { token, user } = useAuth();
  const { snapshot, connectionState, lastMessageAt, streamError } =
    useLiveStream<AdminLiveSnapshot>(token);
  const { brief, reply, loading, asking, error: copilotError, refreshBrief, askCopilot } =
    useCopilot(token);
  const [fallbackDashboard, setFallbackDashboard] =
    useState<AdminDashboardSummary | null>(null);
  const [fallbackVans, setFallbackVans] = useState<VanSummary[]>([]);
  const [fallbackEmployees, setFallbackEmployees] = useState<UserProfile[]>([]);
  const [fallbackDrivers, setFallbackDrivers] = useState<UserProfile[]>([]);
  const [fallbackTrips, setFallbackTrips] = useState<TripSummary[]>([]);
  const [fallbackInsights, setFallbackInsights] = useState<AIInsight[]>([]);
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
  const insights = snapshot?.insights ?? fallbackInsights;
  const fleetMarkers = useMemo(() => buildFleetMarkers(vans), [vans]);
  const tripPolylines = useMemo(() => buildTripPolylines(trips), [trips]);

  async function refresh() {
    if (!token) return;
    const [dashboardData, vanData, employeeData, driverData, tripData, aiInsights] =
      await Promise.all([
        api.getAdminDashboard(token),
        api.getAdminVans(token),
        api.getAdminEmployees(token),
        api.getAdminDrivers(token),
        api.getAdminTrips(token),
        api.getAIInsights(token),
      ]);
    setFallbackDashboard(dashboardData);
    setFallbackVans(vanData);
    setFallbackEmployees(employeeData);
    setFallbackDrivers(driverData);
    setFallbackTrips(tripData);
    setFallbackInsights(aiInsights);
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

  return (
    <AppLayout
      title="Operations Command"
      subtitle={`A live control surface for ${user?.company_name || "your company"}.`}
    >
      <div className="content-grid four-column">
        <MetricPanel
          label="Employees"
          value={String(dashboard?.employees_count || 0)}
          detail="registered riders"
        />
        <MetricPanel
          label="Drivers"
          value={String(dashboard?.drivers_count || 0)}
          detail="active staff"
        />
        <MetricPanel
          label="Available Vans"
          value={String(dashboard?.available_vans || 0)}
          detail={`${dashboard?.total_vans || 0} total vans`}
        />
        <section className="metric-panel">
          <span>Realtime Feed</span>
          <LiveStatusBadge state={connectionState} lastUpdatedAt={lastMessageAt} />
          <p>{streamError || "Fleet, trip, and demand signals are streaming live."}</p>
        </section>
      </div>

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
                  <p className="eyebrow">Fleet Snapshot</p>
                  <h3>Van readiness</h3>
                </div>
              </div>
              <div className="stack compact">
                {vans.slice(0, 4).map((van) => (
                  <div className="list-card" key={van.id}>
                    <div>
                      <strong>{van.license_plate}</strong>
                      <p>{van.driver_name || "No driver assigned"}</p>
                      <p>
                        {van.last_location_update
                          ? `Last ping ${formatTimestamp(van.last_location_update)}`
                          : "No live ping"}
                      </p>
                    </div>
                    <span className="status-pill">{van.status}</span>
                  </div>
                ))}
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
            {message && <div className="success-banner">{message}</div>}
            {error && <div className="error-banner">{error}</div>}
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
                    <th>Passengers</th>
                    <th>ETA</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip) => (
                    <tr key={trip.id}>
                      <td>{trip.id.slice(0, 8)}</td>
                      <td>{trip.van_license_plate || trip.van_id}</td>
                      <td>{trip.status}</td>
                      <td>{trip.passenger_count}</td>
                      <td>
                        {trip.route?.duration_minutes
                          ? `${trip.route.duration_minutes} min`
                          : trip.estimated_duration_minutes
                            ? `${trip.estimated_duration_minutes} min`
                            : "TBD"}
                      </td>
                      <td>{trip.started_at ? formatTimestamp(trip.started_at) : "Not started"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
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
      color: trip.status === "active" ? "#58b6ff" : "#ff8a4c",
    }));
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
