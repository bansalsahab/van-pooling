import type {
  AlertSummary,
  AdminDashboard,
  AdminKPISummary,
  AdminPendingRide,
  AdminTrip,
  AdminUser,
  AIInsight,
  AuthTokens,
  CommutePolicyConfig,
  CopilotBrief,
  CopilotReply,
  DriverDashboardSummary,
  DriverShiftSummary,
  DriverTripSummary,
  EmployeeDashboard,
  GeocodeResult,
  IncidentTimelineItem,
  NotificationFeed,
  NotificationItem,
  RecurringRideRule,
  RideSummary,
  RoutePreview,
  SLASnapshotSummary,
  User,
  VanLocation,
  VanSummary,
  VehicleCheck,
} from './types';
import { API_BASE_URL } from './config';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string;
  body?: unknown;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (isRecord(error)) {
    const detail = error.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const message = detail
        .map((item) => {
          if (typeof item === 'string') return item;
          if (isRecord(item) && typeof item.msg === 'string') return item.msg;
          return null;
        })
        .filter(Boolean)
        .join(', ');
      if (message) return message;
    }
    if (typeof error.message === 'string') return error.message;
  }
  return 'Unexpected error';
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    throw new Error(
      `Cannot connect to backend at ${API_BASE_URL}. ${message}. ` +
      'Set EXPO_PUBLIC_API_BASE_URL in mobile/vanpool-expo/.env if needed.',
    );
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
    throw new Error(extractErrorMessage(errorData));
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

function toLowerRole(value: unknown): 'employee' | 'driver' | 'admin' {
  const role = String(value ?? '').toLowerCase();
  if (role === 'driver' || role === 'admin') return role;
  return 'employee';
}

function normalizeUser(raw: unknown): User {
  const record = isRecord(raw) ? raw : {};
  const status = String(record.status ?? '').toLowerCase();
  return {
    id: String(record.id ?? ''),
    email: String(record.email ?? ''),
    full_name: String(record.full_name ?? record.name ?? ''),
    role: toLowerRole(record.role),
    phone: typeof record.phone === 'string' ? record.phone : undefined,
    department: typeof record.department === 'string' ? record.department : undefined,
    is_active: typeof record.is_active === 'boolean' ? record.is_active : status !== 'inactive',
    admin_scope: typeof record.admin_scope === 'string'
      ? (record.admin_scope as User['admin_scope'])
      : undefined,
    name: String(record.name ?? record.full_name ?? ''),
    company_name: typeof record.company_name === 'string' ? record.company_name : undefined,
    must_reset_password: Boolean(record.must_reset_password),
    notification_preferences: isRecord(record.notification_preferences)
      ? {
        push: Boolean(record.notification_preferences.push),
        sms: Boolean(record.notification_preferences.sms),
        email: Boolean(record.notification_preferences.email),
      }
      : undefined,
    home_address: typeof record.home_address === 'string' ? record.home_address : undefined,
    home_latitude: typeof record.home_latitude === 'number' ? record.home_latitude : undefined,
    home_longitude: typeof record.home_longitude === 'number' ? record.home_longitude : undefined,
    default_destination_address:
      typeof record.default_destination_address === 'string'
        ? record.default_destination_address
        : undefined,
    default_destination_latitude:
      typeof record.default_destination_latitude === 'number'
        ? record.default_destination_latitude
        : undefined,
    default_destination_longitude:
      typeof record.default_destination_longitude === 'number'
        ? record.default_destination_longitude
        : undefined,
  };
}

