import type {
  AlertSummary,
  AdminPasswordResetResponse,
  AdminDashboardSummary,
  AdminKPISummary,
  AdminPendingRideSummary,
  AdminUserCreateInput,
  AdminUserUpdateInput,
  AdminVanCreateInput,
  AIInsight,
  AuditExportResponse,
  DomainProfilingSnapshot,
  DispatchEventSummary,
  EnterpriseIdentityConfig,
  EnterpriseIdentityConfigUpdate,
  EnterpriseSSOStartRequest,
  EnterpriseSSOStartResponse,
  AuthResponse,
  CopilotBrief,
  CopilotReply,
  CommutePolicyConfig,
  DriverShiftStartInput,
  DriverShiftSummary,
  DriverVehicleCheckCreateInput,
  DriverVehicleCheckSummary,
  DriverDashboardSummary,
  DriverTripSummary,
  GeocodeResult,
  IncidentTimelineItem,
  NotificationFeed,
  NotificationSummary,
  PolicySimulationRequest,
  PolicySimulationResponse,
  RecurringRideRuleCreateInput,
  RecurringRideRuleSummary,
  RecurringRideRuleUpdateInput,
  RideSummary,
  RoutePlan,
  RouteWaypoint,
  SLASnapshotSummary,
  ServiceZoneCreateInput,
  ServiceZoneSummary,
  ServiceZoneUpdateInput,
  TripSummary,
  KPIWindow,
  UserProfileUpdateInput,
  UserProfile,
  VanSummary,
} from "./types";

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) {
    return configured;
  }

  // Use current hostname so LAN access works (e.g. 192.168.x.x:5173 -> 192.168.x.x:8000).
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "localhost";
  return `${protocol}//${hostname}:8000/api/v1`;
}

const API_BASE_URL = resolveApiBaseUrl();

type HttpMethod = "GET" | "POST" | "PUT";

