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
  AdminKPISummary,
  AdminLiveSnapshot,
  AdminPendingRideSummary,
  AIInsight,
  CommutePolicyConfig,
  DispatchDecisionMetadata,
  DispatchEventSummary,
  DomainProfilingSnapshot,
  IncidentTimelineItem,
  KPIWindow,
  MapMarkerSpec,
  MapPolylineSpec,
  SLASnapshotSummary,
  TripSummary,
  UserProfile,
  VanSummary,
  PolicySimulationResponse,
} from "../lib/types";
import { useAuth } from "../state/auth";

const DEFAULT_ADMIN_PERMISSIONS = [
  "dashboard:read",
  "fleet:read",
  "dispatch:write",
  "alerts:manage",
  "policy:manage",
  "users:manage",
  "vans:manage",
  "audit:export",
  "incident:read",
  "sso:manage",
];

export function AdminDashboard({
  section = "overview",
}: {
  section?: "overview" | "fleet" | "trips" | "requests" | "policy";
}) {
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
  } = useLiveStream<AdminLiveSnapshot>(token);
  const { brief, reply, loading, asking, error: copilotError, refreshBrief, askCopilot } =
    useCopilot(token);
  const [fallbackDashboard, setFallbackDashboard] =
    useState<AdminDashboardSummary | null>(null);
  const [fallbackKpis, setFallbackKpis] = useState<AdminKPISummary | null>(null);
  const [fallbackSla, setFallbackSla] = useState<SLASnapshotSummary | null>(null);
  const [fallbackProfiling, setFallbackProfiling] =
    useState<DomainProfilingSnapshot | null>(null);
  const [fallbackIncidents, setFallbackIncidents] = useState<IncidentTimelineItem[]>([]);
  const [kpiWindow, setKpiWindow] = useState<KPIWindow>("today");
  const [kpiLoading, setKpiLoading] = useState(false);
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
    admin_scope: "supervisor",
  });
  const [vanForm, setVanForm] = useState({
    license_plate: "",
    capacity: "8",
    driver_id: "",
    status: "offline",
  });
  const [fallbackPolicy, setFallbackPolicy] = useState<CommutePolicyConfig | null>(null);
  const [policyDraft, setPolicyDraft] = useState("");
  const [policySaving, setPolicySaving] = useState(false);
  const [policySimulation, setPolicySimulation] = useState({
    pickup_latitude: "12.9716",
    pickup_longitude: "77.5946",
    destination_latitude: "12.9800",
    destination_longitude: "77.6000",
    scheduled_time: "",
    role: "employee",
    team: "",
    is_women_rider: false,
  });
  const [policySimulationResult, setPolicySimulationResult] =
    useState<PolicySimulationResponse | null>(null);
  const [auditExporting, setAuditExporting] = useState(false);

  useEffect(() => {
    if (!token) return;
    void refresh();
  }, [token, kpiWindow]);

  const dashboard = snapshot?.data.dashboard ?? fallbackDashboard;
  const kpis = fallbackKpis;
  const profiling = fallbackProfiling;
  const sla = fallbackSla;
  const incidents = fallbackIncidents;
  const policy = fallbackPolicy;
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
  const adminPermissionSet = useMemo(() => {
    if (user?.role !== "admin") {
      return new Set<string>();
    }
    const permissions = user.admin_permissions;
    if (!permissions || permissions.length === 0) {
      return new Set(DEFAULT_ADMIN_PERMISSIONS);
    }
    return new Set(permissions);
  }, [user?.admin_permissions, user?.role]);
  const canManageUsers = adminPermissionSet.has("users:manage");
  const canManageVans = adminPermissionSet.has("vans:manage");
  const canDispatchTrips = adminPermissionSet.has("dispatch:write");
  const canManageAlerts = adminPermissionSet.has("alerts:manage");
  const canManagePolicy = adminPermissionSet.has("policy:manage");
  const canExportAudit = adminPermissionSet.has("audit:export");

  async function refresh() {
    if (!token) return;
    setKpiLoading(true);
    try {
      const [
        dashboardData,
        kpiData,
        profilingData,
        slaData,
        incidentData,
        vanData,
        employeeData,
        driverData,
        tripData,
        pendingRequestData,
        alertData,
        policyData,
        aiInsights,
      ] =
        await Promise.all([
          api.getAdminDashboard(token),
          api.getAdminKpis(token, kpiWindow),
          api.getAdminProfiling(token),
          api.getAdminSla(token),
          api.getAdminIncidents(token, { includeResolved: true, limit: 18 }),
          api.getAdminVans(token),
          api.getAdminEmployees(token),
          api.getAdminDrivers(token),
          api.getAdminTrips(token),
          api.getAdminPendingRequests(token),
          api.getAdminAlerts(token),
          api.getAdminPolicy(token),
          api.getAIInsights(token),
        ]);
      setFallbackDashboard(dashboardData);
      setFallbackKpis(kpiData);
      setFallbackProfiling(profilingData);
      setFallbackSla(slaData);
      setFallbackIncidents(incidentData);
      setFallbackVans(vanData);
      setFallbackEmployees(employeeData);
      setFallbackDrivers(driverData);
      setFallbackTrips(tripData);
      setFallbackPendingRequests(pendingRequestData);
      setFallbackAlerts(alertData);
      setFallbackPolicy(policyData);
      setPolicyDraft(JSON.stringify(policyData, null, 2));
      setFallbackInsights(aiInsights);
      if (selectedTripHistoryId) {
        const history = await api.getAdminTripEvents(token, selectedTripHistoryId);
        setSelectedTripEvents(history);
      }
    } finally {
      setKpiLoading(false);
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
    if (!canManageUsers) {
      setError("Your admin scope cannot create users.");
      return;
    }
    setMessage(null);
    setError(null);
    try {
      await api.createAdminUser(token, {
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        phone: userForm.phone || undefined,
        role: userForm.role as "employee" | "driver" | "admin",
        admin_scope:
          userForm.role === "admin"
            ? (userForm.admin_scope as "supervisor" | "dispatcher" | "viewer" | "support")
            : undefined,
      });
      setMessage(`Created ${userForm.role} ${userForm.name}.`);
      setUserForm({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "employee",
        admin_scope: "supervisor",
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
    if (!canManageVans) {
      setError("Your admin scope cannot create vans.");
      return;
    }
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
    if (!canManageAlerts) {
      setError("Your admin scope cannot resolve alerts.");
      return;
    }
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
    if (!canDispatchTrips) {
      setError("Your admin scope cannot reassign trips.");
      return;
    }
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
    if (!canDispatchTrips) {
      setError("Your admin scope cannot cancel trips.");
      return;
    }
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

  async function handleSavePolicy(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (!canManagePolicy) {
      setError("Your admin scope cannot update policy configuration.");
      return;
    }
    setMessage(null);
    setError(null);
    setPolicySaving(true);
    try {
      const parsed = JSON.parse(policyDraft) as CommutePolicyConfig;
      const updated = await api.updateAdminPolicy(token, parsed);
      setFallbackPolicy(updated);
      setPolicyDraft(JSON.stringify(updated, null, 2));
      setMessage("Policy configuration updated.");
      await refreshBrief();
    } catch (policyError) {
      setError(
        policyError instanceof Error
          ? policyError.message
          : "Could not save policy configuration.",
      );
    } finally {
      setPolicySaving(false);
    }
  }

  async function handleSimulatePolicy(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (!canManagePolicy) {
      setError("Your admin scope cannot run policy simulation.");
      return;
    }
    setMessage(null);
    setError(null);
    try {
      const result = await api.simulateAdminPolicy(token, {
        pickup_latitude: Number(policySimulation.pickup_latitude),
        pickup_longitude: Number(policySimulation.pickup_longitude),
        destination_latitude: Number(policySimulation.destination_latitude),
        destination_longitude: Number(policySimulation.destination_longitude),
        scheduled_time: policySimulation.scheduled_time
          ? new Date(policySimulation.scheduled_time).toISOString()
          : null,
        role: policySimulation.role,
        team: policySimulation.team || null,
        is_women_rider: policySimulation.is_women_rider,
      });
      setPolicySimulationResult(result);
      setMessage(
        result.allowed
          ? "Policy simulation passed. Request would be accepted."
          : "Policy simulation failed. Review violations below.",
      );
    } catch (simulationError) {
      setError(
        simulationError instanceof Error
          ? simulationError.message
          : "Could not run policy simulation.",
      );
    }
  }

  async function handleExportAudit() {
    if (!token) return;
    if (!canExportAudit) {
      setError("Your admin scope cannot export audit logs.");
      return;
    }
    setAuditExporting(true);
    setMessage(null);
    setError(null);
    try {
      const exportPayload = await api.exportAdminAudit(token, {
        includeAlerts: true,
        limit: 1000,
      });
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "audit-export.json";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setMessage(`Exported ${exportPayload.record_count} audit records.`);
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : "Could not export audit logs.",
      );
    } finally {
      setAuditExporting(false);
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
          <LiveStatusBadge
            state={connectionState}
            quality={connectionQuality}
            lagSeconds={streamLagSeconds}
            lastUpdatedAt={lastMessageAt}
          />
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
        <section className="panel kpi-panel">
          <div className="kpi-toolbar">
            <div>
              <p className="eyebrow">Baseline Metrics</p>
              <h3>Stage 0 KPI snapshot</h3>
            </div>
            <label className="kpi-window-picker">
              <span className="eyebrow">Window</span>
              <select
                value={kpiWindow}
                onChange={(event) => setKpiWindow(event.target.value as KPIWindow)}
              >
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
          </div>
          <div className="content-grid five-column kpi-grid">
            <MetricPanel
              label="P95 wait"
              value={formatKpiMetric(kpis?.metrics.p95_wait_time_minutes, " min")}
              detail="request to pickup"
            />
            <MetricPanel
              label="On-time pickup"
              value={formatKpiMetric(kpis?.metrics.on_time_pickup_percent, "%")}
              detail="scheduled rides"
            />
            <MetricPanel
              label="Seat utilization"
              value={formatKpiMetric(kpis?.metrics.seat_utilization_percent, "%")}
              detail="completed trips"
            />
            <MetricPanel
              label="Deadhead km/trip"
              value={formatKpiMetric(kpis?.metrics.deadhead_km_per_trip, " km")}
              detail="pre-pickup reposition"
            />
            <MetricPanel
              label="Dispatch success"
              value={formatKpiMetric(kpis?.metrics.dispatch_success_percent, "%")}
              detail="decided requests"
            />
          </div>
          <p className="muted-copy">
            {kpiLoading
              ? "Refreshing KPI snapshot..."
              : `Window evaluated from ${kpis ? formatDateTime(kpis.window_start) : "N/A"} to ${kpis ? formatDateTime(kpis.window_end) : "N/A"}.`}
          </p>
        </section>
      )}

      {section === "overview" && profiling && (
        <section className="panel kpi-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Domain Profiling</p>
              <h3>Employee, driver, and admin API health</h3>
            </div>
            <span className="muted-copy">
              Updated {formatTimestamp(profiling.generated_at)}
            </span>
          </div>
          <div className="content-grid three-column">
            {profiling.profiles.map((profile) => (
              <div className="list-card compact-card" key={profile.domain}>
                <div>
                  <strong>{profile.domain}</strong>
                  <p>
                    p95 latency {formatLatency(profile.p95_latency_ms)} · avg{" "}
                    {formatLatency(profile.average_latency_ms)}
                  </p>
                  <p>
                    requests {profile.request_count} · errors {profile.error_count} (
                    {profile.error_rate_percent.toFixed(1)}%)
                  </p>
                  <p>
                    slow requests {profile.slow_request_count} (
                    {profile.slow_request_rate_percent.toFixed(1)}% over{" "}
                    {profiling.slow_request_threshold_ms} ms)
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
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
                  <p className="eyebrow">SLA Monitor</p>
                  <h3>Reliability health</h3>
                </div>
                <span className={`priority-pill ${sla?.health === "critical" ? "high" : sla?.health === "warning" ? "medium" : "low"}`}>
                  {sla?.health || "healthy"}
                </span>
              </div>
              <div className="stack compact">
                <div className="list-card compact-card">
                  <div>
                    <strong>{sla?.open_breach_count ?? 0} open breach signal(s)</strong>
                    <p>
                      Dispatch delay, rider wait, and location freshness are evaluated continuously.
                    </p>
                  </div>
                </div>
                {(sla?.breaches || []).length === 0 ? (
                  <p className="muted-copy">No SLA breaches currently open.</p>
                ) : (
                  (sla?.breaches || []).map((breach) => (
                    <div className="list-card compact-card" key={breach.breach_type}>
                      <div>
                        <strong>{breach.title}</strong>
                        <p>{breach.note}</p>
                        <p>
                          {breach.count} item(s) over threshold ({breach.threshold_label})
                        </p>
                      </div>
                      <span className={`priority-pill ${breach.severity}`}>
                        {breach.severity}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Incident Timeline</p>
                  <h3>Recent operational incidents</h3>
                </div>
              </div>
              <div className="stack compact">
                {incidents.length === 0 ? (
                  <p className="muted-copy">No incidents are recorded for this time range yet.</p>
                ) : (
                  incidents.slice(0, 6).map((incident) => (
                    <div className="list-card compact-card event-card" key={incident.id}>
                      <div>
                        <strong>{incident.title || "Incident"}</strong>
                        <p>{incident.message}</p>
                        <p>
                          {incident.breach_type
                            ? `Type: ${incident.breach_type.replaceAll("_", " ")}`
                            : `Kind: ${incident.kind.replaceAll("_", " ")}`}
                        </p>
                      </div>
                      <div className="stack compact align-end">
                        <span className={`priority-pill ${incident.severity}`}>
                          {incident.severity}
                        </span>
                        <span className="status-pill">{incident.status}</span>
                        <span className="muted-copy">
                          {incident.created_at
                            ? formatTimestamp(incident.created_at)
                            : "recent"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
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
                          disabled={!canManageAlerts}
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
            {(!canManageUsers || !canManageVans) && (
              <p className="muted-copy">
                Current admin scope is read-only for some provisioning actions.
              </p>
            )}
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
                    disabled={!canManageUsers}
                    onChange={(event) =>
                      setUserForm((current) => ({ ...current, role: event.target.value }))
                    }
                  >
                    <option value="employee">Employee</option>
                    <option value="driver">Driver</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                {userForm.role === "admin" && (
                  <label>
                    Admin scope
                    <select
                      value={userForm.admin_scope}
                      disabled={!canManageUsers}
                      onChange={(event) =>
                        setUserForm((current) => ({
                          ...current,
                          admin_scope: event.target.value,
                        }))
                      }
                    >
                      <option value="supervisor">supervisor</option>
                      <option value="dispatcher">dispatcher</option>
                      <option value="viewer">viewer</option>
                      <option value="support">support</option>
                    </select>
                  </label>
                )}
                <button className="primary-button" disabled={!canManageUsers} type="submit">
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
                    disabled={!canManageVans}
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
                    disabled={!canManageVans}
                    onChange={(event) =>
                      setVanForm((current) => ({ ...current, status: event.target.value }))
                    }
                  >
                    <option value="offline">offline</option>
                    <option value="available">available</option>
                    <option value="maintenance">maintenance</option>
                  </select>
                </label>
                <button className="primary-button" disabled={!canManageVans} type="submit">
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
              <button
                className="ghost-button"
                disabled={!canExportAudit || auditExporting}
                onClick={() => void handleExportAudit()}
                type="button"
              >
                {auditExporting ? "Exporting..." : "Export audit"}
              </button>
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
                            disabled={!canDispatchTrips}
                            onClick={() => void handleReassignTrip(trip.id)}
                            type="button"
                          >
                            Reassign
                          </button>
                          <button
                            className="ghost-button"
                            disabled={!canDispatchTrips}
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
                      {getDispatchDecision(event.metadata) && (
                        <div className="stack compact">
                          <p>{getDispatchDecision(event.metadata)?.note}</p>
                          {getSelectedCandidateLabel(getDispatchDecision(event.metadata)) && (
                            <p>
                              Selected:{" "}
                              {getSelectedCandidateLabel(getDispatchDecision(event.metadata))}
                            </p>
                          )}
                          {getDispatchReasonLabels(getDispatchDecision(event.metadata)).length >
                            0 && (
                            <div className="signal-row">
                              {getDispatchReasonLabels(getDispatchDecision(event.metadata)).map(
                                (label) => (
                                  <span className="signal-pill" key={`${event.id}-${label}`}>
                                    {label}
                                  </span>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      )}
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
                      <p>{describeDispatchCounts(request.dispatch_metadata)}</p>
                      {describeDispatchPolicy(request.dispatch_metadata) && (
                        <p>{describeDispatchPolicy(request.dispatch_metadata)}</p>
                      )}
                      {getDispatchReasonLabels(request.dispatch_metadata).length > 0 && (
                        <div className="signal-row">
                          {getDispatchReasonLabels(request.dispatch_metadata).map((label) => (
                            <span className="signal-pill" key={`${request.id}-${label}`}>
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                      {getDispatchAdvisories(request.dispatch_metadata).length > 0 && (
                        <div className="stack compact">
                          {getDispatchAdvisories(request.dispatch_metadata).map((advisory) => (
                            <p className="muted-copy" key={`${request.id}-${advisory}`}>
                              {advisory}
                            </p>
                          ))}
                        </div>
                      )}
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

      {section === "policy" && (
        <div className="content-grid two-column">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Policy Snapshot</p>
                <h3>Current commute governance</h3>
              </div>
            </div>
            {policy ? (
              <div className="stack compact">
                <div className="list-card compact-card">
                  <div>
                    <strong>Role dispatch priority</strong>
                    <p>
                      Admin {policy.priority_by_user_role.admin ?? "n/a"} / Employee{" "}
                      {policy.priority_by_user_role.employee ?? "n/a"} / Driver{" "}
                      {policy.priority_by_user_role.driver ?? "n/a"}
                    </p>
                  </div>
                </div>
                <div className="list-card compact-card">
                  <div>
                    <strong>Scheduling controls</strong>
                    <p>
                      Min lead {policy.schedule.min_lead_minutes} min, max horizon{" "}
                      {policy.schedule.max_days_ahead} days.
                    </p>
                    <p>
                      Dispatch cutoff {policy.schedule.dispatch_cutoff_minutes_before_pickup} min
                      before pickup.
                    </p>
                  </div>
                </div>
                <div className="list-card compact-card">
                  <div>
                    <strong>Cancellation controls</strong>
                    <p>
                      Employee cancellation cutoff{" "}
                      {policy.cancellation.employee_cutoff_minutes_before_pickup} min before
                      scheduled pickup.
                    </p>
                  </div>
                </div>
                <div className="list-card compact-card">
                  <div>
                    <strong>Service zone + safety window</strong>
                    <p>
                      Service zone {policy.service_zone.enabled ? "enabled" : "disabled"}.
                    </p>
                    <p>
                      Women safety window {policy.women_safety_window.enabled ? "enabled" : "disabled"} (
                      {policy.women_safety_window.start_local_time}-
                      {policy.women_safety_window.end_local_time}, {policy.women_safety_window.timezone}).
                    </p>
                  </div>
                </div>
                <span className="muted-copy">
                  Last updated{" "}
                  {policy.updated_at ? formatDateTime(policy.updated_at) : "from defaults"}.
                </span>
              </div>
            ) : (
              <p className="muted-copy">Loading policy snapshot...</p>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Policy Studio</p>
                <h3>Edit and simulate policy</h3>
              </div>
            </div>
            <form className="stack" onSubmit={handleSavePolicy}>
              <label>
                Policy JSON
                <textarea
                  className="copilot-textarea"
                  disabled={!canManagePolicy}
                  value={policyDraft}
                  onChange={(event) => setPolicyDraft(event.target.value)}
                  placeholder="Policy JSON will appear here after load."
                />
              </label>
              <button
                className="primary-button"
                disabled={policySaving || !canManagePolicy}
                type="submit"
              >
                {policySaving ? "Saving policy..." : "Save policy config"}
              </button>
            </form>

            <form className="panel inset-panel stack" onSubmit={handleSimulatePolicy}>
              <div>
                <p className="eyebrow">Policy Simulation</p>
                <h3>Why accepted or rejected</h3>
              </div>
              <div className="inline-grid">
                <label>
                  Pickup lat
                  <input
                    disabled={!canManagePolicy}
                    value={policySimulation.pickup_latitude}
                    onChange={(event) =>
                      setPolicySimulation((current) => ({
                        ...current,
                        pickup_latitude: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  Pickup lng
                  <input
                    disabled={!canManagePolicy}
                    value={policySimulation.pickup_longitude}
                    onChange={(event) =>
                      setPolicySimulation((current) => ({
                        ...current,
                        pickup_longitude: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <div className="inline-grid">
                <label>
                  Destination lat
                  <input
                    disabled={!canManagePolicy}
                    value={policySimulation.destination_latitude}
                    onChange={(event) =>
                      setPolicySimulation((current) => ({
                        ...current,
                        destination_latitude: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  Destination lng
                  <input
                    disabled={!canManagePolicy}
                    value={policySimulation.destination_longitude}
                    onChange={(event) =>
                      setPolicySimulation((current) => ({
                        ...current,
                        destination_longitude: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <div className="inline-grid">
                <label>
                  Role
                  <select
                    disabled={!canManagePolicy}
                    value={policySimulation.role}
                    onChange={(event) =>
                      setPolicySimulation((current) => ({
                        ...current,
                        role: event.target.value,
                      }))
                    }
                  >
                    <option value="employee">employee</option>
                    <option value="admin">admin</option>
                    <option value="driver">driver</option>
                  </select>
                </label>
                <label>
                  Team (optional)
                  <input
                    disabled={!canManagePolicy}
                    value={policySimulation.team}
                    onChange={(event) =>
                      setPolicySimulation((current) => ({
                        ...current,
                        team: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                Scheduled time (optional)
                <input
                  type="datetime-local"
                  disabled={!canManagePolicy}
                  value={policySimulation.scheduled_time}
                  onChange={(event) =>
                    setPolicySimulation((current) => ({
                      ...current,
                      scheduled_time: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  disabled={!canManagePolicy}
                  checked={policySimulation.is_women_rider}
                  onChange={(event) =>
                    setPolicySimulation((current) => ({
                      ...current,
                      is_women_rider: event.target.checked,
                    }))
                  }
                />
                Rider is women-safety eligible
              </label>
              <button className="secondary-button" disabled={!canManagePolicy} type="submit">
                Run simulation
              </button>
              {policySimulationResult && (
                <div className="stack compact">
                  <div className="list-card compact-card">
                    <div>
                      <strong>
                        {policySimulationResult.allowed ? "Allowed" : "Rejected"}
                      </strong>
                      <p>
                        Dispatch priority score: {policySimulationResult.dispatch_priority}
                      </p>
                    </div>
                  </div>
                  {policySimulationResult.violations.length === 0 ? (
                    <p className="muted-copy">No policy conflicts detected.</p>
                  ) : (
                    policySimulationResult.violations.map((violation) => (
                      <div className="list-card compact-card" key={violation.code}>
                        <div>
                          <strong>{violation.code.replaceAll("_", " ")}</strong>
                          <p>{violation.message}</p>
                          {violation.field && <p>Field: {violation.field}</p>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </form>
          </section>
        </div>
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
        enableIncidentActions
        initialNotifications={snapshot?.data.notifications ?? []}
        initialUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
        emptyMessage="Operational alerts, reassignments, and rider notifications will appear here."
        onUnreadCountChange={setUnreadCount}
      />
    </AppLayout>
  );
}

function getDispatchDecision(
  metadata: Record<string, unknown> | DispatchDecisionMetadata | undefined,
): DispatchDecisionMetadata | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const direct = metadata as DispatchDecisionMetadata & {
    dispatch_decision?: DispatchDecisionMetadata;
  };
  if (direct.dispatch_decision && typeof direct.dispatch_decision === "object") {
    return direct.dispatch_decision;
  }
  if (
    "candidate_counts" in direct ||
    "top_rejection_reasons" in direct ||
    "selected_candidate" in direct ||
    "policy" in direct ||
    "note" in direct
  ) {
    return direct;
  }
  return null;
}

function getDispatchReasonLabels(metadata: DispatchDecisionMetadata | undefined | null) {
  return (metadata?.top_rejection_reasons || [])
    .map((item) => item.label)
    .filter((label): label is string => Boolean(label));
}

function getSelectedCandidateLabel(metadata: DispatchDecisionMetadata | undefined | null) {
  const candidate = metadata?.selected_candidate;
  if (!candidate?.label) {
    return null;
  }
  const score = candidate.score_breakdown?.total_score;
  if (typeof score === "number") {
    return `${candidate.label} (${score.toFixed(2)} score)`;
  }
  return candidate.label;
}

function describeDispatchCounts(metadata: DispatchDecisionMetadata | undefined | null) {
  const pool = metadata?.candidate_counts?.pool ?? metadata?.pool_candidates?.length ?? 0;
  const van = metadata?.candidate_counts?.van ?? metadata?.van_candidates?.length ?? 0;
  return `Matcher reviewed ${pool} pooled trip(s) and ${van} direct van candidate(s).`;
}

function describeDispatchPolicy(metadata: DispatchDecisionMetadata | undefined | null) {
  const policy = metadata?.policy;
  if (!policy) {
    return null;
  }
  const pickupRadius = policy.pickup_radius_meters;
  const maxDetour = policy.max_detour_minutes;
  const scheduleWindow = policy.schedule_compatibility_minutes;
  if (
    typeof pickupRadius !== "number" ||
    typeof maxDetour !== "number" ||
    typeof scheduleWindow !== "number"
  ) {
    return null;
  }
  return `Policy: pickup within ${pickupRadius} m, max detour ${maxDetour} min, schedule window ${scheduleWindow} min.`;
}

function getDispatchAdvisories(metadata: DispatchDecisionMetadata | undefined | null) {
  return (metadata?.advisories || []).filter(
    (advisory): advisory is string => typeof advisory === "string" && advisory.length > 0,
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

function formatKpiMetric(
  value: number | null | undefined,
  suffix: string,
  digits: number = 1,
) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return `${value.toFixed(digits)}${suffix}`;
}

function formatLatency(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return `${value.toFixed(1)} ms`;
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
