# Van Pooling Platform: Multi-Tenant Demand-Responsive Employee Commute System

## Summary

This project is a B2B employee commute platform for companies, campuses, and office parks that want to replace static shuttle routes with demand-responsive pooled transport.

The system is built around one integrated operating loop:

1. Employees create immediate or scheduled ride requests.
2. The matching engine either pools those requests into an existing trip or creates a new trip with the best eligible van.
3. Drivers execute pickups and drop-offs while sharing live location.
4. Admins monitor demand, fleet health, active trips, and operational exceptions.
5. Realtime events keep employee, driver, and admin views synchronized.
6. OpenAI copilots explain the current state and recommend actions, but do not make dispatch decisions.

This document is the canonical engineering product spec for the platform. It is intended for implementation and product execution, not for pitch or investor use.

## Product Definition

### What This App Is

- A company-scoped fleet operations platform for employee commute pooling
- A shared system for employees, drivers, and admins
- A realtime dispatch, tracking, and operations surface with maps and AI-assisted guidance

### What This App Is Not

- Not a consumer ride-hailing app
- Not an open marketplace for public transport supply
- Not an AI-autonomous dispatch system where the model changes live operational state on its own

### Primary Roles

#### Employee

- Request immediate rides
- Schedule future rides
- Track assignment, ETA, van location, and trip progress
- Cancel before boarding
- Receive ride updates and rider-facing guidance

#### Driver

- View assigned van and active trip workload
- Share live GPS location
- Start trip execution
- Mark pickup and drop-off progress
- Handle exceptions such as no-show or pickup issues

#### Admin

- Monitor supply, demand, and trip flow
- Track van readiness, stale GPS, and trip delays
- Provision users and vans
- Reassign or cancel rides/trips
- Respond to operational alerts

## Current Capability in This Repo

The current codebase already supports the following:

- Role-based frontend workspaces for employee, driver, and admin
- JWT authentication with company-linked users
- Employee ride request flow for immediate and scheduled rides
- Driver dashboard with status updates, trip actions, and location updates
- Admin dashboard with fleet, people, and trip monitoring
- Google Maps route previews and map-based role dashboards
- OpenAI-based copilot briefings and role-aware Q&A
- Realtime live snapshots using SSE
- Basic pooling and van selection heuristics

## Current Gaps and Risks

The current implementation still needs stronger product and engineering alignment in the following areas:

- Ride lifecycle states are not yet fully unified across all backend and frontend flows
- Trip lifecycle precision is weaker than ride lifecycle precision
- Matching behavior exists, but must become explicitly config-driven and deterministic
- Scheduled rides are stored but not yet orchestrated as a true timed subsystem
- Realtime transport is currently SSE-first, while the target architecture should be WebSocket-first
- Dispatch intervention, alerts, notifications, analytics completeness, and audit trail are only partial

## Canonical Ride Lifecycle State Machine

This lifecycle must be used consistently across backend services, frontend state rendering, realtime events, and AI context.

### Active Ride States

- `requested`: ride submitted and aggregation timer started
- `matching`: matcher is evaluating pooling and new-trip options
- `matched`: ride assigned to a trip and van
- `driver_en_route`: driver is moving toward the rider pickup
- `arrived_at_pickup`: driver has reached pickup threshold
- `picked_up`: rider boarding confirmed
- `in_transit`: rider is traveling toward destination
- `arrived_at_destination`: driver has reached destination threshold
- `dropped_off`: rider exit confirmed
- `completed`: ride has been operationally closed

### Exception and Terminal Ride States

- `cancelled_by_employee`
- `cancelled_by_admin`
- `no_show`
- `reassigned`
- `failed_no_capacity`
- `failed_driver_unreachable`
- `failed_operational_issue`

### Ride State Ownership

#### Employee-owned actions

- create ride request
- cancel only before `picked_up`

#### System-owned actions

- move `requested -> matching -> matched`
- move to `failed_*`
- move to `reassigned`

#### Driver-owned actions

- move `matched -> driver_en_route`
- move `driver_en_route -> arrived_at_pickup`
- move `arrived_at_pickup -> picked_up`
- move `picked_up -> in_transit`
- move `in_transit -> arrived_at_destination`
- move `arrived_at_destination -> dropped_off`

