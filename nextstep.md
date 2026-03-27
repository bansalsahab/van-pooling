# Next Step Continuation Guide

## Purpose

This file is the practical handoff for continuing the van pooling platform without losing context.

`projectidea.md` is the product and system blueprint.

`nextstep.md` is the execution guide:

- what is already implemented
- what is still incomplete
- what to build next
- where in the codebase each concern lives
- how to verify progress safely
- what to avoid so the project does not drift

## Current Snapshot

As of this handoff:

- Latest known pushed baseline: `e9be464`
- Repo: `https://github.com/bansalsahab/van-pooling`
- App shape: working prototype upgraded into an early operations platform
- Local stack: FastAPI backend + React/Vite frontend + local SQLite for development
- Maps status: Google Maps geocoding and route preview are working again
- AI status: OpenAI copilot is integrated and should remain advisory only

## What Is Working Right Now

### Core user flows

- Role-based login entry for employee, driver, and admin
- JWT auth with role and `company_id`
- Employee ride creation for immediate and scheduled rides
- Employee ride cancellation before pickup
- Driver trip execution flow
- Driver location updates
- Driver no-show action
- Admin monitoring of trips, vans, and demand
- Admin reassignment and cancellation actions

### Platform systems

- Startup recovery for pending rides
- Background dispatch worker loop
- Google Maps geocoding
- Google Maps route preview
- OpenAI role-based copilots
- WebSocket-first live transport with SSE fallback
- Realtime live snapshots for dashboards
- Company-scoped data access in auth and dashboards

### Frontend experience

- Employee, driver, and admin dashboards
- Live map rendering
- Copilot panels
- Realtime connection state handling
- Role-selectable auth page

## What Is Still Incomplete

These are the main unfinished areas even after the recent upgrades:

- Live transport is WebSocket-first, but still mostly snapshot-based rather than fully event-driven
- Dispatch actions do not yet have a complete audit trail
- Notification handling exists in service form, but is not yet a full user-facing notification center
- Matching needs stronger observability, clearer scoring explanation, and more explicit config ownership
- Scheduled rides exist, but the operator experience around them still needs polishing
- Automated backend test coverage is still too light
- There is no proper migration workflow yet
- Local development still relies on SQLite; production-grade Postgres/PostGIS hardening is still ahead

## The Most Important Rule For Continuing

Do not treat this as three separate apps.

The system only makes sense if every change is validated across:

- employee view
- driver view
- admin view
- backend lifecycle state
- realtime payload

If one role changes and the others are not updated, the product will drift again.

## Recommended Build Order

If continuing the project now, this is the strongest order of work.

### 1. Convert realtime from snapshot-only thinking to typed operational events

This is the best next step.

Right now the transport exists, but the frontend still mostly consumes full snapshots. That works, but it will become harder to scale and reason about as more dispatch actions are added.

Target event families:

- `ride.updated`
- `trip.updated`
- `van.updated`
- `driver.updated`
- `alert.created`
- `alert.resolved`
- `notification.created`
- `snapshot.updated` as compatibility fallback

#### Backend files to touch

- `backend/app/api/v1/live.py`
- `backend/app/services/live_service.py`
- `backend/app/services/lifecycle_service.py`
- `backend/app/services/dispatch_ops_service.py`
- `backend/app/services/notification_service.py`

#### Frontend files to touch

- `frontend/src/hooks/useLiveStream.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/pages/AdminPage.tsx`
- `frontend/src/pages/DriverPage.tsx`
- `frontend/src/pages/EmployeePage.tsx`

#### Acceptance criteria

- A driver action emits a typed event, not just a changed snapshot
- Admin UI can react to `alert.created` and `alert.resolved`
- Employee UI can react to ride lifecycle changes without depending only on polling-style snapshots
- Old snapshot transport still works during transition

### 2. Add a real audit trail for dispatch and lifecycle actions

This is the second most important step.

Right now many operations happen, but there is not yet a complete historical ledger for:

