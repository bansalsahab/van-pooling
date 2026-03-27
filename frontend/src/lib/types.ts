export type UserRole = "employee" | "driver" | "admin";

export interface UserProfile {
  id: string;
  company_id?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  status: string;
  company_name?: string | null;
  home_address?: string | null;
  home_latitude?: number | null;
  home_longitude?: number | null;
  default_destination_address?: string | null;
  default_destination_latitude?: number | null;
  default_destination_longitude?: number | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}

export interface RouteWaypoint {
  latitude: number;
  longitude: number;
  address: string;
  label?: string | null;
  kind?: "origin" | "pickup" | "destination" | "van" | "stop";
  status?: string | null;
}

export interface RouteStep {
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
  encoded_polyline?: string | null;
}

export interface RoutePickupSequenceItem {
  ride_request_id: string;
  user_id: string;
  passenger_name?: string | null;
  pickup_address?: string | null;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  destination_address?: string | null;
  destination_latitude?: number | null;
  destination_longitude?: number | null;
  status?: string | null;
}

export interface RoutePlan {
  source: "google_maps" | "heuristic";
  travel_mode: string;
  traffic_aware: boolean;
  distance_meters: number;
  duration_seconds: number;
  duration_minutes: number;
  encoded_polyline?: string | null;
  origin?: RouteWaypoint | null;
  destination?: RouteWaypoint | null;
  waypoints: RouteWaypoint[];
  steps: RouteStep[];
  warnings: string[];
  pickup_sequence?: RoutePickupSequenceItem[];
  passenger_count?: number;
  destination_address?: string | null;
  destination_latitude?: number | null;
  destination_longitude?: number | null;
  updated_at?: string | null;
}

export interface MatchingReasonSummary {
  reason: string;
  label: string;
  count?: number;
}

export interface MatchingCandidateSummary {
  candidate_type?: string;
  label?: string;
  trip_id?: string | null;
  van_id?: string | null;
  metrics?: Record<string, unknown>;
  score_breakdown?: Record<string, unknown>;
  rejection_reasons?: string[];
  rejection_labels?: string[];
}

export interface DispatchDecisionMetadata {
  evaluated_at?: string;
  scheduled?: boolean;
  dispatch_window_open?: boolean | null;
  pickup_address?: string;
  destination_address?: string;
  policy?: Record<string, unknown>;
  pool_candidates?: MatchingCandidateSummary[];
  van_candidates?: MatchingCandidateSummary[];
  selected_candidate?: MatchingCandidateSummary | null;
  top_rejection_reasons?: MatchingReasonSummary[];
  outcome?: string;
  note?: string;
  advisories?: string[];
  candidate_counts?: {
    pool?: number;
    van?: number;
  };
  failure_status?: string;
}

export interface RideSummary {
  id: string;
  status: string;
  pickup_address: string;
  destination_address: string;
  scheduled_time?: string | null;
  requested_at?: string | null;
  estimated_wait_minutes?: number | null;
  estimated_cost?: string | number | null;
  dispatch_metadata?: DispatchDecisionMetadata;
  trip_id?: string | null;
  van_id?: string | null;
  van_license_plate?: string | null;
  driver_name?: string | null;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  destination_latitude?: number | null;
  destination_longitude?: number | null;
  van_latitude?: number | null;
  van_longitude?: number | null;
  van_last_location_update?: string | null;
  route_polyline?: string | null;
  route_distance_meters?: number | null;
  route_duration_minutes?: number | null;
  next_stop_address?: string | null;
  driver_acknowledged_at?: string | null;
}

export interface AdminPendingRideSummary extends RideSummary {
  rider_name?: string | null;
  rider_email?: string | null;
  rider_phone?: string | null;
  age_minutes: number;
  request_kind: "immediate" | "scheduled" | string;
  dispatch_note?: string | null;
}

