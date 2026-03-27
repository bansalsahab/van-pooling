# Agent Build Playbook

## Purpose

This file enables future agents to continue development with minimal ambiguity.

It defines:

- workstream ownership
- stage-by-stage implementation slices
- acceptance tests
- non-negotiable engineering rules

Use with `stages-roadmap.md`.

---

## Global Engineering Rules

1. Do not break tenant isolation. Every query/action/subscription is `company_id` scoped.
2. AI recommendations must be advisory-only. State transitions require system or authorized user action.
3. Preserve lifecycle state machine integrity. No hidden state shortcuts.
4. Every new operation must emit:
   - persisted audit event
   - live event (if user-visible)
   - notification when applicable
5. Every stage must include:
   - backend tests
   - frontend smoke checks
   - migration if schema changes

---

## Suggested Parallel Agent Allocation

### Agent A - Backend Core

Owns:

- `backend/app/services/*`
- `backend/app/api/v1/*`
- `backend/app/schemas/*`
- `backend/alembic/*`
- `backend/tests/*`

### Agent B - Frontend Product Surfaces

Owns:

- `frontend/src/pages/*`
- `frontend/src/components/*`
- `frontend/src/hooks/*`
- `frontend/src/lib/types.ts`
- `frontend/src/styles.css`

### Agent C - Analytics and Reporting

Owns:

- KPI aggregation services
- report APIs
- admin KPI/ROI views
- KPI tests

### Agent D - Reliability and DevOps Readiness

Owns:

- SLA monitoring logic
- reconnect/retry behavior
- runbooks in docs
- observability notes

---

## Stage Task Boards

## Stage 0 Board - ICP + KPI Baseline

### Backend Tasks

- Add KPI definitions and metric calculators
- Create API:
  - `GET /api/v1/admin/kpis?window=today|7d|30d`
- Ensure lifecycle events feed KPI counters

### Frontend Tasks

- Add KPI panel to admin overview
- Add timeframe selector

### Acceptance

- KPI endpoint returns stable values from live dataset
- Admin sees baseline KPI cards with no frontend hardcoding

---

## Stage 1 Board - ROI Dashboard

### Backend Tasks

- Add ROI aggregates:
  - occupancy trend
  - pooled ratio
  - deadhead trend
- Add export API:
  - `GET /api/v1/admin/reports/roi?window=30d&format=csv|json`

### Frontend Tasks

- ROI page section with trend cards
- export buttons

### Acceptance

- Admin can export 30-day ROI snapshot
- Trends render and are filterable by window

---

## Stage 2 Board - Reliability + SLA

### Backend Tasks

- SLA rule evaluator service
- alert creation for breaches
- stale stream detection metadata

### Frontend Tasks

- SLA alert queue panel
- incident timeline UI
- live connection quality indicators per role

### Acceptance

- Simulated SLA breach triggers admin alert within target freshness
- Incident timeline shows cause and resolution updates

---

## Stage 3 Board - Policy Engine

### Backend Tasks

- New policy models + migration
- policy evaluation in matcher
- policy rejection reason payload

### Frontend Tasks

- admin policy editor
- rider-facing policy rejection messaging

### Acceptance

- Out-of-policy requests are blocked with explicit reason
- Policy change applies without deployment

---

## Stage 4 Board - Enterprise Readiness

### Backend Tasks

- SSO integration scaffolding
- role matrix expansion
- audit export APIs

### Frontend Tasks

- enterprise auth entry UX
- role permission UI guard checks

### Acceptance

- enterprise role flows pass auth checks
- audit export download works

---

## Stage 5 Board - AI Decision Support

### Backend Tasks

- shift handoff summary endpoint
- recommendation endpoint with evidence traces
- recommendation confidence calibration

### Frontend Tasks

- handoff panel for admins
- recommendation cards with quick actions
- evidence popover/toggle

### Acceptance

- AI recommendation includes:
  - confidence
  - source signals
  - recommended actions
- Human confirmation required before state mutation

---

## Stage 6 Board - Adoption UX

### Backend Tasks

- optional onboarding state persistence

### Frontend Tasks

- onboarding flow by role
- first-action checklist
- simplify high-friction forms

### Acceptance

- First-time user can finish role-specific primary action in <= 5 minutes

---

## Verification Matrix Per Stage

1. `pytest backend/tests -q`
2. `npm run test` (frontend)
3. `npm run build` (frontend)
4. `python -m compileall backend/app backend/scripts`
5. Manual workflow:
   - employee ride request
   - driver execution
   - admin monitoring + alert/notification visibility

---

## Ready-to-Run Agent Prompt Template

Use this prompt for any future agent:

```
Implement Stage <N> from stages-roadmap.md using agent-build-playbook.md.
Respect tenant isolation and state-machine rules.
Deliver backend + frontend changes, tests, and migrations (if needed).
Run verification matrix and summarize results.
Do not hardcode demo logic where config/model can be used.
```