- who changed state
- when it changed
- what the previous state was
- why the action happened

This becomes essential for debugging, admin trust, and later analytics.

#### Suggested model

Create a persisted event table such as `dispatch_events` or `operation_events`.

Each record should include:

- `id`
- `company_id`
- `ride_id` or `trip_id`
- `actor_type`
- `actor_user_id`
- `event_type`
- `from_state`
- `to_state`
- `reason`
- `metadata_json`
- `created_at`

#### Backend files likely involved

- `backend/app/models/`
- `backend/app/schemas/`
- `backend/app/services/lifecycle_service.py`
- `backend/app/services/dispatch_ops_service.py`
- `backend/app/services/notification_service.py`
- `database/init/`

#### Acceptance criteria

- Reassign, cancel, no-show, matched, pickup, dropoff, and completion actions all create audit entries
- Admin can inspect recent operational history for a trip
- AI context can later summarize real events rather than inferred history

### 3. Build a visible notification center instead of service-only notifications

The backend now has notification-oriented logic, but the user-facing side is still thin.

Add a persisted notification surface for each role.

#### Suggested behavior

- Employee sees assignment, driver arrival, delay, cancellation, completion
- Driver sees assignment, route change, stale GPS warning, admin reassignment
- Admin sees pressure alerts, stale vans, no-show events, delayed scheduled rides

#### Backend targets

- add read/unread notification persistence
- expose list and mark-read APIs
- include notification deltas in live events

#### Frontend targets

- add a notification drawer or panel in each workspace
- show unread count
- allow acknowledgment or mark-read

### 4. Harden matching and dispatch scoring

The matching engine is much better than before, but this is still a critical area.

It needs:

- explicit config ownership
- clearer debug visibility
- stronger tests

#### What to improve

- move all thresholds and weights behind config access patterns
- expose why a van or trip was chosen
- expose why candidates were rejected
- add service-zone awareness if not already enforced everywhere
- ensure active trip pooling logic is transparent

#### Main file

- `backend/app/services/ride_service.py`

#### Supporting files

- `backend/app/core/config.py`
- `backend/app/services/routing_service.py`
- `backend/app/services/maps_service.py`
- `backend/app/services/dashboard_service.py`

#### Acceptance criteria

- Every match decision is explainable from logs or stored metadata
- Full vans on active trips are rejected
- Partially occupied active trips may still pool if detour remains valid
- Scheduled rides use the same matcher through the dispatch window path

### 5. Strengthen scheduled ride operations

Scheduled rides exist now, but the operator and rider experience around them is still not complete enough.

#### What to add

- clearer scheduled ride list for admin
- countdown to dispatch window
- pre-dispatch alerting
- visible assignment timing
- rider-facing delay explanation
- driver-side visibility for upcoming scheduled workload

#### Main files

- `backend/app/services/dispatch_worker.py`
- `backend/app/services/ride_service.py`
- `backend/app/services/dashboard_service.py`
- `frontend/src/pages/AdminPage.tsx`
- `frontend/src/pages/DriverPage.tsx`
- `frontend/src/pages/EmployeePage.tsx`

#### Acceptance criteria

- A scheduled ride becomes visible before dispatch
- Admin can see whether it is queued, matching, assigned, or at risk
- Driver can see upcoming scheduled work before active pickup begins
- Employee receives timely assignment or failure messaging

### 6. Add a real test suite before deeper features

This project is now large enough that manual-only verification will start slowing progress.

The next serious code push should add backend and frontend smoke coverage around the critical loop.

#### Minimum backend coverage

- auth login
- immediate ride request lifecycle
- scheduled ride dispatch window activation
- driver pickup/dropoff transitions
- admin reassignment
- no-show
- tenant isolation
- maps endpoint success/fallback behavior

#### Minimum frontend coverage

- auth role selection
- live stream fallback behavior
- admin alert rendering
- employee cancellation flow

### 7. Add a migration strategy before heavy schema growth