#### Admin-owned actions

- cancel ride
- reassign ride
- fail ride when operational recovery is not possible
- override deadlocked operational states

## Canonical Trip Lifecycle State Machine

Trips are the driver/admin operating object and must be specified just as clearly as rides.

### Trip States

- `planned`: trip exists but assignments are still being finalized or trip is not yet ready to start
- `dispatch_ready`: trip has at least one assigned rider, a van, and a driver and is ready for driver action
- `active_to_pickup`: driver is executing queued pickups
- `active_in_transit`: pending pickups are complete and riders are being delivered
- `active_mixed`: some riders are onboard while more pickups remain
- `completed`: all riders dropped off and van released

### Exception Trip States

- `reassigned`
- `cancelled`
- `failed_operational_issue`

### Trip Blocking Rule

A trip blocks a van from new pooling only when:

- the trip is in one of the active trip states, and
- `van.current_occupancy >= van.capacity`

If a van is active but still has spare seats, it may remain pool-eligible if detour, schedule, and destination rules still pass.

## Matching Engine Specification

The matching engine is deterministic and config-driven in v1. AI does not participate in dispatch scoring.

### Van Eligibility

A van is eligible when:

- `van.status == available`, or
- `van.status == on_trip` and the van still has spare capacity
- a driver is assigned
- driver heartbeat age is less than or equal to 120 seconds
- the active trip is not blocking by the trip blocking rule
- the van belongs to the same company as the ride
- the van is within configured pickup feasibility limits

### Configurable Defaults

- Aggregation window: `90` seconds
- Pickup radius to nearest van: `800` meters
- Destination clustering radius: `1200` meters
- Max pooling detour: `15` minutes
- Max pooling extra distance: `5` km
- Schedule compatibility window: `20` minutes
- Stale driver heartbeat threshold: `120` seconds
- Stale van alert threshold: `180` seconds

### Matching Decision Order

1. Try pooling into existing same-company trips first.
2. A trip is pool-eligible only if it has spare capacity, destination compatibility, pickup feasibility, schedule compatibility, and acceptable detour.
3. If no pool candidate qualifies, create a new trip with the best eligible van.
4. If no van qualifies, keep the ride pending and raise an admin-visible dispatch pressure alert.

### Default Matching Score

Lower score is better. The weighted score must be configurable.

#### Components and Default Weights

- Pickup distance score: `0.40`
- Destination similarity score: `0.30`
- Detour cost score: `0.20`
- Van readiness score: `0.10`

#### Normalization Guidance

- Pickup distance score is normalized against pickup radius
- Destination similarity score is normalized against destination clustering radius
- Detour cost score is normalized against max detour and max extra distance
- Van readiness score penalizes stale heartbeats, offline-like readiness, or near-maintenance conditions

## Scheduled Ride Subsystem

Scheduled rides are a dedicated subsystem and not just a delayed version of the immediate ride flow.

### Scheduled Ride States

- `scheduled_requested`
- `scheduled_queued`
- `matching_at_dispatch_window`

After assignment, the ride transitions into the normal active ride lifecycle.

### Dispatch Window Rules

- A background worker scans scheduled rides every minute
- Dispatch window opens 15 minutes before scheduled pickup time
- Matching reruns against live van availability and current demand
- If still unmatched 10 minutes before pickup, raise admin alert
- Notify employee and driver immediately on successful assignment
- If delayed or failed, emit operational alert and rider-facing status update

### Restart and Recovery Policy

On service startup:

- Rides in `requested`, `matching`, `scheduled_queued`, and `matching_at_dispatch_window` are scanned for recovery

#### Immediate ride recovery

- If ride age is less than or equal to `aggregation_window + 30 seconds`, re-enter matching
- Otherwise move to `failed_operational_issue`

#### Scheduled ride recovery

- If current time is still before dispatch window, keep queued
- If current time is inside dispatch window, resume matching
- If dispatch window expired beyond grace threshold without assignment, mark `failed_operational_issue` and raise admin alert

## Multi-Tenant Architecture

### Tenant Model

- Shared database
- All business entities are company-scoped
- JWT contains:
  - `user_id`
  - `role`
  - `company_id`
