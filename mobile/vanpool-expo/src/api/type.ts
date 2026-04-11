export type UserRole = "employee" | "driver" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string | null;
  enterprise_id?: string | null;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export interface RideSummary {
  id: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  requested_pickup_time: string;
  passengers: number;
  status: string;
  assigned_van_plate?: string | null;
  driver_name?: string | null;
  eta_minutes?: number | null;
  created_at: string;
}

export interface EmployeeDashboard {
  next_ride: RideSummary | null;
  active_count: number;
  pending_count: number;
  recent_rides: RideSummary[];
}

export interface VanSummary {
  id: string;
  plate: string;
  capacity: number;
  status: string;
  lat?: number | null;
  lng?: number | null;
  driver_id?: string | null;
  driver_name?: string | null;
  current_trip_id?: string | null;
}

export interface DriverDashboardSummary {
  driver_name: string;
  status: string;
  assigned_van: VanSummary | null;
  current_shift_id?: string | null;
  shift_started_at?: string | null;
  today_completed_trips: number;
  today_passengers_served: number;
  current_trip_id?: string | null;
}

export interface DriverShiftSummary {
  id: string;
  driver_id: string;
  van_id?: string | null;
  started_at: string;
  ended_at?: string | null;
  status: string;
  notes?: string | null;
}

export interface TripSummary {
  id: string;
  van_id: string;
  van_license_plate?: string | null;
  status: string;
  passenger_count: number;
  route: {
    origin?: { lat: number; lng: number; address?: string } | null;
    destination?: { lat: number; lng: number; address?: string } | null;
    eta_minutes?: number | null;
  };
  rides: RideSummary[];
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface DriverTripSummary extends TripSummary {
  next_action: "start" | "pickup" | "dropoff" | "complete" | "none";
  next_ride_request_id?: string | null;
}

export interface AdminDashboard {
  total_employees: number;
  total_drivers: number;
  total_vans: number;
  active_vans: number;
  active_trips: number;
  pending_requests: number;
  today_completed_trips: number;
  today_passengers_served: number;
}

export interface NotificationSummary {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  is_alert: boolean;
  created_at: string;
}

export interface NotificationFeed {
  items: NotificationSummary[];
  unread_count: number;
  alert_count: number;
}

export interface GeocodeResult {
  address: string;
  lat: number;
  lng: number;
}