This is easy to ignore and expensive to fix later.

Right now schema evolution is still lightweight. Before adding more event tables, notification tables, or audit entities, add a migration workflow.

Recommended direction:

- add Alembic for backend schema migrations
- keep local SQLite acceptable for dev if needed
- treat Postgres/PostGIS as the target production datastore

Without this, every schema change will risk local drift and confusion.

## Detailed Status By Subsystem

### Authentication and tenancy

Status: usable

Already present:

- JWT auth
- role-aware routing
- company scoping in token

Still needed:

- stronger tenant enforcement review across every admin and live endpoint
- tenant-specific tests

Main files:

- `backend/app/api/deps.py`
- `backend/app/core/security.py`
- `backend/app/services/auth_service.py`

### Ride lifecycle and dispatch

Status: active foundation in place

Already present:

- lifecycle states added
- startup recovery
- dispatch worker
- admin operations
- no-show handling

Still needed:

- broader test coverage
- more complete event history
- richer alert policies

Main files:

- `backend/app/services/ride_service.py`
- `backend/app/services/lifecycle_service.py`
- `backend/app/services/dispatch_worker.py`
- `backend/app/services/dispatch_ops_service.py`

### Realtime

Status: transport upgraded, semantics still partial

Already present:

- WebSocket-first connection
- SSE fallback
- live snapshots

Still needed:

- typed events
- event reducer/store strategy on frontend
- more efficient role-targeted updates

Main files:

- `backend/app/api/v1/live.py`
- `backend/app/services/live_service.py`
- `frontend/src/hooks/useLiveStream.ts`

### Maps and routing

Status: working

Already present:

- Google Maps backend geocoding
- Google route preview
- frontend live map components
- root `.env` loading fixes

Still needed:

- stronger route usage inside dispatch explanations
- more visible route freshness and map error messaging

Main files:

- `backend/app/services/maps_service.py`
- `backend/app/services/routing_service.py`
- `frontend/src/components/LiveMap.tsx`
- `frontend/src/lib/googleMaps.ts`
- `frontend/vite.config.ts`
- `frontend/vite.config.js`

### AI copilot

Status: integrated but still early-stage operationally

Already present:

- OpenAI-backed role-specific brief/Q&A
- fallback behavior when AI is unavailable

Still needed:

- better grounding in alert history and dispatch events
- stronger admin recommendations
- clearer driver action suggestions tied to real exceptions

Main files:

- `backend/app/api/v1/ai.py`
- `backend/app/services/ai_service.py`
- `backend/app/services/openai_service.py`
- `frontend/src/components/CopilotPanel.tsx`

## Most Important Files To Understand Before Editing

If picking the project back up after a break, read these first.

### Backend core

- `backend/app/main.py`
- `backend/app/core/config.py`
- `backend/app/api/v1/router.py`
- `backend/app/database.py`

### Backend behavior

- `backend/app/services/ride_service.py`
- `backend/app/services/lifecycle_service.py`
- `backend/app/services/dispatch_worker.py`
- `backend/app/services/dispatch_ops_service.py`
- `backend/app/services/live_service.py`
- `backend/app/services/dashboard_service.py`
- `backend/app/services/maps_service.py`
- `backend/app/services/ai_service.py`

### Backend routes

- `backend/app/api/v1/rides.py`
- `backend/app/api/v1/driver.py`
- `backend/app/api/v1/admin.py`
- `backend/app/api/v1/live.py`
- `backend/app/api/v1/maps.py`

### Frontend core

- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/hooks/useLiveStream.ts`
- `frontend/src/pages/EmployeePage.tsx`
- `frontend/src/pages/DriverPage.tsx`
- `frontend/src/pages/AdminPage.tsx`
- `frontend/src/pages/AuthPage.tsx`
- `frontend/src/styles.css`

## Local Runbook

### Preferred startup

Use the existing scripts first:

- `run-local.ps1`
- `stop-local.ps1`

### Manual startup if needed

Backend:

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

### Expected local URLs

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:5173`
- API docs: `http://127.0.0.1:8000/docs`