function normalizeRide(raw: unknown): RideSummary {
  const record = isRecord(raw) ? raw : {};
  const pickupLatitude = Number(record.pickup_latitude ?? record.pickup_lat ?? 0);
  const pickupLongitude = Number(record.pickup_longitude ?? record.pickup_lng ?? 0);
  const destinationLatitude = Number(record.destination_latitude ?? record.dropoff_lat ?? 0);
  const destinationLongitude = Number(record.destination_longitude ?? record.dropoff_lng ?? 0);
  const requestedPickupTime =
    String(record.scheduled_time ?? record.requested_pickup_time ?? record.requested_at ?? '');
  return {
    id: String(record.id ?? ''),
    status: String(record.status ?? 'unknown').toLowerCase(),
    pickup_address: String(record.pickup_address ?? ''),
    destination_address: String(record.destination_address ?? record.dropoff_address ?? ''),
    dropoff_address: String(record.destination_address ?? record.dropoff_address ?? ''),
    pickup_latitude: pickupLatitude,
    pickup_longitude: pickupLongitude,
    destination_latitude: destinationLatitude,
    destination_longitude: destinationLongitude,
    pickup_lat: pickupLatitude,
    pickup_lng: pickupLongitude,
    dropoff_lat: destinationLatitude,
    dropoff_lng: destinationLongitude,
    scheduled_time: typeof record.scheduled_time === 'string' ? record.scheduled_time : undefined,
    requested_pickup_time: requestedPickupTime || undefined,
    pickup_time: requestedPickupTime || undefined,
    requested_at: typeof record.requested_at === 'string' ? record.requested_at : undefined,
    created_at: String(record.created_at ?? record.requested_at ?? new Date().toISOString()),
    passengers: typeof record.passengers === 'number' ? record.passengers : 1,
    estimated_wait_minutes: typeof record.estimated_wait_minutes === 'number'
      ? record.estimated_wait_minutes
      : undefined,
    driver_name: typeof record.driver_name === 'string' ? record.driver_name : undefined,
    van_plate: typeof record.van_license_plate === 'string'
      ? record.van_license_plate
      : typeof record.van_plate === 'string'
        ? record.van_plate
        : undefined,
    trip_id: typeof record.trip_id === 'string' ? record.trip_id : undefined,
    boarding_otp_code: typeof record.boarding_otp_code === 'string'
      ? record.boarding_otp_code
      : undefined,
    route_polyline: typeof record.route_polyline === 'string' ? record.route_polyline : undefined,
    route_distance_meters: typeof record.route_distance_meters === 'number'
      ? record.route_distance_meters
      : undefined,
    route_duration_minutes: typeof record.route_duration_minutes === 'number'
      ? record.route_duration_minutes
      : undefined,
    van_latitude: typeof record.van_latitude === 'number' ? record.van_latitude : undefined,
    van_longitude: typeof record.van_longitude === 'number' ? record.van_longitude : undefined,
  };
}

function normalizeNotification(raw: unknown): NotificationItem {
  const record = isRecord(raw) ? raw : {};
  const status = String(record.status ?? '').toUpperCase();
  const isRead = status === 'READ' || Boolean(record.read_at);
  return {
    id: String(record.id ?? ''),
    title: String(record.title ?? 'Notification'),
    message: String(record.message ?? ''),
    type: String(record.type ?? 'info').toLowerCase(),
    read: isRead,
    created_at: String(record.created_at ?? new Date().toISOString()),
    data: isRecord(record.metadata) ? record.metadata : undefined,
    status,
    kind: typeof record.kind === 'string' ? record.kind : undefined,
    severity: typeof record.severity === 'string' ? record.severity : undefined,
    ride_id: typeof record.ride_id === 'string' ? record.ride_id : undefined,
    trip_id: typeof record.trip_id === 'string' ? record.trip_id : undefined,
  };
}

function normalizeRecurringRule(raw: unknown): RecurringRideRule {
  const record = isRecord(raw) ? raw : {};
  const pickup = isRecord(record.pickup) ? record.pickup : {};
  const destination = isRecord(record.destination) ? record.destination : {};
  const status = String(record.status ?? '').toLowerCase();
  return {
    id: String(record.id ?? ''),
    name: String(record.name ?? ''),
    status: status || 'active',
    is_active: status ? status === 'active' : Boolean(record.is_active),
    weekdays: Array.isArray(record.weekdays)
      ? record.weekdays.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [],
    pickup_time_local: String(record.pickup_time_local ?? record.pickup_time ?? '08:00'),
    pickup_time: String(record.pickup_time_local ?? record.pickup_time ?? '08:00'),
    timezone: String(record.timezone ?? 'Asia/Kolkata'),
    pickup: {
      address: String(pickup.address ?? record.pickup_address ?? ''),
      latitude: Number(pickup.latitude ?? record.pickup_lat ?? 0),
      longitude: Number(pickup.longitude ?? record.pickup_lng ?? 0),
    },
    destination: {
      address: String(destination.address ?? record.destination_address ?? ''),
      latitude: Number(destination.latitude ?? record.destination_lat ?? 0),
      longitude: Number(destination.longitude ?? record.destination_lng ?? 0),
    },
    pickup_address: String(pickup.address ?? record.pickup_address ?? ''),
    pickup_lat: Number(pickup.latitude ?? record.pickup_lat ?? 0),
    pickup_lng: Number(pickup.longitude ?? record.pickup_lng ?? 0),
    destination_address: String(destination.address ?? record.destination_address ?? ''),
    destination_lat: Number(destination.latitude ?? record.destination_lat ?? 0),
    destination_lng: Number(destination.longitude ?? record.destination_lng ?? 0),
    next_pickup: typeof record.next_pickup_at === 'string'
      ? record.next_pickup_at
      : typeof record.next_pickup === 'string'
        ? record.next_pickup
        : undefined,
  };
}

