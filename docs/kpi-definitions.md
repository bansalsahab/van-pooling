# KPI Definitions (Stage 0 Baseline)

## Scope

This document defines the baseline KPI contract for the admin operations dashboard.

- Endpoint: `GET /api/v1/admin/kpis?window=today|7d|30d`
- Tenant scope: all calculations are restricted to `company_id` from admin JWT.
- Timezone baseline: UTC timestamps (server-side) for V1.

## KPI Windows

- `today`: from 00:00:00 UTC to now
- `7d`: now minus 7 days to now
- `30d`: now minus 30 days to now

## Metrics

### `p95_wait_time_minutes`

- **Meaning:** 95th percentile time from request creation to actual pickup.
- **Source fields:** `ride_requests.requested_at`, `ride_requests.actual_pickup_time`
- **Inclusion:** rides in window with both timestamps present.
- **Formula:** percentile(95) of `(actual_pickup_time - requested_at)` in minutes.

### `on_time_pickup_percent`

- **Meaning:** share of scheduled rides picked up on time.
- **Source fields:** `ride_requests.scheduled_time`, `ride_requests.actual_pickup_time`
- **Inclusion:** rides with both scheduled and actual pickup timestamps in window.
- **On-time rule (V1):** `actual_pickup_time <= scheduled_time + 5 minutes`.
- **Formula:** `(on_time_count / scheduled_pickups_considered) * 100`.

### `seat_utilization_percent`

- **Meaning:** average booked seat usage against capacity on completed trips.
- **Source fields:** `trips`, `trip_passengers`, `vans.capacity`
- **Inclusion:** completed trips in window with known van capacity.
- **Passenger rule:** passenger counted when trip passenger status is not `no_show`.
- **Formula:** `(sum(eligible_passengers) / sum(van_capacity_for_completed_trips)) * 100`.

### `deadhead_km_per_trip`

- **Meaning:** average pre-pickup reposition distance per trip.
- **Source fields:** `trips.route.origin`, `trips.route.waypoints`
- **Inclusion:** completed trips in window with an origin waypoint and at least one pickup waypoint.
- **Formula:** average haversine distance between route origin and first pickup waypoint, in km.

### `dispatch_success_percent`

- **Meaning:** share of dispatch-decided rides that resulted in a successful assignment.
- **Source fields:** `ride_requests.status`, `ride_requests.requested_at`
- **Inclusion:** rides in window excluding unresolved pending states and `cancelled_by_employee`.
- **Success states:** `matched`, `driver_en_route`, `arrived_at_pickup`, `picked_up`, `in_transit`, `arrived_at_destination`, `dropped_off`, `completed`.
- **Formula:** `(successful_dispatch_count / dispatch_decided_count) * 100`.

## Returned Counters

The API also returns denominator counters used in each KPI for transparency:

- `rides_considered`
- `scheduled_pickups_considered`
- `trips_considered`
- `dispatch_decisions_considered`

## Sparse Data Behavior

- If a KPI has no eligible rows in the selected window, value returns `null`.
- Counters still return `0`.
- Frontend should render `Not enough data` for null values instead of `0`.