async function request<T>(
  path: string,
  options: {
    method?: HttpMethod;
    token?: string | null;
    body?: unknown;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (networkError) {
    throw new Error(
      networkError instanceof Error
        ? `Could not reach the backend. ${networkError.message}`
        : "Could not reach the backend.",
    );
  }

  if (!response.ok) {
    const detail = await readError(response);
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown; message?: unknown };
    return (
      describeErrorValue(data.detail) ||
      describeErrorValue(data.message) ||
      `Request failed with status ${response.status}`
    );
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

function describeErrorValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (Array.isArray(value)) {
    const messages = value
      .map((item) => describeErrorValue(item))
      .filter((item): item is string => Boolean(item));
    return messages.length > 0 ? messages.join(" ") : null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = ["detail", "message", "msg", "error", "title"];
    for (const key of preferredKeys) {
      const nested = describeErrorValue(record[key]);
      if (nested) {
        const location = Array.isArray(record.loc)
          ? record.loc
              .map((part) => String(part))
              .filter((part) => part !== "body" && part !== "query")
              .join(".")
          : "";
        return location ? `${location}: ${nested}` : nested;
      }
    }

    const fallback = Object.entries(record)
      .map(([key, nestedValue]) => {
        const nested = describeErrorValue(nestedValue);
        return nested ? `${key}: ${nested}` : null;
      })
      .filter((item): item is string => Boolean(item));
    return fallback.length > 0 ? fallback.join(" | ") : null;
  }

  return null;
}

export const api = {
  getLiveStreamUrl(token: string) {
    return `${API_BASE_URL}/live/stream?access_token=${encodeURIComponent(token)}`;
  },
  getLiveWebSocketUrl(token: string) {
    const url = new URL(`${API_BASE_URL}/live/ws`, window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("access_token", token);
    return url.toString();
  },
  login(email: string, password: string, requestedRole?: "employee" | "driver" | "admin") {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email, password, requested_role: requestedRole },
    });
  },
  startEnterpriseSso(payload: EnterpriseSSOStartRequest) {
    return request<EnterpriseSSOStartResponse>("/auth/enterprise/sso/start", {
      method: "POST",
      body: payload,
    });
  },
  register(payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    company_domain: string;
    company_name?: string;
    requested_role?: "employee" | "driver" | "admin";
  }) {
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: payload,
    });
  },
  me(token: string) {
    return request<UserProfile>("/auth/me", { token });
  },
  updateProfile(token: string, payload: UserProfileUpdateInput) {
    return request<UserProfile>("/auth/me", {
      method: "PUT",
      token,
      body: payload,
    });
  },
  changePassword(token: string, currentPassword: string, newPassword: string) {
    return request<{ message: string }>("/auth/me/password", {
      method: "POST",
      token,
      body: {
        current_password: currentPassword,
        new_password: newPassword,
      },
    });
  },
  getRideHistory(token: string) {
    return request<RideSummary[]>("/rides/history", { token });
  },
  getActiveRide(token: string) {
    return request<RideSummary | null>("/rides/active", { token });
  },
  cancelRide(token: string, rideId: string) {
    return request<RideSummary>(`/rides/${rideId}/cancel`, {
      method: "POST",
      token,
    });
  },
  requestRide(
    token: string,
    payload: {
      pickup: { latitude: number; longitude: number; address: string };
      destination: { latitude: number; longitude: number; address: string };
      scheduled_time?: string | null;
    },
  ) {
    return request<RideSummary>("/rides/request", {
      method: "POST",
      token,
      body: payload,
    });
  },
  getRecurringSchedules(token: string) {
    return request<RecurringRideRuleSummary[]>("/rides/schedules", { token });
  },
  createRecurringSchedule(token: string, payload: RecurringRideRuleCreateInput) {
    return request<RecurringRideRuleSummary>("/rides/schedules", {
      method: "POST",
      token,
      body: payload,
    });
  },
  updateRecurringSchedule(token: string, ruleId: string, payload: RecurringRideRuleUpdateInput) {
    return request<RecurringRideRuleSummary>(`/rides/schedules/${ruleId}`, {
      method: "PUT",
      token,
      body: payload,
    });
  },
  getDriverDashboard(token: string) {
    return request<DriverDashboardSummary>("/driver/dashboard", { token });
  },
  getDriverActiveTrip(token: string) {
    return request<DriverTripSummary | null>("/driver/trips/active", { token });
  },
  updateDriverStatus(token: string, status: string) {
    return request<{ message: string }>("/driver/status", {
      method: "POST",
      token,
      body: { status },
    });
  },
  getDriverShifts(token: string, options?: { limit?: number }) {
    const params = new URLSearchParams();
    if (typeof options?.limit === "number") {
      params.set("limit", String(options.limit));
    }
    const query = params.toString();
    return request<DriverShiftSummary[]>(`/driver/shifts${query ? `?${query}` : ""}`, { token });
  },
  startDriverShift(token: string, payload: DriverShiftStartInput = {}) {
    return request<DriverShiftSummary>("/driver/shifts/start", {
      method: "POST",
      token,
      body: payload,
    });
  },
  clockOutDriverShift(token: string, shiftId: string) {
    return request<DriverShiftSummary>(`/driver/shifts/${shiftId}/clock-out`, {
      method: "POST",
      token,
    });
  },
  getDriverVehicleChecks(token: string, options?: { limit?: number }) {
    const params = new URLSearchParams();
    if (typeof options?.limit === "number") {
      params.set("limit", String(options.limit));
    }
    const query = params.toString();
    return request<DriverVehicleCheckSummary[]>(
      `/driver/vehicle-checks${query ? `?${query}` : ""}`,
      { token },
    );
  },
  submitDriverVehicleCheck(token: string, payload: DriverVehicleCheckCreateInput) {
    return request<DriverVehicleCheckSummary>("/driver/vehicle-checks", {
      method: "POST",
      token,
      body: payload,
    });
  },
  updateDriverLocation(token: string, latitude: number, longitude: number) {
    return request<{ message: string }>("/driver/location", {
      method: "POST",
      token,
      body: { latitude, longitude },
    });
  },
  startTrip(token: string, tripId: string) {
    return request<{ message: string }>(`/driver/trips/${tripId}/start`, {
      method: "POST",
      token,
    });
  },
  acceptTrip(token: string, tripId: string) {
    return request<{ message: string }>(`/driver/trips/${tripId}/accept`, {
      method: "POST",
      token,
    });
  },
  pickupPassenger(
    token: string,
    tripId: string,
    rideRequestId: string,
    otpCode: string,
  ) {
    return request<{ message: string }>(
      `/driver/trips/${tripId}/pickup/${rideRequestId}`,
      {
        method: "POST",
        token,
        body: { otp_code: otpCode },
      },
    );
  },
  dropoffPassenger(token: string, tripId: string, rideRequestId: string) {
    return request<{ message: string }>(
      `/driver/trips/${tripId}/dropoff/${rideRequestId}`,
      {
        method: "POST",
        token,
      },
    );
  },
  completeTrip(token: string, tripId: string) {
    return request<{ message: string }>(`/driver/trips/${tripId}/complete`, {
      method: "POST",
      token,
    });
  },
  noShowPassenger(token: string, tripId: string, rideRequestId: string) {
    return request<{ message: string }>(
      `/driver/trips/${tripId}/no-show/${rideRequestId}`,
      {
        method: "POST",
        token,
      },
    );
  },
  getAdminDashboard(token: string) {
    return request<AdminDashboardSummary>("/admin/dashboard", { token });
  },
  getAdminSla(token: string) {
    return request<SLASnapshotSummary>("/admin/sla", { token });
  },
  getAdminIncidents(
    token: string,
    options?: { includeResolved?: boolean; limit?: number },
  ) {
    const params = new URLSearchParams();
    if (typeof options?.includeResolved === "boolean") {
      params.set("include_resolved", String(options.includeResolved));
    }
    if (typeof options?.limit === "number") {
      params.set("limit", String(options.limit));
    }
    const query = params.toString();
    return request<IncidentTimelineItem[]>(`/admin/incidents${query ? `?${query}` : ""}`, {
      token,
    });
  },
  getAdminPolicy(token: string) {
    return request<CommutePolicyConfig>("/admin/policy", { token });
  },
  updateAdminPolicy(token: string, payload: CommutePolicyConfig) {
    return request<CommutePolicyConfig>("/admin/policy", {
      method: "PUT",
      token,
      body: payload,
    });
  },
  simulateAdminPolicy(token: string, payload: PolicySimulationRequest) {
    return request<PolicySimulationResponse>("/admin/policy/simulate", {
      method: "POST",
      token,
      body: payload,
    });
  },
  getAdminKpis(token: string, window: KPIWindow = "today") {
    const params = new URLSearchParams({ window });
    return request<AdminKPISummary>(`/admin/kpis?${params.toString()}`, { token });
  },
  getAdminProfiling(token: string) {
    return request<DomainProfilingSnapshot>("/admin/profiling", { token });
  },
  getAdminZones(token: string) {
    return request<ServiceZoneSummary[]>("/admin/zones", { token });
  },
  createAdminZone(token: string, payload: ServiceZoneCreateInput) {
    return request<ServiceZoneSummary>("/admin/zones", {
      method: "POST",
      token,
      body: payload,
    });
  },
  updateAdminZone(token: string, zoneId: string, payload: ServiceZoneUpdateInput) {
    return request<ServiceZoneSummary>(`/admin/zones/${zoneId}`, {
      method: "PUT",
      token,
      body: payload,
    });
  },
  getAdminVans(token: string) {
    return request<VanSummary[]>("/admin/vans", { token });
  },
  getAdminEmployees(token: string) {
    return request<UserProfile[]>("/admin/employees", { token });
  },
  getAdminDrivers(token: string) {
    return request<UserProfile[]>("/admin/drivers", { token });
  },
  getAdminUsers(token: string) {
    return request<UserProfile[]>("/admin/users", { token });
  },
  getAdminTrips(token: string) {
    return request<TripSummary[]>("/admin/trips", { token });
  },
  getAdminPendingRequests(token: string) {
    return request<AdminPendingRideSummary[]>("/admin/requests", { token });
  },
  getAdminTripEvents(token: string, tripId: string) {
    return request<DispatchEventSummary[]>(`/admin/trips/${tripId}/events`, { token });
  },
  getAdminAlerts(token: string) {
    return request<AlertSummary[]>("/admin/alerts", { token });
  },
  getAdminIdentityConfig(token: string) {
    return request<EnterpriseIdentityConfig>("/admin/identity/config", { token });
  },
  updateAdminIdentityConfig(token: string, payload: EnterpriseIdentityConfigUpdate) {
    return request<EnterpriseIdentityConfig>("/admin/identity/config", {
      method: "PUT",
      token,
      body: payload,
    });
  },
  exportAdminAudit(token: string, options?: { includeAlerts?: boolean; limit?: number }) {
    const params = new URLSearchParams({ format: "json" });
    if (typeof options?.includeAlerts === "boolean") {
      params.set("include_alerts", String(options.includeAlerts));
    }
    if (typeof options?.limit === "number") {
      params.set("limit", String(options.limit));
    }
    return request<AuditExportResponse>(`/admin/audit/export?${params.toString()}`, {
      token,
    });
  },
  getNotifications(
    token: string,
    options?: { includeAlerts?: boolean; limit?: number },
  ) {
    const params = new URLSearchParams();
    if (typeof options?.includeAlerts === "boolean") {
      params.set("include_alerts", String(options.includeAlerts));
    }
    if (typeof options?.limit === "number") {
      params.set("limit", String(options.limit));
    }
    const query = params.toString();
    return request<NotificationFeed>(`/notifications${query ? `?${query}` : ""}`, { token });
  },
  readNotification(token: string, notificationId: string) {
    return request<NotificationSummary>(`/notifications/${notificationId}/read`, {
      method: "POST",
      token,
    });
  },
  readAllNotifications(
    token: string,
    options?: { includeAlerts?: boolean; limit?: number },
  ) {
    const params = new URLSearchParams();
    if (typeof options?.includeAlerts === "boolean") {
      params.set("include_alerts", String(options.includeAlerts));
    }
    if (typeof options?.limit === "number") {
      params.set("limit", String(options.limit));
    }
    const query = params.toString();
    return request<NotificationFeed>(`/notifications/read-all${query ? `?${query}` : ""}`, {
      method: "POST",
      token,
    });
  },
  resolveAdminAlert(token: string, alertId: string) {
    return request<AlertSummary>(`/admin/alerts/${alertId}/resolve`, {
      method: "POST",
      token,
    });
  },
  reassignAdminTrip(
    token: string,
    tripId: string,
    payload: { van_id: string; reason?: string },
  ) {
    return request<TripSummary>(`/admin/trips/${tripId}/reassign`, {
      method: "POST",
      token,
      body: payload,
    });
  },
  cancelAdminTrip(token: string, tripId: string, reason?: string) {
    return request<TripSummary>(`/admin/trips/${tripId}/cancel`, {
      method: "POST",
      token,
      body: { reason },
    });
  },
  createAdminUser(token: string, payload: AdminUserCreateInput) {
    return request<UserProfile>("/admin/users", {
      method: "POST",
      token,
      body: payload,
    });
  },
  updateAdminUser(token: string, userId: string, payload: AdminUserUpdateInput) {
    return request<UserProfile>(`/admin/users/${userId}`, {
      method: "PUT",
      token,
      body: payload,
    });
  },
  resetAdminUserPassword(token: string, userId: string) {
    return request<AdminPasswordResetResponse>(`/admin/users/${userId}/reset-password`, {
      method: "POST",
      token,
    });
  },
  createAdminVan(token: string, payload: AdminVanCreateInput) {
    return request<VanSummary>("/admin/vans", {
      method: "POST",
      token,
      body: payload,
    });
  },
  getAIInsights(token: string) {
    return request<AIInsight[]>("/ai/insights", { token });
  },
  getCopilotBrief(token: string) {
    return request<CopilotBrief>("/ai/copilot/brief", { token });
  },
  askCopilot(token: string, question: string) {
    return request<CopilotReply>("/ai/copilot/ask", {
      method: "POST",
      token,
      body: { question },
    });
  },
  geocodeAddress(token: string, address: string) {
    return request<GeocodeResult>("/maps/geocode", {
      method: "POST",
      token,
      body: { address },
    });
  },
  previewRoute(
    token: string,
    payload: {
      origin: RouteWaypoint;
      destination: RouteWaypoint;
      intermediates?: RouteWaypoint[];
      travel_mode?: string;
    },
  ) {
    return request<RoutePlan>("/maps/route-preview", {
      method: "POST",
      token,
      body: payload,
    });
  },
};