## Environment Notes

These details matter and are easy to forget.

- The real `.env` is at the repo root
- Backend config is set up to read the root `.env`
- Vite is configured to read env from the parent directory
- Google Maps backend needs `GOOGLE_MAPS_API_KEY`
- Google Maps frontend needs `GOOGLE_MAPS_BROWSER_API_KEY` or `VITE_GOOGLE_MAPS_API_KEY`
- OpenAI needs `OPENAI_API_KEY`

If maps suddenly stop working again:

1. check the root `.env`
2. restart both backend and frontend
3. confirm Google APIs are enabled in the Google Cloud project
4. allow a few minutes for propagation if settings were just changed

## Safe Verification Checklist

Before pushing any future change, verify at least this:

### Backend

```powershell
.\.venv\Scripts\python.exe -m compileall backend\app
```

### Frontend

```powershell
cd frontend
npm run build
```

### Manual smoke flow

1. Sign in as admin and confirm dashboard loads
2. Sign in as employee and create a ride
3. Sign in as driver and confirm assigned trip or live trip visibility
4. Confirm admin sees the same trip state
5. Confirm live updates reach all three roles
6. Confirm maps render and route preview uses Google
7. Confirm copilot gives a grounded answer instead of raw fallback noise

## Known Gotchas

### 1. Root env handling matters

Do not move env handling back into per-folder assumptions unless you update both backend and frontend config.

### 2. `.gitignore` must stay correct

Never push:

- `.env`
- `tmp-logs/`
- `run-logs/`
- local databases
- `node_modules/`
- `dist/`

### 3. Seed data is still demo-oriented

The seed path is useful for local testing, but it is still demo bootstrap data.

Reference:

- `backend/scripts/seed_data.py`

### 4. Live transport is not fully normalized yet

The system uses WebSocket-first transport now, but most updates still behave like snapshot refreshes.

Do not assume the event model is finished.

### 5. In-process worker is good for local dev, not final production

`dispatch_worker_loop` currently runs inside the FastAPI process.

That is okay for now, but long term this should move to a more production-grade worker setup.

### 6. There is still no full migration workflow

If adding more tables, create the migration strategy first or accept local DB resets during development.

## Suggested Immediate Milestone

If only one milestone is taken next, make it this:

### Milestone: Realtime Operations Layer

Build typed events, audit persistence, and visible notifications together.

Why this milestone first:

- it improves admin trust
- it makes driver and employee screens clearer
- it gives AI better grounding
- it makes future debugging much easier
- it reduces hidden coupling between dashboards

### Deliverables for that milestone

- typed WS events
- persisted dispatch event log
- notification persistence
- admin alert history
- basic UI notification surface

### Done means

- every operational action has a stored history row
- live updates include typed event payloads
- users can see what changed and why
- admin can inspect trip history without guessing

## Suggested Session Plan

If the project continues across multiple coding sessions, this is a good split.

### Session 1

- add typed live events
- keep snapshot compatibility

### Session 2

- add audit/event persistence
- surface event history in admin

### Session 3

- add notification center
- wire employee and driver notification UX

### Session 4

- harden scheduled ride operator flow
- improve dispatch alerts and matching explanations

### Session 5

- add backend tests for lifecycle, reassignment, no-show, tenant isolation
- add frontend smoke coverage

### Session 6

- add migration workflow
- start production hardening and deployment prep

## Final Guidance

When continuing from here:

- use `projectidea.md` for product truth
- use `nextstep.md` for execution order
- keep backend lifecycle, realtime payloads, and all three role dashboards aligned
- avoid one-off UI changes that are not backed by lifecycle and service logic
- prioritize typed events, audit history, notifications, and tests before adding flashy new features

If there is any doubt about what to do next, start with:

1. typed realtime events
2. audit trail
3. notification center

That path will unlock the cleanest continuation of the platform.