function normalizeVan(raw: unknown): VanSummary {
  const record = isRecord(raw) ? raw : {};
  const latitude = Number(record.latitude ?? record.lat ?? 0);
  const longitude = Number(record.longitude ?? record.lng ?? 0);
  return {
    id: String(record.id ?? ''),
    plate_number: String(record.license_plate ?? record.plate_number ?? ''),
    model: String(record.model ?? 'Van'),
    capacity: Number(record.capacity ?? 0),
    current_occupancy: Number(record.current_occupancy ?? 0),
    status: String(record.status ?? 'unknown').toLowerCase(),
    current_driver_id: typeof record.driver_id === 'string' ? record.driver_id : undefined,
    current_driver_name: typeof record.driver_name === 'string' ? record.driver_name : undefined,
    driver_name: typeof record.driver_name === 'string' ? record.driver_name : undefined,
    latitude,
    longitude,
    last_location: {
      lat: latitude,
      lng: longitude,
      updated_at: String(record.last_location_update ?? new Date().toISOString()),
    },
    last_location_update: typeof record.last_location_update === 'string'
      ? record.last_location_update
      : undefined,
  };
}

function normalizeAdminTrip(raw: unknown): AdminTrip {
  const record = isRecord(raw) ? raw : {};
  const route = isRecord(record.route) ? record.route : {};
  const origin = isRecord(route.origin) ? route.origin : {};
  const destination = isRecord(route.destination) ? route.destination : {};

  const normalizeAddress = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const routeName = [normalizeAddress(origin.address), normalizeAddress(destination.address)]
    .filter(Boolean)
    .join(' -> ');

  return {
    id: String(record.id ?? ''),
    status: String(record.status ?? 'unknown').toLowerCase(),
    van_id: typeof record.van_id === 'string' ? record.van_id : undefined,
    scheduled_start: typeof record.scheduled_start === 'string' ? record.scheduled_start : undefined,
    actual_start: typeof record.actual_start === 'string'
      ? record.actual_start
      : typeof record.started_at === 'string'
        ? record.started_at
        : undefined,
    actual_end: typeof record.actual_end === 'string' ? record.actual_end : undefined,
    van_plate: typeof record.van_license_plate === 'string'
      ? record.van_license_plate
      : typeof record.van_plate === 'string'
        ? record.van_plate
        : undefined,
    van_license_plate: typeof record.van_license_plate === 'string'
      ? record.van_license_plate
      : undefined,
    driver_name: typeof record.driver_name === 'string' ? record.driver_name : undefined,
    passenger_count: Number(record.passenger_count ?? 0),
    route_name: routeName || (typeof record.route_name === 'string' ? record.route_name : undefined),
    created_at: typeof record.created_at === 'string' ? record.created_at : undefined,
    accepted_at: typeof record.accepted_at === 'string' ? record.accepted_at : undefined,
    started_at: typeof record.started_at === 'string' ? record.started_at : undefined,
    route: {
      origin: {
        address: typeof origin.address === 'string' ? origin.address : undefined,
        latitude: typeof origin.latitude === 'number' ? origin.latitude : undefined,
        longitude: typeof origin.longitude === 'number' ? origin.longitude : undefined,
      },
      destination: {
        address: typeof destination.address === 'string' ? destination.address : undefined,
        latitude: typeof destination.latitude === 'number' ? destination.latitude : undefined,
        longitude: typeof destination.longitude === 'number' ? destination.longitude : undefined,
      },
      duration_minutes: typeof route.duration_minutes === 'number' ? route.duration_minutes : undefined,
      distance_meters: typeof route.distance_meters === 'number' ? route.distance_meters : undefined,
    },
  };
}

function normalizeAlert(raw: unknown): AlertSummary {
  const record = isRecord(raw) ? raw : {};
  return {
    id: String(record.id ?? ''),
    title: typeof record.title === 'string' ? record.title : undefined,
    message: String(record.message ?? ''),
    status: String(record.status ?? 'pending').toLowerCase(),
    severity: String(record.severity ?? 'medium').toLowerCase(),
    kind: String(record.kind ?? 'operational_alert'),
    entity_type: typeof record.entity_type === 'string' ? record.entity_type : undefined,
    entity_id: typeof record.entity_id === 'string' ? record.entity_id : undefined,
    ride_id: typeof record.ride_id === 'string' ? record.ride_id : undefined,
    trip_id: typeof record.trip_id === 'string' ? record.trip_id : undefined,
    created_at: typeof record.created_at === 'string' ? record.created_at : undefined,
    resolved_at: typeof record.resolved_at === 'string' ? record.resolved_at : undefined,
  };
}

