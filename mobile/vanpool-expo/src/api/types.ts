export interface User {
  id: string;
  email: string;
  full_name: string;
  name?: string;
  role: 'employee' | 'driver' | 'admin';
  phone?: string;
  department?: string;
  is_active: boolean;
  admin_scope?: 'supervisor' | 'dispatcher' | 'viewer' | 'support';
  company_name?: string;
  must_reset_password?: boolean;
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
}

export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  user?: User;
}

export interface RideSummary {
  id: string;
  status: string;
  pickup_address: string;
  destination_address: string;
  dropoff_address?: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  destination_latitude?: number;
  destination_longitude?: number;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  scheduled_time?: string;
  requested_pickup_time?: string;
  pickup_time?: string;
  requested_at?: string;
  created_at: string;
  passengers?: number;
  estimated_wait_minutes?: number;
  driver_name?: string;
  van_plate?: string;
  trip_id?: string;
  boarding_otp_code?: string;
  route_polyline?: string;
  route_distance_meters?: number;
  route_duration_minutes?: number;
  van_latitude?: number;
  van_longitude?: number;
}

export interface EmployeeDashboard {
  user: User;
  active_count: number;
  pending_count: number;
  next_ride?: {
    id: string;
    pickup_address: string;
    requested_pickup_time: string;
    eta_minutes?: number;
  };
  recent_rides: Array<{
    id: string;
    pickup_address: string;
    status: string;
    created_at: string;
  }>;
}

export interface RecurringRideRule {
  id: string;
  name: string;
  status: string;
  is_active: boolean;
  weekdays: number[];
  pickup_time_local: string;
  pickup_time?: string;
  timezone: string;
  pickup: {
    address: string;
    latitude: number;
    longitude: number;
  };
  destination: {
    address: string;
    latitude: number;
    longitude: number;
  };
  pickup_address?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  destination_address?: string;
  destination_lat?: number;
  destination_lng?: number;
  next_pickup?: string;
}

export interface SavedLocation {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  is_default: boolean;
}

export interface DriverDashboardSummary {
  driver_id: string;
  driver_name?: string;
  status?: string;
  current_shift_id?: string;
  current_shift?: DriverShiftSummary;
  active_trip?: DriverTripSummary;
  van?: {
    plate_number?: string;
    license_plate?: string;
    capacity: number;
    status?: string;
  };
  assigned_van?: {
    plate: string;
    capacity: number;
  };
  today_completed_trips?: number;
  today_passengers_served?: number;
}

export interface DriverShiftSummary {
  id: string;
  driver_id: string;
  started_at: string;
  ended_at?: string;
  status: string;
  total_trips?: number;
  total_passengers?: number;
}

export interface DriverTripSummary {
  id: string;
  status: string;
  scheduled_start?: string;
  actual_start?: string;
  actual_end?: string;
  van_id: string;
  route_name?: string;
  passenger_count: number;
  passengers: TripPassenger[];
  route: {
    origin?: { address: string; latitude?: number; longitude?: number };
    destination?: { address: string; latitude?: number; longitude?: number };
    encoded_polyline?: string;
    distance_meters?: number;
    duration_minutes?: number;
  };
  next_action?: 'start' | 'pickup' | 'dropoff' | 'complete';
  next_stop?: {
    address: string;
    passenger_name: string;
    action: 'pickup' | 'dropoff';
    eta_minutes?: number;
  };
}

export interface TripPassenger {
  ride_request_id: string;
  passenger_name: string;
  pickup_address: string;
  dropoff_address?: string;
  destination_address?: string;
  status: 'waiting' | 'picked_up' | 'dropped_off' | 'cancelled';
  pickup_time?: string;
}

export interface VehicleCheck {
  id: string;
  driver_id: string;
  van_id?: string;
  check_type?: 'pre_trip' | 'post_trip';
  status: 'passed' | 'failed';
  items?: VehicleCheckItem[];
  checklist?: Record<string, unknown>;
  failed_items?: string[];
  notes?: string;
  created_at?: string;
  submitted_at?: string;
}

export interface VehicleCheckItem {
  name: string;
  passed: boolean;
  notes?: string;
}

export interface VanSummary {
  id: string;
  plate_number: string;
  model: string;
  capacity: number;
  current_occupancy?: number;
  status: string;
  current_driver_id?: string;
  current_driver_name?: string;
  driver_name?: string;
  latitude?: number;
  longitude?: number;
  last_location?: {
    lat: number;
    lng: number;
    updated_at: string;
  };
  last_location_update?: string;
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
  open_alerts?: number;
}

export interface AdminTrip {
  id: string;
  status: string;
  van_id?: string;
  scheduled_start?: string;
  actual_start?: string;
  actual_end?: string;
  van_plate?: string;
  van_license_plate?: string;
  driver_name?: string;
  passenger_count: number;
  route_name?: string;
  created_at?: string;
  accepted_at?: string;
  started_at?: string;
  route?: {
    origin?: { address?: string; latitude?: number; longitude?: number };
    destination?: { address?: string; latitude?: number; longitude?: number };
    duration_minutes?: number;
    distance_meters?: number;
  };
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: 'employee' | 'driver' | 'admin';
  phone?: string;
  is_active: boolean;
  admin_scope?: string;
  status?: string;
  created_at: string;
}

