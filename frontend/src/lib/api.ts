import type {
  AdminDashboardSummary,
  AdminUserCreateInput,
  AdminVanCreateInput,
  AIInsight,
  AuthResponse,
  CopilotBrief,
  CopilotReply,
  DriverDashboardSummary,
  DriverTripSummary,
  GeocodeResult,
  RideSummary,
  RoutePlan,
  RouteWaypoint,
  TripSummary,
  UserProfile,
  VanSummary,
} from "./types";

const API_BASE_URL =
  import.meta.env.VITE_API_URL?.trim() || "http://localhost:8000/api/v1";

type HttpMethod = "GET" | "POST";

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
  login(email: string, password: string) {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
  },
  register(payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    company_domain: string;
    company_name?: string;
  }) {
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: payload,
    });
  },
  me(token: string) {
    return request<UserProfile>("/auth/me", { token });
  },
  getRideHistory(token: string) {
    return request<RideSummary[]>("/rides/history", { token });
  },
  getActiveRide(token: string) {
    return request<RideSummary | null>("/rides/active", { token });
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
  pickupPassenger(token: string, tripId: string, rideRequestId: string) {
    return request<{ message: string }>(
      `/driver/trips/${tripId}/pickup/${rideRequestId}`,
      {
        method: "POST",
        token,
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
  getAdminDashboard(token: string) {
    return request<AdminDashboardSummary>("/admin/dashboard", { token });
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
  getAdminTrips(token: string) {
    return request<TripSummary[]>("/admin/trips", { token });
  },
  createAdminUser(token: string, payload: AdminUserCreateInput) {
    return request<UserProfile>("/admin/users", {
      method: "POST",
      token,
      body: payload,
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