function normalizeAdminUser(raw: unknown): AdminUser {
  const user = normalizeUser(raw);
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    phone: user.phone,
    is_active: user.is_active,
    admin_scope: user.admin_scope,
    created_at: typeof (raw as JsonRecord | undefined)?.created_at === 'string'
      ? String((raw as JsonRecord).created_at)
      : new Date().toISOString(),
    status: isRecord(raw) && typeof raw.status === 'string' ? raw.status : undefined,
  };
}

export const backend = {
  // Auth
  async login(email: string, password: string, requestedRole?: 'employee' | 'driver' | 'admin'): Promise<AuthTokens> {
    const response = await request<{
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      user?: unknown;
    }>('/auth/login', {
      method: 'POST',
      body: { email, password, requested_role: requestedRole },
    });
    return {
      access_token: response.access_token,
      refresh_token: response.refresh_token,
      token_type: response.token_type ?? 'bearer',
      user: response.user ? normalizeUser(response.user) : undefined,
    };
  },

  async register(payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    company_domain: string;
    company_name?: string;
    requested_role?: 'employee' | 'driver' | 'admin';
    requested_admin_scope?: 'supervisor' | 'dispatcher' | 'viewer' | 'support';
  }): Promise<AuthTokens> {
    const response = await request<{
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      user?: unknown;
    }>('/auth/register', {
      method: 'POST',
      body: payload,
    });
    return {
      access_token: response.access_token,
      refresh_token: response.refresh_token,
      token_type: response.token_type ?? 'bearer',
      user: response.user ? normalizeUser(response.user) : undefined,
    };
  },

  async getMe(token: string) {
    const user = await request<unknown>('/auth/me', { token });
    return normalizeUser(user);
  },

  async updateProfile(token: string, data: {
    full_name?: string;
    phone?: string;
    notification_preferences?: {
      push: boolean;
      sms: boolean;
      email: boolean;
    };
    home_address?: string;
    home_latitude?: number;
    home_longitude?: number;
    default_destination_address?: string;
    default_destination_latitude?: number;
    default_destination_longitude?: number;
  }) {
    const body: Record<string, unknown> = {};
    if (typeof data.full_name === 'string') {
      body.name = data.full_name;
    }
    if (typeof data.phone === 'string') {
      body.phone = data.phone;
    }
    if (data.notification_preferences) {
      body.notification_preferences = data.notification_preferences;
    }
    if (typeof data.home_address === 'string') {
      body.home_address = data.home_address;
    }
    if (typeof data.home_latitude === 'number' || typeof data.home_longitude === 'number') {
      body.home_latitude = data.home_latitude ?? null;
      body.home_longitude = data.home_longitude ?? null;
    }
    if (typeof data.default_destination_address === 'string') {
      body.default_destination_address = data.default_destination_address;
    }
    if (
      typeof data.default_destination_latitude === 'number'
      || typeof data.default_destination_longitude === 'number'
    ) {
      body.default_destination_latitude = data.default_destination_latitude ?? null;
      body.default_destination_longitude = data.default_destination_longitude ?? null;
    }

    const user = await request<unknown>('/auth/me', {
      method: 'PUT',
      token,
      body,
    });
    return normalizeUser(user);
  },

  async changePassword(token: string, payload: { current_password: string; new_password: string }) {
    return request<{ message: string }>('/auth/me/password', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  // Employee
  async getEmployeeDashboard(token: string): Promise<EmployeeDashboard> {
    const [user, activeRide, history] = await Promise.all([
      this.getMe(token),
      this.getActiveRide(token),
      this.getRideHistory(token, 20),
    ]);

    const openStatuses = new Set([
      'requested',
      'matching',
      'matched',
      'driver_en_route',
      'arrived_at_pickup',
      'picked_up',
      'in_transit',
      'arrived_at_destination',
      'dropped_off',
    ]);

    const pendingCount = history.filter((ride) => openStatuses.has(ride.status)).length;

    return {
      user,
      active_count: activeRide ? 1 : 0,
      pending_count: pendingCount,
      next_ride: activeRide
        ? {
          id: activeRide.id,
          pickup_address: activeRide.pickup_address,
          requested_pickup_time:
            activeRide.requested_pickup_time ?? activeRide.scheduled_time ?? activeRide.created_at,
          eta_minutes: activeRide.estimated_wait_minutes,
        }
        : undefined,
      recent_rides: history.slice(0, 5).map((ride) => ({
        id: ride.id,
        pickup_address: ride.pickup_address,
        status: ride.status,
        created_at: ride.created_at,
      })),
    };
  },

  async getRideHistory(token: string, limit = 20) {
    const rides = await request<unknown[]>('/rides/history', { token });
    return rides.slice(0, limit).map((ride) => normalizeRide(ride));
  },

  async getActiveRide(token: string) {
    const ride = await request<unknown | null>('/rides/active', { token });
    return ride ? normalizeRide(ride) : null;
  },

  async requestRide(token: string, payload: {
    pickup_address?: string;
    pickup_lat?: number;
    pickup_lng?: number;
    dropoff_address?: string;
    dropoff_lat?: number;
    dropoff_lng?: number;
    pickup_time?: string;
    pickup?: { address: string; latitude: number; longitude: number };
    destination?: { address: string; latitude: number; longitude: number };
    scheduled_time?: string | null;
  }) {
    const requestPayload = {
      pickup: payload.pickup ?? {
        address: String(payload.pickup_address ?? ''),
        latitude: Number(payload.pickup_lat ?? 0),
        longitude: Number(payload.pickup_lng ?? 0),
      },
      destination: payload.destination ?? {
        address: String(payload.dropoff_address ?? ''),
        latitude: Number(payload.dropoff_lat ?? 0),
        longitude: Number(payload.dropoff_lng ?? 0),
      },
      scheduled_time: payload.scheduled_time ?? payload.pickup_time ?? null,
    };
    const ride = await request<unknown>('/rides/request', {
      method: 'POST',
      token,
      body: requestPayload,
    });
    return normalizeRide(ride);
  },

  async cancelRide(token: string, rideId: string) {
    const ride = await request<unknown>(`/rides/${rideId}/cancel`, {
      method: 'POST',
      token,
    });
    return normalizeRide(ride);
  },

  async geocodeAddress(token: string, address: string) {
    const response = await request<{
      address: string;
      latitude: number;
      longitude: number;
      place_id?: string;
      source?: 'google_maps' | 'fallback';
    }>('/maps/geocode', {
      method: 'POST',
      token,
      body: { address },
    });
    return {
      address: response.address,
      formatted_address: response.address,
      latitude: response.latitude,
      longitude: response.longitude,
      lat: response.latitude,
      lng: response.longitude,
      place_id: response.place_id,
      source: response.source ?? 'fallback',
    } satisfies GeocodeResult;
  },

  async suggestAddresses(token: string, query: string, limit = 5) {
    const response = await request<{ suggestions: Array<{ description: string; place_id?: string }> }>(
      '/maps/suggest',
      {
        method: 'POST',
        token,
        body: { query, limit },
      },
    );
    return (response.suggestions ?? []).map((item) => ({
      description: item.description,
      place_id: item.place_id,
    }));
  },

  async getRoutePreview(token: string, payload: {
    origin: { latitude: number; longitude: number; address?: string };
    destination: { latitude: number; longitude: number; address?: string };
    intermediates?: Array<{ latitude: number; longitude: number; address?: string }>;
    travel_mode?: string;
  }) {
    return request<RoutePreview>('/maps/route-preview', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  // Driver
  getDriverDashboard(token: string) {
    return request<DriverDashboardSummary>('/driver/dashboard', { token });
  },

  getDriverActiveTrip(token: string) {
    return request<DriverTripSummary | null>('/driver/trips/active', { token });
  },

  updateDriverStatus(token: string, status: string) {
    return request<{ message: string }>('/driver/status', {
      method: 'POST',
      token,
      body: { status },
    });
  },

  updateDriverLocation(token: string, latitude: number, longitude: number) {
    return request<{ message: string }>('/driver/location', {
      method: 'POST',
      token,
      body: { latitude, longitude },
    });
  },

  async getDriverShifts(token: string, limit = 20) {
    const shifts = await request<unknown[]>(`/driver/shifts?limit=${limit}`, { token });
    return shifts.map((shift) => {
      const record = isRecord(shift) ? shift : {};
      return {
        id: String(record.id ?? ''),
        driver_id: String(record.driver_id ?? ''),
        started_at: String(
          record.clocked_in_at
          ?? record.scheduled_start_at
          ?? record.created_at
          ?? new Date().toISOString(),
        ),
        ended_at: typeof record.clocked_out_at === 'string' ? record.clocked_out_at : undefined,
        status: String(record.status ?? ''),
        total_trips: Number(record.total_trips ?? 0),
        total_passengers: Number(record.total_passengers ?? 0),
      } satisfies DriverShiftSummary;
    });
  },

  startDriverShift(token: string) {
    return request<DriverShiftSummary>('/driver/shifts/start', {
      method: 'POST',
      token,
      body: {},
    });
  },

  endDriverShift(token: string, shiftId: string) {
    return request<DriverShiftSummary>(`/driver/shifts/${shiftId}/clock-out`, {
      method: 'POST',
      token,
    });
  },

  startTrip(token: string, tripId: string) {
    return request<{ message: string }>(`/driver/trips/${tripId}/start`, {
      method: 'POST',
      token,
    });
  },

  acceptTrip(token: string, tripId: string) {
    return request<{ message: string }>(`/driver/trips/${tripId}/accept`, {
      method: 'POST',
      token,
    });
  },

  pickupPassenger(token: string, tripId: string, rideRequestId: string, otpCode?: string) {
    return request<{ message: string }>(`/driver/trips/${tripId}/pickup/${rideRequestId}`, {
      method: 'POST',
      token,
      body: otpCode ? { otp_code: otpCode } : {},
    });
  },

  dropoffPassenger(token: string, tripId: string, rideRequestId: string) {
    return request<{ message: string }>(`/driver/trips/${tripId}/dropoff/${rideRequestId}`, {
      method: 'POST',
      token,
    });
  },

  noShowPassenger(token: string, tripId: string, rideRequestId: string) {
    return request<{ message: string }>(`/driver/trips/${tripId}/no-show/${rideRequestId}`, {
      method: 'POST',
      token,
    });
  },

  completeTrip(token: string, tripId: string) {
    return request<{ message: string }>(`/driver/trips/${tripId}/complete`, {
      method: 'POST',
      token,
    });
  },

  getVehicleChecks(token: string, limit = 20) {
    return request<VehicleCheck[]>(`/driver/vehicle-checks?limit=${limit}`, { token });
  },

  submitVehicleCheck(token: string, payload: {
    check_type?: 'pre_trip' | 'post_trip';
    items?: Array<{ name: string; passed: boolean; notes?: string }>;
    notes?: string;
  }) {
    const checklist: Record<string, boolean> = {};
    for (const item of payload.items ?? []) {
      checklist[item.name] = item.passed;
    }
    const failedItems = Object.values(checklist).filter((value) => !value).length;
    return request<VehicleCheck>('/driver/vehicle-checks', {
      method: 'POST',
      token,
      body: {
        checklist,
        notes: payload.notes,
        status: failedItems > 0 ? 'failed' : 'passed',
      },
    });
  },

  // Admin
  async getAdminDashboard(token: string) {
    const dashboard = await request<JsonRecord>('/admin/dashboard', { token });
    return {
      total_employees: Number(dashboard.employees_count ?? dashboard.total_employees ?? 0),
      total_drivers: Number(dashboard.drivers_count ?? dashboard.total_drivers ?? 0),
      total_vans: Number(dashboard.total_vans ?? 0),
      active_vans: Number(dashboard.active_vans ?? dashboard.available_vans ?? 0),
      active_trips: Number(dashboard.active_trips ?? 0),
      pending_requests: Number(dashboard.pending_requests ?? 0),
      today_completed_trips: Number(dashboard.today_completed_trips ?? 0),
      today_passengers_served: Number(dashboard.today_passengers_served ?? 0),
      open_alerts: Number(dashboard.open_alerts ?? 0),
    } satisfies AdminDashboard;
  },

  async getAdminVans(token: string) {
    const vans = await request<unknown[]>('/admin/vans', { token });
    return vans.map((van) => normalizeVan(van));
  },

  getAdminPolicy(token: string) {
    return request<CommutePolicyConfig>('/admin/policy', { token });
  },

  updateAdminPolicy(token: string, payload: CommutePolicyConfig) {
    return request<CommutePolicyConfig>('/admin/policy', {
      method: 'PUT',
      token,
      body: payload,
    });
  },

  getAdminKpis(token: string, window: 'today' | '7d' | '30d' = 'today') {
    const params = new URLSearchParams({ window });
    return request<AdminKPISummary>(`/admin/kpis?${params.toString()}`, { token });
  },

  getAdminSla(token: string) {
    return request<SLASnapshotSummary>('/admin/sla', { token });
  },

  getAdminIncidents(
    token: string,
    options?: { includeResolved?: boolean; limit?: number },
  ) {
    const query = new URLSearchParams();
    if (typeof options?.includeResolved === 'boolean') {
      query.set('include_resolved', String(options.includeResolved));
    }
    if (typeof options?.limit === 'number') {
      query.set('limit', String(options.limit));
    }
    return request<IncidentTimelineItem[]>(
      `/admin/incidents${query.toString() ? `?${query.toString()}` : ''}`,
      { token },
    );
  },

  async getAdminTrips(token: string) {
    const trips = await request<unknown[]>('/admin/trips', { token });
    return trips.map((trip) => normalizeAdminTrip(trip));
  },

  async getAdminTripsWithDetails(token: string) {
    const trips = await request<unknown[]>('/admin/trips', { token });
    return trips.map((trip) => normalizeAdminTrip(trip));
  },

  async getAdminAlerts(token: string, options?: { includeResolved?: boolean }) {
    const query = new URLSearchParams();
    if (typeof options?.includeResolved === 'boolean') {
      query.set('include_resolved', String(options.includeResolved));
    }
    const alerts = await request<unknown[]>(
      `/admin/alerts${query.toString() ? `?${query.toString()}` : ''}`,
      { token },
    );
    return alerts.map((alert) => normalizeAlert(alert));
  },

  async resolveAdminAlert(token: string, alertId: string) {
    const alert = await request<unknown>(`/admin/alerts/${alertId}/resolve`, {
      method: 'POST',
      token,
    });
    return normalizeAlert(alert);
  },

  async reassignAdminTrip(
    token: string,
    tripId: string,
    payload: { van_id: string; reason?: string },
  ) {
    const trip = await request<unknown>(`/admin/trips/${tripId}/reassign`, {
      method: 'POST',
      token,
      body: payload,
    });
    return normalizeAdminTrip(trip);
  },

  async cancelAdminTrip(token: string, tripId: string, reason?: string) {
    const trip = await request<unknown>(`/admin/trips/${tripId}/cancel`, {
      method: 'POST',
      token,
      body: { reason },
    });
    return normalizeAdminTrip(trip);
  },

  async getAdminUsers(token: string) {
    const users = await request<unknown[]>('/admin/users', { token });
    return users.map((user) => normalizeAdminUser(user));
  },

  async getAdminEmployees(token: string) {
    const users = await request<unknown[]>('/admin/employees', { token });
    return users.map((user) => normalizeAdminUser(user));
  },

  async getAdminDrivers(token: string) {
    const users = await request<unknown[]>('/admin/drivers', { token });
    return users.map((user) => normalizeAdminUser(user));
  },

  createUser(token: string, payload: {
    email: string;
    password: string;
    full_name: string;
    role: 'employee' | 'driver' | 'admin';
    phone?: string;
    admin_scope?: 'supervisor' | 'dispatcher' | 'viewer' | 'support';
  }) {
    return request<unknown>('/admin/users', {
      method: 'POST',
      token,
      body: {
        name: payload.full_name,
        email: payload.email,
        password: payload.password,
        phone: payload.phone,
        role: payload.role,
        admin_scope: payload.admin_scope,
      },
    }).then((user) => normalizeAdminUser(user));
  },

  updateUser(token: string, userId: string, payload: {
    full_name?: string;
    phone?: string;
    is_active?: boolean;
    admin_scope?: string;
  }) {
    const body: Record<string, unknown> = {};
    if (payload.full_name) body.name = payload.full_name;
    if (payload.phone) body.phone = payload.phone;
    if (typeof payload.is_active === 'boolean') {
      body.status = payload.is_active ? 'active' : 'inactive';
    }
    if (payload.admin_scope) body.admin_scope = payload.admin_scope;
    return request<unknown>(`/admin/users/${userId}`, {
      method: 'PUT',
      token,
      body,
    }).then((user) => normalizeAdminUser(user));
  },

  async createAdminVan(
    token: string,
    payload: { license_plate: string; capacity: number; driver_id?: string; status?: string },
  ) {
    const van = await request<unknown>('/admin/vans', {
      method: 'POST',
      token,
      body: {
        license_plate: payload.license_plate,
        capacity: payload.capacity,
        driver_id: payload.driver_id,
        status: payload.status ?? 'offline',
      },
    });
    return normalizeVan(van);
  },

  async resetUserPassword(token: string, userId: string) {
    const response = await request<{ temporary_password?: string; temp_password?: string }>(
      `/admin/users/${userId}/reset-password`,
      {
        method: 'POST',
        token,
      },
    );
    return {
      temp_password: response.temp_password ?? response.temporary_password ?? '',
    };
  },

  async getAdminPendingRequests(token: string) {
    const rides = await request<unknown[]>('/admin/requests', { token });
    return rides.map((ride) => {
      const normalized = normalizeRide(ride);
      const record = isRecord(ride) ? ride : {};
      return {
        id: normalized.id,
        pickup_address: normalized.pickup_address,
        destination_address: normalized.destination_address,
        status: normalized.status,
        rider_name: typeof record.rider_name === 'string' ? record.rider_name : undefined,
        rider_email: typeof record.rider_email === 'string' ? record.rider_email : undefined,
        rider_phone: typeof record.rider_phone === 'string' ? record.rider_phone : undefined,
        age_minutes: typeof record.age_minutes === 'number' ? record.age_minutes : undefined,
        dispatch_note: typeof record.dispatch_note === 'string' ? record.dispatch_note : undefined,
        created_at: normalized.created_at,
      } satisfies AdminPendingRide;
    });
  },

  // Notifications
  async getNotifications(token: string, options?: { includeAlerts?: boolean; limit?: number }) {
    const query = new URLSearchParams();
    if (options?.includeAlerts) query.set('include_alerts', 'true');
    if (options?.limit) query.set('limit', String(options.limit));
    const response = await request<{ items: unknown[]; unread_count: number }>(
      `/notifications${query.toString() ? `?${query.toString()}` : ''}`,
      { token },
    );
    const notifications = (response.items ?? []).map((item) => normalizeNotification(item));
    return {
      notifications,
      items: notifications,
      unread_count: Number(response.unread_count ?? 0),
    } satisfies NotificationFeed;
  },

  async readNotification(token: string, notificationId: string) {
    const response = await request<unknown>(`/notifications/${notificationId}/read`, {
      method: 'POST',
      token,
    });
    return normalizeNotification(response);
  },

  readAllNotifications(token: string, options?: { includeAlerts?: boolean; limit?: number }) {
    const query = new URLSearchParams();
    if (typeof options?.includeAlerts === 'boolean') {
      query.set('include_alerts', String(options.includeAlerts));
    }
    if (typeof options?.limit === 'number') {
      query.set('limit', String(options.limit));
    }
    return this.getNotifications(token, {
      includeAlerts: options?.includeAlerts,
      limit: options?.limit,
    });
  },

  // Recurring Rides
  async getRecurringRides(token: string) {
    const schedules = await request<unknown[]>('/rides/schedules', { token });
    return schedules.map((schedule) => normalizeRecurringRule(schedule));
  },

  createRecurringRide(token: string, payload: {
    name: string;
    pickup_address?: string;
    pickup_lat?: number;
    pickup_lng?: number;
    destination_address?: string;
    destination_lat?: number;
    destination_lng?: number;
    pickup_time?: string;
    pickup_time_local?: string;
    timezone: string;
    weekdays: number[];
    pickup?: { address: string; latitude: number; longitude: number };
    destination?: { address: string; latitude: number; longitude: number };
  }) {
    return request<RecurringRideRule>('/rides/schedules', {
      method: 'POST',
      token,
      body: {
        name: payload.name,
        weekdays: payload.weekdays,
        pickup_time_local: payload.pickup_time_local ?? payload.pickup_time ?? '08:00',
        timezone: payload.timezone,
        pickup: payload.pickup ?? {
          address: payload.pickup_address ?? '',
          latitude: Number(payload.pickup_lat ?? 0),
          longitude: Number(payload.pickup_lng ?? 0),
        },
        destination: payload.destination ?? {
          address: payload.destination_address ?? '',
          latitude: Number(payload.destination_lat ?? 0),
          longitude: Number(payload.destination_lng ?? 0),
        },
      },
    });
  },

  updateRecurringRide(token: string, ruleId: string, payload: {
    name?: string;
    pickup_time?: string;
    pickup_time_local?: string;
    timezone?: string;
    weekdays?: number[];
    is_active?: boolean;
  }) {
    return request<RecurringRideRule>(`/rides/schedules/${ruleId}`, {
      method: 'PUT',
      token,
      body: {
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.weekdays ? { weekdays: payload.weekdays } : {}),
        ...((payload.pickup_time_local || payload.pickup_time)
          ? { pickup_time_local: payload.pickup_time_local ?? payload.pickup_time }
          : {}),
        ...(payload.timezone ? { timezone: payload.timezone } : {}),
        ...(typeof payload.is_active === 'boolean'
          ? { status: payload.is_active ? 'active' : 'paused' }
          : {}),
      },
    });
  },

  // AI Copilot
  getAIInsights(token: string) {
    return request<AIInsight[]>('/ai/insights', { token });
  },

  getCopilotBrief(token: string) {
    return request<CopilotBrief>('/ai/copilot/brief', { token });
  },

  askCopilot(token: string, question: string) {
    return request<CopilotReply>('/ai/copilot/ask', {
      method: 'POST',
      token,
      body: { question },
    });
  },

  // Convenience aliases
  previewRoute(token: string, payload: {
    origin: { latitude: number; longitude: number; address?: string };
    destination: { latitude: number; longitude: number; address?: string };
    intermediates?: Array<{ latitude: number; longitude: number; address?: string }>;
    travel_mode?: string;
  }) {
    return this.getRoutePreview(token, payload);
  },

  updateLocation(token: string, latitude: number, longitude: number) {
    return this.updateDriverLocation(token, latitude, longitude);
  },

  async getVanLocations(token: string) {
    const vans = await this.getAdminVans(token);
    return vans.map((van) => ({
      id: van.id,
      plate_number: van.plate_number,
      latitude: van.latitude ?? van.last_location?.lat ?? 0,
      longitude: van.longitude ?? van.last_location?.lng ?? 0,
      status: van.status,
      driver_name: van.driver_name,
      last_update: van.last_location_update ?? van.last_location?.updated_at ?? new Date().toISOString(),
    })) satisfies VanLocation[];
  },
};