export interface AdminPendingRide {
  id: string;
  pickup_address: string;
  destination_address: string;
  status: string;
  rider_name?: string;
  rider_email?: string;
  rider_phone?: string;
  age_minutes?: number;
  dispatch_note?: string;
  created_at?: string;
}

export interface AlertSummary {
  id: string;
  title?: string;
  message: string;
  status: string;
  severity: string;
  kind: string;
  entity_type?: string;
  entity_id?: string;
  ride_id?: string;
  trip_id?: string;
  created_at?: string;
  resolved_at?: string;
}

export interface AdminKPIValues {
  p95_wait_time_minutes?: number | null;
  on_time_pickup_percent?: number | null;
  seat_utilization_percent?: number | null;
  deadhead_km_per_trip?: number | null;
  dispatch_success_percent?: number | null;
}

export interface AdminKPICounters {
  rides_considered: number;
  scheduled_pickups_considered: number;
  trips_considered: number;
  dispatch_decisions_considered: number;
}

export interface AdminKPISummary {
  company_id: string;
  window: 'today' | '7d' | '30d';
  window_start: string;
  window_end: string;
  generated_at: string;
  metrics: AdminKPIValues;
  counters: AdminKPICounters;
}

export interface SLABreachSummary {
  breach_type: string;
  title: string;
  severity: string;
  count: number;
  threshold_label: string;
  note: string;
  sample_entity_id?: string;
  entity_type?: string;
}

export interface SLASnapshotSummary {
  company_id: string;
  generated_at: string;
  open_breach_count: number;
  health: 'healthy' | 'warning' | 'critical' | string;
  breaches: SLABreachSummary[];
}

export interface IncidentTimelineItem {
  id: string;
  title?: string;
  message: string;
  status: string;
  severity: string;
  kind: string;
  breach_type?: string;
  entity_type?: string;
  entity_id?: string;
  ride_id?: string;
  trip_id?: string;
  created_at?: string;
  resolved_at?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  status?: string;
  kind?: string;
  severity?: string;
  ride_id?: string;
  trip_id?: string;
  data?: Record<string, unknown>;
}

export interface NotificationFeed {
  notifications: NotificationItem[];
  items?: NotificationItem[];
  unread_count: number;
}

export interface PolicyZoneBounds {
  min_latitude?: number | null;
  max_latitude?: number | null;
  min_longitude?: number | null;
  max_longitude?: number | null;
}

export interface ServiceZonePolicy {
  enabled: boolean;
  pickup_bounds?: PolicyZoneBounds | null;
  destination_bounds?: PolicyZoneBounds | null;
}

export interface SchedulePolicy {
  min_lead_minutes: number;
  max_days_ahead: number;
  dispatch_cutoff_minutes_before_pickup: number;
}

export interface CancellationPolicy {
  employee_cutoff_minutes_before_pickup: number;
}

export interface WomenSafetyWindowPolicy {
  enabled: boolean;
  start_local_time: string;
  end_local_time: string;
  timezone: string;
  requires_scheduled_rides: boolean;
  apply_to_all_riders: boolean;
}

export interface CommutePolicyConfig {
  priority_by_user_role: Record<string, number>;
  priority_by_team: Record<string, number>;
  service_zone: ServiceZonePolicy;
  schedule: SchedulePolicy;
  cancellation: CancellationPolicy;
  women_safety_window: WomenSafetyWindowPolicy;
  updated_at?: string;
  updated_by_user_id?: string;
}

export interface GeocodeResult {
  address: string;
  formatted_address?: string;
  latitude: number;
  longitude: number;
  lat: number;
  lng: number;
  place_id?: string;
  source?: 'google_maps' | 'fallback';
}

export interface CopilotBrief {
  role: 'employee' | 'driver' | 'admin';
  headline: string;
  summary: string;
  urgency: 'low' | 'medium' | 'high';
  confidence: 'low' | 'medium' | 'high';
  health_score: number;
  priorities: string[];
  recommended_actions: string[];
  operational_notes: string[];
  source_signals: string[];
  quick_prompts: string[];
  rider_message?: string;
  generated_by: 'openai' | 'fallback';
  model?: string;
}

export interface CopilotReply {
  answer: string;
  action_items: string[];
  source_signals: string[];
  caution?: string;
  generated_by: 'openai' | 'fallback';
  model?: string;
}

export interface AIInsight {
  title: string;
  summary: string;
  priority: string;
  recommended_actions: string[];
  signals: string[];
}

export interface RoutePreview {
  source: 'google_maps' | 'heuristic';
  travel_mode?: string;
  distance_meters: number;
  duration_seconds?: number;
  duration_minutes: number;
  traffic_aware: boolean;
  steps: RouteStep[];
  encoded_polyline?: string;
  warnings?: string[];
}

export interface RouteStep {
  instruction: string;
  distance_meters: number;
  duration_seconds?: number;
  encoded_polyline?: string;
}

export interface VanLocation {
  id: string;
  plate_number: string;
  latitude: number;
  longitude: number;
  status: string;
  driver_name?: string;
  last_update: string;
}
