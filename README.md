# Van Pooling Platform

Full-stack van pooling platform for employees, drivers, and fleet operators. The app now includes a working React frontend and a FastAPI backend connected through role-based flows.

## Current scope

- React frontend with role-based employee, driver, and admin workspaces
- FastAPI backend with JWT authentication
- PostgreSQL/PostGIS schema for companies, users, vans, ride requests, trips, analytics, and notifications
- Employee booking for immediate or scheduled rides
- Smarter trip assignment that pools rides by destination proximity and pickup fit
- Driver endpoints for dashboard, active trip lookup, location updates, and status updates
- Admin endpoints and forms for dashboard metrics, vans, employees, drivers, and trips
- Google Maps-powered route previews and live map surfaces across employee, driver, and admin views
- OpenAI-powered copilot briefings and role-aware operator Q&A
- Grounded AI copilot signals: health score, confidence level, evidence signals, and one-click quick prompts
- Docker Compose stack for frontend, backend, and PostGIS

## Product direction

This platform is for corporate campuses or business parks that want to replace static shuttles with demand-responsive pooling.

- Employees should be able to request immediate or scheduled rides
- Drivers should see their assigned van and current workload
- Admins should track readiness, demand, and fleet availability
- Matching, routing, realtime updates, and frontend apps are the next phases

## Quick start

1. Start the stack.

```bash
docker-compose up --build
```

2. Load demo data for test users and vans.

```bash
docker-compose exec backend python scripts/seed_data.py
```

3. Open the apps.

- Frontend: `http://localhost:5173`
- Swagger UI: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

## API keys for the upgraded experience

- Set `OPENAI_API_KEY` to enable role-aware copilot briefings and Q&A.
- Set `GOOGLE_MAPS_API_KEY` for backend routing and geocoding.
- Set `GOOGLE_MAPS_BROWSER_API_KEY` for the frontend live maps. In development you can reuse the same key if your Google Cloud restrictions allow it.
- Optionally set `GOOGLE_MAPS_MAP_ID` to apply a custom Google map style.

## Local run without Docker

If Docker is unavailable, the backend now defaults to a local SQLite database.

1. Create a virtual environment and install backend packages.
2. Run [run-local.ps1](C:\Users\Parth bansal\Desktop\van-pooling-platform\run-local.ps1)
3. Stop services with [stop-local.ps1](C:\Users\Parth bansal\Desktop\van-pooling-platform\stop-local.ps1)

## Database migrations (Alembic)

The backend now uses Alembic as the canonical schema workflow.

- Startup auto-upgrades schema when `AUTO_RUN_MIGRATIONS=true` (default).
- Manual migration command:

```powershell
cd backend
..\.venv\Scripts\python.exe -m scripts.migrate
```

- Create a new revision after model changes:

```powershell
cd backend
..\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "describe_change"
```

- Apply pending revisions:

```powershell
cd backend
..\.venv\Scripts\python.exe -m alembic upgrade head
```

- Use a temporary database URL during migration generation/testing:

```powershell
cd backend
..\.venv\Scripts\python.exe -m alembic -x db_url=sqlite:///./temp_migration.db upgrade head
```

## API summary

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

`/auth/register` can bootstrap a new tenant admin when `company_name` is provided for a new `company_domain`.

### Employee

- Sign in and request a ride
- View live assignment details and recent ride history
- `POST /api/v1/rides/request`
- `GET /api/v1/rides/history`
- `GET /api/v1/rides/active`

### Driver

- Use the frontend to update van status and location
- Start trips, pick up passengers, and complete dropoffs
- `GET /api/v1/driver/dashboard`
- `GET /api/v1/driver/trips/active`
- `POST /api/v1/driver/location`
- `POST /api/v1/driver/status`
- `POST /api/v1/driver/trips/{trip_id}/start`
- `POST /api/v1/driver/trips/{trip_id}/pickup/{ride_request_id}`
- `POST /api/v1/driver/trips/{trip_id}/dropoff/{ride_request_id}`
- `POST /api/v1/driver/trips/{trip_id}/complete`

### Admin

- Monitor fleet, people, and trip flow from the operations UI
- Create new employees, drivers, admins, and vans from the frontend
- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/kpis?window=today|7d|30d`
- `GET /api/v1/admin/sla`
- `GET /api/v1/admin/incidents?include_resolved=true&limit=60`
- `GET /api/v1/admin/vans`
- `GET /api/v1/admin/employees`
- `GET /api/v1/admin/drivers`
- `GET /api/v1/admin/trips`
- `POST /api/v1/admin/users`
- `POST /api/v1/admin/vans`

## Database

`database/init/` creates the full operational schema:

- `companies`
- `users`
- `vans`
- `ride_requests`
- `trips`
- `trip_passengers`
- `analytics_events`
- `notifications`

Sample demo data is available in `database/seeds/` and can be loaded with the seed script above.

## Seeded users

- Admin: `admin@techcorp.com`
- Driver: `driver1@techcorp.com`
- Employee: `john.doe@techcorp.com`
- Password: `password123`

## Next build targets

1. Add websocket transport on top of the current SSE live stream for lower-latency fleet updates.
2. Expand rider and admin notification delivery using the existing notification schema.
3. Add automated tests across backend routes and frontend role workflows.
4. Add richer admin dispatch controls such as manual reassignment and service-zone editing.

## Execution handoff docs

- [stages-roadmap.md](C:\Users\Parth bansal\Desktop\van-pooling-platform\stages-roadmap.md)
- [agent-build-playbook.md](C:\Users\Parth bansal\Desktop\van-pooling-platform\agent-build-playbook.md)
- [docs/icp.md](C:\Users\Parth bansal\Desktop\van-pooling-platform\docs\icp.md)
- [docs/kpi-definitions.md](C:\Users\Parth bansal\Desktop\van-pooling-platform\docs\kpi-definitions.md)
