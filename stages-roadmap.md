# Van Pooling - Stage Roadmap (Execution-Ready)

## Purpose

This document defines the next build stages for making Van Pooling enterprise-ready with measurable ROI, reliability, and AI-assisted operations.

Use this with:

- `projectidea.md` for core product/system truth
- `nextstep.md` for current implementation context
- `agent-build-playbook.md` for parallel execution handoff

---

## Stage 0 - Product Focus and Baseline Instrumentation

### Goal

Lock one ICP (ideal customer profile) and instrument the baseline so all later work is measured against business value.

### Scope

- Finalize ICP for V1:
  - Recommended: India tech parks/campuses with 300-3000 daily commuters and fixed peak windows
- Define success metrics:
  - `p95_wait_time_minutes`
  - `on_time_pickup_percent`
  - `seat_utilization_percent`
  - `deadhead_km_per_trip`
  - `dispatch_success_percent`
- Add metric events and stable IDs for rides/trips/alerts
- Add dashboard cards for baseline KPIs

### Deliverables

- `docs/icp.md`
- `docs/kpi-definitions.md`
- backend metric capture and API exposure
- admin KPI widgets

### Exit Criteria

- Every ride/trip transition emits metrics needed for KPI computation
- Admin can view current KPI snapshot without manual SQL

---

## Stage 1 - ROI and Operations Intelligence

### Goal

Show operational and financial value inside the admin product.

### Scope

- Build ROI dashboard:
  - cost per ride
  - cost per seat-km
  - occupancy trend by time-window
  - pooled vs non-pooled ratio
- Add trend windows (`today`, `7d`, `30d`)
- Add company-level export endpoint for reports (CSV/JSON)

### Deliverables

- analytics aggregation services
- admin ROI UI panel
- basic report export API

### Exit Criteria

- Admin can answer "Are we saving money and improving utilization?" from product screens

---

## Stage 2 - Reliability, SLA, and Incident Operations

### Goal

Make reliability operationally trustworthy for enterprise usage.

### Scope

- Offline-safe driver behavior:
  - location retry queue
  - buffered status events
- Realtime reliability:
  - websocket reconnect backoff strategy
  - event gap detection and recovery
- SLA monitoring:
  - breach detection for dispatch delay/wait-time/location freshness
  - SLA alert cards + resolution actions
- Incident runbook support:
  - standardized incident categories
  - admin timeline view

### Deliverables

- SLA service with alert creation/resolution
- reliability telemetry in admin UI
- incident timeline payload and view

### Exit Criteria

- SLA breach appears within target freshness
- Operator can identify incident cause and take action without log digging

---

## Stage 3 - Policy Engine and Commute Governance

### Goal

Support real-world enterprise commute rules.

### Scope

- Company policy model:
  - role/team-based ride priority
  - women safety windows
  - pickup/drop service zones
  - schedule cutoffs and cancellation windows
- Policy-aware matching:
  - enforce policy constraints before assignment
- Policy simulation endpoint:
  - "why rejected" reasoning for policy conflicts

### Deliverables

- policy config schema + APIs
- matcher policy checks
- admin policy management UI

### Exit Criteria

- Disallowed requests fail with explicit policy reason
- Admin can update policy rules without code edits

---

## Stage 4 - Enterprise Platform Readiness

### Goal

Meet baseline enterprise security and identity expectations.

### Scope

- SSO (SAML/OIDC) entry path for enterprise tenants
- SCIM-compatible user lifecycle sync hooks
- Expanded RBAC:
  - dispatcher, supervisor, viewer, support roles
- Audit export:
  - downloadable signed audit logs
- Tenant-hardening review:
  - no cross-tenant query/subscription leakage

### Deliverables

- auth integration adapters
- role permission matrix and guards
- export endpoints for audit/history

### Exit Criteria

- Enterprise admin can onboard users without manual account creation
- Security review passes tenant isolation checklist

---

## Stage 5 - AI Decision Support (Grounded and Actionable)

### Goal

Move AI from chat utility to operational decision assistant.

### Scope

- Shift handoff generator:
  - summarize unresolved alerts, high-risk trips, pending demand
- Dispatch recommendation engine:
  - suggest reassignment/pre-position actions with reasoning
- AI action confidence:
  - return confidence + evidence signals + assumptions
- Human-in-the-loop actions:
  - AI recommends only; human confirms state-changing operations

### Deliverables

- admin handoff summary endpoint/UI
- recommendation cards with "why this recommendation"
- traceable AI context snippets

### Exit Criteria

- AI output is auditable, explainable, and clearly non-autonomous

---

## Stage 6 - Adoption and UX Simplification

### Goal

Reduce onboarding time and operator friction.

### Scope

- Role-first onboarding walkthroughs
- Cleaner information hierarchy in all three dashboards
- Guided empty states and first-action prompts
- In-product operational checklist ("start shift", "close shift")

### Deliverables

- onboarding components
- UX consistency pass across employee/driver/admin
- interaction quality fixes (clickability, response clarity, map ergonomics)

### Exit Criteria

- New user can complete their first meaningful workflow in under 5 minutes

---

## Recommended Build Sequence

1. Stage 0
2. Stage 2
3. Stage 1
4. Stage 3
5. Stage 5
6. Stage 4
7. Stage 6

Reason: trust/reliability and measurement must come before expansion and enterprise scale features.

---

## Milestone Gates

- Gate A: KPI foundation complete (Stage 0)
- Gate B: Reliability and SLA confidence (Stage 2)
- Gate C: ROI proof in product (Stage 1)
- Gate D: Policy compliance support (Stage 3)
- Gate E: AI handoff and recommendation maturity (Stage 5)
- Gate F: Enterprise onboarding/security readiness (Stage 4)
- Gate G: Adoption polish (Stage 6)