export interface VanSummary {
  id: string;
  license_plate: string;
  capacity: number;
  current_occupancy: number;
  status: string;
  driver_id?: string | null;
  driver_name?: string | null;
  last_location_update?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface TripPassengerSummary {
  ride_request_id: string;
  user_id: string;
  passenger_name?: string | null;
  status: string;
  pickup_address?: string | null;
  destination_address?: string | null;
  pickup_stop_index: number;
  dropoff_stop_index: number;
}

export interface DriverTripSummary {
  id: string;
  status: string;
  van_id: string;
  route: RoutePlan;
  estimated_duration_minutes?: number | null;
  accepted_at?: string | null;
  started_at?: string | null;
  passenger_count: number;
  passengers: TripPassengerSummary[];
}

export interface DriverDashboardSummary {
  driver_id: string;
  driver_name: string;
  van?: VanSummary | null;
  active_trip?: DriverTripSummary | null;
}

export interface AdminDashboardSummary {
  company_id: string;
  employees_count: number;
  drivers_count: number;
  total_vans: number;
  available_vans: number;
  active_vans: number;
  pending_requests: number;
  active_trips: number;
  open_alerts: number;
}

export interface TripSummary {
  id: string;
  status: string;
  van_id: string;
  van_license_plate?: string | null;
  route: RoutePlan;
  estimated_duration_minutes?: number | null;
  accepted_at?: string | null;
  started_at?: string | null;
  created_at?: string | null;
  passenger_count: number;
  passengers: TripPassengerSummary[];
}

export interface AlertSummary {
  id: string;
  title?: string | null;
  message: string;
  status: string;
  severity: string;
  kind: string;
  entity_type?: string | null;
  entity_id?: string | null;
  ride_id?: string | null;
  trip_id?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
}

export interface NotificationSummary {
  id: string;
  type: string;
  title?: string | null;
  message: string;
  status: string;
  kind?: string | null;
  severity?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  ride_id?: string | null;
  trip_id?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
  read_at?: string | null;
}

export interface NotificationFeed {
  items: NotificationSummary[];
  unread_count: number;
}

export interface DispatchEventSummary {
  id: string;
  company_id: string;
  ride_id?: string | null;
  trip_id?: string | null;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_type: string;
  event_type: string;
  from_state?: string | null;
  to_state?: string | null;
  reason?: string | null;
  metadata: Record<string, unknown>;
  created_at?: string | null;
}

export interface AdminUserCreateInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: UserRole;
}

export interface AdminVanCreateInput {
  license_plate: string;
  capacity: number;
  driver_id?: string | null;
  status: string;
}

export interface AIInsight {
  title: string;
  summary: string;
  priority: string;
  recommended_actions: string[];
  signals: string[];
}

export interface CopilotBrief {
  headline: string;
  summary: string;
  urgency: "low" | "medium" | "high";
  priorities: string[];
  recommended_actions: string[];
  operational_notes: string[];
  rider_message?: string | null;
  generated_at: string;
  generated_by: "openai" | "fallback";
  model?: string | null;
}

export interface CopilotReply {
  answer: string;
  action_items: string[];
  caution?: string | null;
  generated_at: string;
  generated_by: "openai" | "fallback";
  model?: string | null;
}

export interface GeocodeResult {
  address: string;
  latitude: number;
  longitude: number;
  place_id?: string | null;
  source: "google_maps" | "fallback";
}

export interface EmployeeLiveSnapshot {
  role: "employee";
  generated_at: string;
  data: {
    active_ride: RideSummary | null;
    ride_history: RideSummary[];
    notifications: NotificationSummary[];
    notifications_unread_count: number;
  };
  insights: AIInsight[];
}

export interface DriverLiveSnapshot {
  role: "driver";
  generated_at: string;
  data: {
    dashboard: DriverDashboardSummary | null;
    active_trip: DriverTripSummary | null;
    notifications: NotificationSummary[];
    notifications_unread_count: number;
  };
  insights: AIInsight[];
}

export interface AdminLiveSnapshot {
  role: "admin";
  generated_at: string;
  data: {
    dashboard: AdminDashboardSummary | null;
    vans: VanSummary[];
    employees: UserProfile[];
    drivers: UserProfile[];
    trips: TripSummary[];
    pending_requests: AdminPendingRideSummary[];
    alerts: AlertSummary[];
    notifications: NotificationSummary[];
    notifications_unread_count: number;
  };
  insights: AIInsight[];
}

export type LiveSnapshot =
  | EmployeeLiveSnapshot
  | DriverLiveSnapshot
  | AdminLiveSnapshot;

export type LiveConnectionState =
  | "connecting"
  | "live"
  | "reconnecting"
  | "error";

export type LiveEventName =
  | "snapshot.updated"
  | "ride.updated"
  | "trip.updated"
  | "van.updated"
  | "driver.updated"
  | "alert.created"
  | "alert.resolved"
  | "notification.created"
  | "notification.updated"
  | "heartbeat";

export interface LiveOperationalEventPayload {
  entity_type: string;
  entity_id?: string | null;
  action: string;
  role: UserRole;
  generated_at: string;
  changed_fields: string[];
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface LiveOperationalEvent {
  event: Exclude<LiveEventName, "snapshot.updated" | "heartbeat">;
  sequence?: number;
  payload: LiveOperationalEventPayload;
}

export interface MapMarkerSpec {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
  tone?: "van" | "pickup" | "destination" | "warning" | "default";
}

export interface MapPolylineSpec {
  id: string;
  encodedPath?: string | null;
  points?: Array<{ latitude: number; longitude: number }>;
  color?: string;
}