- Every backend query, websocket subscription, admin action, and AI context build must be tenant-filtered
- Cross-company visibility and actions are forbidden

### Tenant Rules by Role

#### Employee

- can only see own rides
- can only see same-company assignment context for those rides

#### Driver

- can only see assigned van and assigned trips in same company

#### Admin

- can see people, vans, rides, trips, alerts, and operational surfaces only inside same company

#### AI / Copilot

- must only receive same-company role-filtered context
- must never leak cross-company data in prompt context or output

### V1 Tenancy Approach

- enforce company scoping at the application layer
- keep schema company-scoped and query discipline strict
- optional future hardening can include database row-level security

## Realtime Architecture

The target architecture is WebSocket-first from Phase 1. SSE may remain as a fallback layer, but clients should be built around typed events, not around polling assumptions.

### Event Families

- `ride.updated`
- `trip.updated`
- `van.updated`
- `driver.updated`
- `alert.created`
- `alert.resolved`
- `notification.created`

### Realtime Targets

- GPS update cadence during active trip: every 5 seconds
- Rider/admin state freshness target: under 2 seconds after publish
- Admin dashboard alert freshness target: under 10 seconds

## OpenAI Copilot Purpose

Copilot features are advisory only. They explain, prioritize, and recommend. They do not make dispatch decisions.

### Employee Copilot

- explain current ride state
- explain ETA changes
- tell rider what to do next

### Driver Copilot

- explain next stop
- surface stale GPS issues
- suggest exception handling steps
- prioritize route execution actions

### Admin Copilot

- identify demand-supply imbalance
- recommend pre-positioning vans
- flag delayed or stale trips
- recommend reassignment opportunities

## Service Targets

These are internal v1 engineering targets.

- 95th percentile dispatch decision after aggregation close: under 10 seconds
- 95th percentile rider wait time in active service zone: under 8 minutes
- GPS update cadence on active trip: every 5 seconds
- Admin alert freshness: under 10 seconds
- Core API monthly uptime target: 99.5%

## Phased Roadmap

### Phase 1: Integrated Core Loop

- unify lifecycle state machines
- introduce WebSocket-first event model
- make matcher deterministic and config-driven
- keep employee, driver, and admin views consistent for the same ride/trip

### Phase 2: Dispatch Operations

- implement scheduled ride worker
- implement reassignment
- implement cancellations
- implement no-show handling
- implement admin alerting

### Phase 3: Operational Intelligence

- expand role copilots around operational questions
- add demand recommendations
- add delay and risk summaries

### Phase 4: Production Hardening

- audit trail
- analytics event completeness
- notification reliability
- tenant security hardening
- observability and SLO tracking

## Concrete Acceptance Scenarios

1. Given an employee creates an immediate ride, the ride enters `requested`, then `matching`, then either `matched` or a failure state according to matcher outcome.
2. Given a ride is `matched`, the driver app must show assigned pickup, van, and a clear action to begin approach. Triggering that action emits `ride.updated` and moves the ride to `driver_en_route`.
3. Given the driver reaches pickup threshold, the ride moves to `arrived_at_pickup` and the employee sees that update in realtime.
4. Given the rider boards, driver action moves the ride to `picked_up` and then `in_transit`. The admin dashboard reflects occupancy and active trip status.
5. Given a van is full and on an active trip, matcher excludes it from new pooling.
6. Given a van is on an active trip but still has spare capacity and detour remains below threshold, matcher may pool same-company demand into that trip.
7. Given a scheduled ride enters its dispatch window, the worker attempts assignment without user interaction and raises admin alert on failure.
8. Given backend restarts during aggregation, rides inside recovery threshold resume matching and stale pending rides beyond threshold move to `failed_operational_issue`.
9. Given a company A admin is connected, they never receive company B rides, vans, trips, alerts, or copilot context.
10. Given AI is unavailable, the system returns explicit fallback guidance without changing operational state.

## Assumptions and Defaults

- This document is for engineering and product execution
- Operational realism is prioritized over demo polish
- V1 remains company-scoped employee transport, not public consumer transport
- Matching constants and score weights must be configurable
- WebSocket-first architecture is mandatory from the beginning
- Tenant enforcement is application-layer in v1, with optional stronger database hardening later
