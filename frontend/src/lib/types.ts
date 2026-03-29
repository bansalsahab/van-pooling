export type UserRole = "employee" | "driver" | "admin";
export type AdminScope = "supervisor" | "dispatcher" | "viewer" | "support";

export interface NotificationPreferences {
  push: boolean;
  sms: boolean;
  email: boolean;
}

export interface UserProfile {
  id: string;
  company_id?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  admin_scope?: AdminScope | null;
  admin_permissions?: string[];
  status: string;
  company_name?: string | null;
  notification_preferences?: NotificationPreferences;
  must_reset_password?: boolean;
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
  dispatch_window_opens_at?: string | null;
  minutes_until_dispatch_window?: number | null;
  minutes_until_pickup?: number | null;
  schedule_phase?: string | null;
  assignment_timing_note?: string | null;
  delay_explanation?: string | null;
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

export interface DriverScheduledWorkSummary {
  ride_id: string;
  trip_id: string;
  ride_status: string;
  pickup_address: string;
  destination_address: string;
  scheduled_time?: string | null;
  dispatch_window_opens_at?: string | null;
  minutes_until_dispatch_window?: number | null;
  minutes_until_pickup?: number | null;
  schedule_phase?: string | null;
  assignment_timing_note?: string | null;
  delay_explanation?: string | null;
  passenger_name?: string | null;
}

export interface DriverDashboardSummary {
  driver_id: string;
  driver_name: string;
  van?: VanSummary | null;
  active_trip?: DriverTripSummary | null;
  upcoming_scheduled_work: DriverScheduledWorkSummary[];
}

export interface DriverShiftSummary {
  id: string;
  company_id?: string | null;
  driver_id: string;
  status: "scheduled" | "clocked_in" | "clocked_out" | "missed" | string;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  clocked_in_at?: string | null;
  clocked_out_at?: string | null;
  duration_minutes?: number | null;
  notes?: string | null;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DriverShiftStartInput {
  planned_end_at?: string | null;
  notes?: string;
}

export interface DriverVehicleCheckSummary {
  id: string;
  company_id?: string | null;
  driver_id: string;
  van_id?: string | null;
  shift_id?: string | null;
  status: "passed" | "failed" | string;
  checklist: Record<string, boolean>;
  failed_items: string[];
  notes?: string | null;
  submitted_at?: string | null;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DriverVehicleCheckCreateInput {
  checklist: Record<string, boolean>;
  notes?: string;
  status?: "passed" | "failed";
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

export interface EnterpriseSSOStartResponse {
  company_name: string;
  company_domain: string;
  configured: boolean;
  provider?: "oidc" | "saml" | null;
  redirect_url?: string | null;
  guidance: string;
  relay_state?: string | null;
}

export interface EnterpriseSSOStartRequest {
  company_domain: string;
  requested_role?: UserRole;
  relay_state?: string | null;
}

export interface EnterpriseSSOConfig {
  enabled: boolean;
  provider: "oidc" | "saml";
  issuer_url?: string | null;
  sso_login_url?: string | null;
  sso_logout_url?: string | null;
  client_id?: string | null;
  audience?: string | null;
  redirect_uri?: string | null;
}

export interface EnterpriseSCIMConfig {
  enabled: boolean;
  base_url?: string | null;
  provisioning_mode: "manual" | "sync_hook";
  bearer_token_hint?: string | null;
}

export interface EnterpriseIdentityConfig {
  sso: EnterpriseSSOConfig;
  scim: EnterpriseSCIMConfig;
  updated_at?: string | null;
  updated_by_user_id?: string | null;
}

export interface EnterpriseIdentityConfigUpdate {
  sso: EnterpriseSSOConfig;
  scim: EnterpriseSCIMConfig;
  scim_bearer_token?: string | null;
}

export type AuditExportFormat = "json" | "csv";

export interface AuditExportRecord {
  source: string;
  occurred_at?: string | null;
  event_type: string;
  actor_type?: string | null;
  actor_user_id?: string | null;
  ride_id?: string | null;
  trip_id?: string | null;
  status?: string | null;
  severity?: string | null;
  reason?: string | null;
  details: Record<string, unknown>;
}

export interface AuditExportResponse {
  company_id: string;
  generated_at: string;
  record_count: number;
  signature: string;
  signature_algorithm: string;
  records: AuditExportRecord[];
}

export type KPIWindow = "today" | "7d" | "30d";

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
  window: KPIWindow;
  window_start: string;
  window_end: string;
  generated_at: string;
  metrics: AdminKPIValues;
  counters: AdminKPICounters;
}

export type ProfileDomain = "employee" | "driver" | "admin";

export interface DomainProfileSummary {
  domain: ProfileDomain;
  sample_size: number;
  request_count: number;
  error_count: number;
  slow_request_count: number;
  error_rate_percent: number;
  slow_request_rate_percent: number;
  average_latency_ms?: number | null;
  p50_latency_ms?: number | null;
  p95_latency_ms?: number | null;
  last_updated_at?: string | null;
}

export interface DomainProfilingSnapshot {
  generated_at: string;
  max_samples_per_domain: number;
  slow_request_threshold_ms: number;
  profiles: DomainProfileSummary[];
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
  updated_at?: string | null;
  updated_by_user_id?: string | null;
}

export interface PolicyViolation {
  code: string;
  message: string;
  field?: string | null;
}

export interface PolicySimulationRequest {
  pickup_latitude: number;
  pickup_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  scheduled_time?: string | null;
  role?: string;
  team?: string | null;
  is_women_rider?: boolean;
}

export interface PolicySimulationResponse {
  allowed: boolean;
  dispatch_priority: number;
  violations: PolicyViolation[];
  policy: CommutePolicyConfig;
}

export interface ServiceZoneSummary {
  id: string;
  company_id?: string | null;
  name: string;
  zone_type: "pickup" | "destination";
  polygon_geojson: Record<string, unknown>;
  notes?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ServiceZoneCreateInput {
  name: string;
  zone_type: "pickup" | "destination";
  polygon_geojson: Record<string, unknown>;
  notes?: string;
  is_active?: boolean;
}

export interface ServiceZoneUpdateInput {
  name?: string;
  polygon_geojson?: Record<string, unknown>;
  notes?: string | null;
  is_active?: boolean;
}

export interface RecurringLocationInput {
  address: string;
  latitude: number;
  longitude: number;
}

export interface RecurringRideRuleSummary {
  id: string;
  user_id: string;
  company_id?: string | null;
  name: string;
  status: "active" | "paused" | string;
  weekdays: number[];
  pickup_time_local: string;
  timezone: string;
  pickup: RecurringLocationInput;
  destination: RecurringLocationInput;
  last_generated_for_date?: string | null;
  next_pickup_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RecurringRideRuleCreateInput {
  name: string;
  weekdays: number[];
  pickup_time_local: string;
  timezone: string;
  pickup: RecurringLocationInput;
  destination: RecurringLocationInput;
}

export interface RecurringRideRuleUpdateInput {
  name?: string;
  weekdays?: number[];
  pickup_time_local?: string;
  timezone?: string;
  status?: "active" | "paused";
  pickup?: RecurringLocationInput;
  destination?: RecurringLocationInput;
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

export interface SLABreachSummary {
  breach_type: string;
  title: string;
  severity: string;
  count: number;
  threshold_label: string;
  note: string;
  sample_entity_id?: string | null;
  entity_type?: string | null;
}

export interface SLASnapshotSummary {
  company_id: string;
  generated_at: string;
  open_breach_count: number;
  health: "healthy" | "warning" | "critical" | string;
  breaches: SLABreachSummary[];
}

export interface IncidentTimelineItem {
  id: string;
  title?: string | null;
  message: string;
  status: string;
  severity: string;
  kind: string;
  breach_type?: string | null;
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
  breach_type?: string | null;
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
  admin_scope?: AdminScope;
}

export interface AdminUserUpdateInput {
  name?: string;
  phone?: string | null;
  role?: UserRole;
  status?: "active" | "inactive" | "suspended";
  admin_scope?: AdminScope;
}

export interface AdminPasswordResetResponse {
  user_id: string;
  temporary_password: string;
  must_reset_password: boolean;
  message: string;
}

export interface UserProfileUpdateInput {
  name?: string;
  phone?: string | null;
  notification_preferences?: NotificationPreferences;
  home_address?: string | null;
  home_latitude?: number | null;
  home_longitude?: number | null;
  default_destination_address?: string | null;
  default_destination_latitude?: number | null;
  default_destination_longitude?: number | null;
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
  confidence: "low" | "medium" | "high";
  health_score: number;
  priorities: string[];
  recommended_actions: string[];
  operational_notes: string[];
  source_signals: string[];
  quick_prompts: string[];
  rider_message?: string | null;
  generated_at: string;
  generated_by: "openai" | "fallback";
  model?: string | null;
}

export interface CopilotReply {
  answer: string;
  action_items: string[];
  caution?: string | null;
  source_signals: string[];
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

export type LiveConnectionQuality = "good" | "degraded" | "critical";

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
  markerLabel?: string;
  badgeCount?: number;
}

export interface MapPolylineSpec {
  id: string;
  encodedPath?: string | null;
  points?: Array<{ latitude: number; longitude: number }>;
  color?: string;
}
