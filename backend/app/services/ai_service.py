"""Role-aware operational insights."""
import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ride_request import RideRequestStatus
from app.models.trip import TripStatus
from app.models.user import User, UserRole
from app.models.van import VanStatus
from app.schemas.ai import AICopilotBrief, AICopilotReply, AIInsight
from app.services.audit_service import (
    list_company_dispatch_events,
    list_ride_dispatch_events,
    list_trip_dispatch_events,
)
from app.services.dashboard_service import (
    get_admin_dashboard,
    get_driver_dashboard,
    list_company_trips,
    list_company_vans,
)
from app.services.admin_service import list_company_drivers
from app.services.notification_service import list_admin_alerts
from app.services.openai_service import create_structured_output
from app.services.ride_service import get_active_ride


def build_role_insights(db: Session, current_user: User) -> list[AIInsight]:
    """Return role-specific insight cards for the signed-in user."""
    if current_user.role == UserRole.EMPLOYEE:
        return build_employee_insights(db, current_user)
    if current_user.role == UserRole.DRIVER:
        return build_driver_insights(db, current_user)
    return build_admin_insights(db, current_user)


def build_role_copilot_brief(db: Session, current_user: User) -> AICopilotBrief:
    """Return a richer copilot briefing, preferring OpenAI when configured."""
    insights = build_role_insights(db, current_user)
    signal_pack = _build_copilot_signal_pack(db, current_user, insights)
    fallback = _fallback_brief(current_user, insights, signal_pack)
    context = _build_role_context(db, current_user, insights, signal_pack)
    structured = create_structured_output(
        cache_key=f"brief::{current_user.id}::{current_user.role.value}",
        system_prompt=(
            "You are an operations copilot for a corporate van pooling platform. "
            "Use only the provided JSON context. Do not invent riders, incidents, "
            "traffic events, ETAs, or operational constraints that are not present. "
            "Write concise, decision-ready output for the current role."
        ),
        user_prompt=(
            "Return a role-aware JSON briefing for the signed-in user.\n"
            "Context JSON:\n"
            f"{json.dumps(context, separators=(',', ':'), default=str)}"
        ),
        schema_name="vanpool_copilot_brief",
        schema={
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "headline": {"type": "string"},
                "summary": {"type": "string"},
                "urgency": {"type": "string", "enum": ["low", "medium", "high"]},
                "priorities": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 4,
                },
                "recommended_actions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 5,
                },
                "operational_notes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 5,
                },
                "rider_message": {
                    "type": ["string", "null"],
                },
            },
            "required": [
                "headline",
                "summary",
                "urgency",
                "priorities",
                "recommended_actions",
                "operational_notes",
                "rider_message",
            ],
        },
    )
    if not structured:
        return fallback

    return AICopilotBrief(
        headline=structured["headline"],
        summary=structured["summary"],
        urgency=structured["urgency"],
        confidence=signal_pack["confidence"],
        health_score=signal_pack["health_score"],
        priorities=structured["priorities"],
        recommended_actions=structured["recommended_actions"],
        operational_notes=structured["operational_notes"],
        source_signals=signal_pack["source_signals"],
        quick_prompts=signal_pack["quick_prompts"],
        rider_message=structured["rider_message"],
        generated_at=datetime.utcnow(),
        generated_by="openai",
        model=context.get("openai_model") or settings.OPENAI_MODEL,
    )


def answer_role_copilot_question(
    db: Session,
    current_user: User,
    question: str,
) -> AICopilotReply:
    """Answer a role-specific question using current platform state."""
    insights = build_role_insights(db, current_user)
    signal_pack = _build_copilot_signal_pack(db, current_user, insights)
    context = _build_role_context(db, current_user, insights, signal_pack)
    fallback = _fallback_question_reply(current_user, question, signal_pack)
    structured = create_structured_output(
        cache_key=f"ask::{current_user.id}::{question.strip().lower()}",
        system_prompt=(
            "You are an operations copilot for a corporate van pooling platform. "
            "Answer only from the provided platform context. If the user asks for "
            "something the context cannot support, say so briefly and suggest the "
            "next best action."
        ),
        user_prompt=(
            f"Question: {question.strip()}\n"
            "Context JSON:\n"
            f"{json.dumps(context, separators=(',', ':'), default=str)}"
        ),
        schema_name="vanpool_copilot_answer",
        schema={
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "answer": {"type": "string"},
                "action_items": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 5,
                },
                "caution": {"type": ["string", "null"]},
            },
            "required": ["answer", "action_items", "caution"],
        },
    )
    if not structured:
        return fallback

    return AICopilotReply(
        answer=structured["answer"],
        action_items=structured["action_items"],
        caution=structured["caution"],
        source_signals=signal_pack["source_signals"],
        generated_at=datetime.utcnow(),
        generated_by="openai",
        model=context.get("openai_model"),
    )


def build_employee_insights(db: Session, current_user: User) -> list[AIInsight]:
    """Suggest next-best actions for an employee rider."""
    ride = get_active_ride(db, current_user)
    if ride is None:
        return [
            AIInsight(
                title="Commute assistant ready",
                summary="Request a pooled ride to let the dispatcher match you with the nearest suitable van.",
                priority="normal",
                recommended_actions=[
                    "Use live coordinates for both pickup and destination.",
                    "Schedule rides ahead of peak office ingress times.",
                ],
                signals=["No active ride found", "Realtime tracking will appear after booking"],
            )
        ]

    signals = [f"Ride status: {ride.status.replace('_', ' ')}"]
    if ride.van_license_plate:
        signals.append(f"Van assigned: {ride.van_license_plate}")
    if ride.estimated_wait_minutes is not None:
        signals.append(f"Estimated wait: {ride.estimated_wait_minutes} min")

    if ride.status in {
        RideRequestStatus.REQUESTED.value,
        RideRequestStatus.MATCHING.value,
        RideRequestStatus.MATCHED.value,
        RideRequestStatus.SCHEDULED_REQUESTED.value,
        RideRequestStatus.SCHEDULED_QUEUED.value,
        RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW.value,
    }:
        return [
            AIInsight(
                title="Pooling in progress",
                summary="The system is still optimizing your match window and may merge your request with a nearby trip.",
                priority="high" if ride.estimated_wait_minutes and ride.estimated_wait_minutes > 8 else "normal",
                recommended_actions=[
                    "Keep notifications enabled so you catch the van assignment instantly.",
                    "Stay near the pickup point once the driver is assigned.",
                ],
                signals=signals,
            )
        ]

    if ride.status in {
        RideRequestStatus.DRIVER_EN_ROUTE.value,
        RideRequestStatus.ARRIVED_AT_PICKUP.value,
    }:
        freshness = (
            "Van location is live."
            if ride.van_last_location_update
            and ride.van_last_location_update >= datetime.utcnow() - timedelta(minutes=2)
            else "Waiting for a fresh driver location ping."
        )
        return [
            AIInsight(
                title="Driver is on the way",
                summary="Your assigned van is active, and the live location feed is tracking the latest approach toward the pickup point.",
                priority="high",
                recommended_actions=[
                    "Move to the pickup curb a few minutes before arrival.",
                    "Verify the license plate before boarding.",
                ],
                signals=[*signals, freshness],
            )
        ]

    return [
        AIInsight(
            title="Ride is in motion",
            summary="Your trip is underway and the platform will keep syncing driver updates until drop-off is complete.",
            priority="normal",
            recommended_actions=[
                "Watch the live ride card for drop-off progress.",
                "Share the ETA with teammates if they are joining the same commute.",
            ],
            signals=signals,
        )
    ]


def build_driver_insights(db: Session, current_user: User) -> list[AIInsight]:
    """Suggest next-best actions for a driver."""
    dashboard = get_driver_dashboard(db, current_user)
    van = dashboard.van
    trip = dashboard.active_trip
    insights: list[AIInsight] = []

    if van is None:
        return [
            AIInsight(
                title="Van assignment needed",
                summary="You are signed in as a driver but there is no vehicle assigned yet.",
                priority="high",
                recommended_actions=[
                    "Ask dispatch to assign a van before starting operations.",
                    "Stay online so the admin console can see you are available.",
                ],
                signals=["No van linked to this driver profile"],
            )
        ]

    stale_location = (
        van.last_location_update is None
        or van.last_location_update
        < datetime.utcnow() - timedelta(seconds=settings.VAN_STALE_ALERT_SECONDS)
    )
    if stale_location:
        insights.append(
            AIInsight(
                title="Refresh live location",
                summary="Your van's location feed looks stale, so riders and admins may not see accurate progress.",
                priority="high",
                recommended_actions=[
                    "Enable continuous location sharing from this device.",
                    "Push one manual location update if GPS permission is blocked.",
                ],
                signals=[
                    f"Van status: {van.status}",
                    "Last location update older than 3 minutes"
                    if van.last_location_update
                    else "No location update recorded yet",
                ],
            )
        )

    if trip is None:
        insights.append(
            AIInsight(
                title="Stand by for dispatch",
                summary="You are ready for assignment. Keep the van available and location sharing on so the matcher can use you first.",
                priority="normal",
                recommended_actions=[
                    "Set status to available when the van is road-ready.",
                    "Stay near expected pickup clusters during commute peaks.",
                ],
                signals=[f"Vehicle readiness: {van.status}"],
            )
        )
        return insights

    pending_pickups = [
        passenger
        for passenger in trip.passengers
        if passenger.status in {"assigned", "notified"}
    ]
    if trip.status in {TripStatus.PLANNED.value, TripStatus.DISPATCH_READY.value}:
        insights.append(
            AIInsight(
                title="Trip ready to launch",
                summary="Passengers are assigned and the route is ready to move from planned to active.",
                priority="high",
                recommended_actions=[
                    "Start the trip when you begin rolling toward the first pickup.",
                    "Keep live sharing on so rider ETAs stay current.",
                ],
                signals=[
                    f"Passengers queued: {trip.passenger_count}",
                    f"Waiting pickups: {len(pending_pickups)}",
                ],
            )
        )
    else:
        insights.append(
            AIInsight(
                title="Active route in progress",
                summary="Continue working through pickups and drop-offs in sequence to keep occupancy and ETA accurate.",
                priority="normal",
                recommended_actions=[
                    "Mark pickups and drop-offs immediately after each stop.",
                    "Complete the trip once all riders are dropped off.",
                ],
                signals=[
                    f"Trip status: {trip.status}",
                    f"Passengers onboard or assigned: {trip.passenger_count}",
                ],
            )
        )

    return insights


def build_admin_insights(db: Session, current_user: User) -> list[AIInsight]:
    """Suggest next-best actions for a fleet admin."""
    dashboard = get_admin_dashboard(db, current_user.company_id, current_user.id)
    vans = list_company_vans(db, current_user.company_id)
    trips = list_company_trips(db, current_user.company_id)
    alerts = list_admin_alerts(db, current_user)
    insights: list[AIInsight] = []

    if alerts:
        highest = alerts[0]
        insights.append(
            AIInsight(
                title="Operational alerts need action",
                summary=highest.message,
                priority="high" if highest.severity == "high" else "normal",
                recommended_actions=[
                    "Review the alert queue and resolve stale or already-addressed items.",
                    "Reassign trips or contact drivers if the alert points to service degradation.",
                ],
                signals=[
                    f"Open alerts: {len(alerts)}",
                    highest.title or "Operational alert",
                ],
            )
        )

    if dashboard.pending_requests > dashboard.available_vans:
        insights.append(
            AIInsight(
                title="Demand is outrunning supply",
                summary="Pending requests currently exceed the number of available vans, so assignment delays will grow unless capacity is released.",
                priority="high",
                recommended_actions=[
                    "Set idle vans to available or reassign drivers to active pickup zones.",
                    "Create standby trips before the next demand wave hits.",
                ],
                signals=[
                    f"Pending requests: {dashboard.pending_requests}",
                    f"Available vans: {dashboard.available_vans}",
                ],
            )
        )

    stale_vans = [
        van
        for van in vans
        if van.status in {VanStatus.AVAILABLE.value, VanStatus.ON_TRIP.value}
        and (
            van.last_location_update is None
            or van.last_location_update
            < datetime.utcnow() - timedelta(seconds=settings.VAN_STALE_ALERT_SECONDS)
        )
    ]
    if stale_vans:
        insights.append(
            AIInsight(
                title="Location coverage gap",
                summary="Some fleet vehicles have stale GPS signals, which weakens rider tracking and dispatch confidence.",
                priority="high",
                recommended_actions=[
                    "Ask affected drivers to re-enable location sharing.",
                    "Use the fleet board to spot vans with the oldest last-seen timestamps.",
                ],
                signals=[
                    f"Stale live feeds: {len(stale_vans)}",
                    ", ".join(van.license_plate for van in stale_vans[:3]),
                ],
            )
        )

    planned_trips = [
        trip
        for trip in trips
        if trip.status in {TripStatus.PLANNED.value, TripStatus.DISPATCH_READY.value}
    ]
    if planned_trips:
        insights.append(
            AIInsight(
                title="Trips waiting to start",
                summary="Some trips are fully assigned but still in planned state, so riders may be waiting on driver action.",
                priority="normal",
                recommended_actions=[
                    "Prompt drivers to start trips as they leave the depot or pickup area.",
                    "Use live van positions to confirm which drivers are already moving.",
                ],
                signals=[
                    f"Planned trips: {len(planned_trips)}",
                    f"Active trips: {dashboard.active_trips}",
                ],
            )
        )

    if not insights:
        insights.append(
            AIInsight(
                title="Network is stable",
                summary="Supply, trip activity, and live location coverage look healthy right now.",
                priority="normal",
                recommended_actions=[
                    "Keep watching live feed quality during the next commute spike.",
                    "Use this stable window to stage vans for upcoming demand.",
                ],
                signals=[
                    f"Active trips: {dashboard.active_trips}",
                    f"Fleet online: {dashboard.active_vans + dashboard.available_vans}",
                ],
            )
        )

    return insights[:3]


def _build_role_context(
    db: Session,
    current_user: User,
    insights: list[AIInsight],
    signal_pack: dict[str, Any],
) -> dict:
    if current_user.role == UserRole.EMPLOYEE:
        active_ride = get_active_ride(db, current_user)
        return {
            "role": current_user.role.value,
            "user_name": current_user.name,
            "timestamp": datetime.utcnow().isoformat(),
            "company_name": current_user.company.name if current_user.company else None,
            "active_ride": active_ride.model_dump(mode="json") if active_ride else None,
            "recent_events": [
                item.model_dump(mode="json")
                for item in (
                    list_ride_dispatch_events(db, current_user.company_id, active_ride.id, limit=10)
                    if active_ride
                    else []
                )
            ],
            "insights": [item.model_dump(mode="json") for item in insights],
            "copilot_health": signal_pack,
            "openai_model": settings.OPENAI_MODEL,
        }

    if current_user.role == UserRole.DRIVER:
        dashboard = get_driver_dashboard(db, current_user)
        active_trip = dashboard.active_trip
        return {
            "role": current_user.role.value,
            "user_name": current_user.name,
            "timestamp": datetime.utcnow().isoformat(),
            "company_name": current_user.company.name if current_user.company else None,
            "dashboard": dashboard.model_dump(mode="json"),
            "recent_events": [
                item.model_dump(mode="json")
                for item in (
                    list_trip_dispatch_events(db, current_user.company_id, active_trip.id, limit=12)
                    if active_trip
                    else []
                )
            ],
            "insights": [item.model_dump(mode="json") for item in insights],
            "copilot_health": signal_pack,
            "openai_model": settings.OPENAI_MODEL,
        }

    dashboard = get_admin_dashboard(db, current_user.company_id, current_user.id)
    vans = list_company_vans(db, current_user.company_id)
    trips = list_company_trips(db, current_user.company_id)
    drivers = list_company_drivers(db, current_user.company_id)
    alerts = list_admin_alerts(db, current_user)
    stale_vans = [
        van.license_plate
        for van in vans
        if van.status in {VanStatus.AVAILABLE.value, VanStatus.ON_TRIP.value}
        and (
            van.last_location_update is None
            or van.last_location_update
            < datetime.utcnow() - timedelta(seconds=settings.VAN_STALE_ALERT_SECONDS)
        )
    ]
    return {
        "role": current_user.role.value,
        "user_name": current_user.name,
        "timestamp": datetime.utcnow().isoformat(),
        "company_name": current_user.company.name if current_user.company else None,
        "dashboard": dashboard.model_dump(mode="json"),
        "fleet": [item.model_dump(mode="json") for item in vans[:12]],
        "trips": [item.model_dump(mode="json") for item in trips[:12]],
        "drivers": [item.model_dump(mode="json") for item in drivers[:12]],
        "alerts": [item.model_dump(mode="json") for item in alerts[:12]],
        "recent_events": [
            item.model_dump(mode="json")
            for item in list_company_dispatch_events(db, current_user.company_id, limit=20)
        ],
        "stale_vans": stale_vans,
        "insights": [item.model_dump(mode="json") for item in insights],
        "copilot_health": signal_pack,
        "openai_model": settings.OPENAI_MODEL,
    }


def _fallback_brief(
    current_user: User,
    insights: list[AIInsight],
    signal_pack: dict[str, Any],
) -> AICopilotBrief:
    primary = insights[0] if insights else AIInsight(
        title="Operations stable",
        summary="No urgent issues are available in the current snapshot.",
        priority="normal",
        recommended_actions=["Continue monitoring live activity."],
        signals=[],
    )
    return AICopilotBrief(
        headline=primary.title,
        summary=primary.summary,
        urgency="high" if primary.priority == "high" else "medium",
        confidence=signal_pack["confidence"],
        health_score=signal_pack["health_score"],
        priorities=primary.signals[:3],
        recommended_actions=primary.recommended_actions[:4],
        operational_notes=[
            f"Role: {current_user.role.value}",
            "Realtime dashboard cues are driving the fallback copilot summary.",
        ],
        source_signals=signal_pack["source_signals"],
        quick_prompts=signal_pack["quick_prompts"],
        rider_message=(
            "Watch the live dashboard for the next assignment."
            if current_user.role == UserRole.DRIVER
            else None
        ),
        generated_at=datetime.utcnow(),
        generated_by="fallback",
        model=None,
    )


def _fallback_question_reply(
    current_user: User,
    question: str,
    signal_pack: dict[str, Any],
) -> AICopilotReply:
    return AICopilotReply(
        answer=(
            f"The live {current_user.role.value} copilot could not reach OpenAI just now, "
            "so this answer is limited to the built-in operational guidance."
        ),
        action_items=[
            "Refresh the page and retry the copilot request.",
            "Use the live dashboard metrics and map to validate the current state.",
            f"Review the question again: {question.strip()}",
        ],
        caution="OpenAI is unavailable or not configured for this environment.",
        source_signals=signal_pack["source_signals"],
        generated_at=datetime.utcnow(),
        generated_by="fallback",
        model=None,
    )


def _build_copilot_signal_pack(
    db: Session,
    current_user: User,
    insights: list[AIInsight],
) -> dict[str, Any]:
    if current_user.role == UserRole.EMPLOYEE:
        return _employee_signal_pack(db, current_user)
    if current_user.role == UserRole.DRIVER:
        return _driver_signal_pack(db, current_user)
    return _admin_signal_pack(db, current_user, insights)


def _employee_signal_pack(db: Session, current_user: User) -> dict[str, Any]:
    ride = get_active_ride(db, current_user)
    score = 88
    confidence = "medium"
    source_signals = [f"Role: {current_user.role.value}"]

    if ride is None:
        return {
            "health_score": score,
            "confidence": "high",
            "source_signals": [
                *source_signals,
                "No active ride in progress",
                "System ready to accept a new request",
            ],
            "quick_prompts": [
                "Help me create a low-delay ride request right now.",
                "When should I schedule my commute to avoid dispatch pressure?",
                "What details improve my chances of fast matching?",
            ],
        }

    source_signals.append(f"Ride status: {ride.status.replace('_', ' ')}")
    if ride.estimated_wait_minutes is not None:
        source_signals.append(f"Estimated wait: {ride.estimated_wait_minutes} min")
        if ride.estimated_wait_minutes > 8:
            score -= 16
    if ride.schedule_phase:
        source_signals.append(f"Schedule phase: {ride.schedule_phase.replace('_', ' ')}")
        if ride.schedule_phase in {"at_risk", "past_due"}:
            score -= 14

    if ride.van_last_location_update:
        age_seconds = int((datetime.utcnow() - ride.van_last_location_update).total_seconds())
        source_signals.append(f"Driver location age: {max(age_seconds, 0)} sec")
        if age_seconds <= 120:
            confidence = "high"
        elif age_seconds > settings.VAN_STALE_ALERT_SECONDS:
            confidence = "low"
            score -= 10
    else:
        source_signals.append("Driver location feed: unavailable")
        if ride.van_id:
            score -= 8

    if ride.status in {
        RideRequestStatus.REQUESTED.value,
        RideRequestStatus.MATCHING.value,
        RideRequestStatus.MATCHED.value,
        RideRequestStatus.SCHEDULED_REQUESTED.value,
        RideRequestStatus.SCHEDULED_QUEUED.value,
        RideRequestStatus.MATCHING_AT_DISPATCH_WINDOW.value,
    }:
        score -= 8
        quick_prompts = [
            "What can I do now to reduce pickup delay?",
            "Should I keep waiting or cancel and request again later?",
            "Explain what this ride status means and what comes next.",
        ]
    elif ride.status in {
        RideRequestStatus.DRIVER_EN_ROUTE.value,
        RideRequestStatus.ARRIVED_AT_PICKUP.value,
    }:
        quick_prompts = [
            "What should I check before boarding this van?",
            "Give me a short rider message I can send to my team.",
            "How reliable is my ETA right now?",
        ]
    else:
        quick_prompts = [
            "Summarize my remaining trip and expected arrival.",
            "What should I do if route progress stalls?",
            "Draft a short update about my arrival ETA.",
        ]

    return {
        "health_score": _clamp_score(score),
        "confidence": confidence,
        "source_signals": source_signals[:5],
        "quick_prompts": quick_prompts,
    }


def _driver_signal_pack(db: Session, current_user: User) -> dict[str, Any]:
    dashboard = get_driver_dashboard(db, current_user)
    van = dashboard.van
    trip = dashboard.active_trip
    score = 86
    confidence = "medium"
    source_signals = [f"Role: {current_user.role.value}"]

    if van is None:
        return {
            "health_score": 34,
            "confidence": "high",
            "source_signals": [
                *source_signals,
                "No van assigned to this driver",
                "Dispatch assignment required",
            ],
            "quick_prompts": [
                "What should I tell dispatch to get assigned faster?",
                "What is the minimum setup before I can accept trips?",
                "Give me a checklist before going online as a driver.",
            ],
        }

    source_signals.append(f"Van status: {van.status}")
    if van.last_location_update:
        age_seconds = int((datetime.utcnow() - van.last_location_update).total_seconds())
        source_signals.append(f"Last GPS update: {max(age_seconds, 0)} sec ago")
        if age_seconds <= 120:
            confidence = "high"
        elif age_seconds > settings.VAN_STALE_ALERT_SECONDS:
            confidence = "low"
            score -= 18
    else:
        source_signals.append("No GPS update recorded")
        confidence = "low"
        score -= 20

    if trip is None:
        score -= 6
        source_signals.append("No active trip assigned")
        quick_prompts = [
            "How can I improve my chance of getting the next dispatch?",
            "Where should I position the van for upcoming demand?",
            "What checks should I complete while waiting for assignment?",
        ]
    else:
        source_signals.append(f"Trip status: {trip.status.replace('_', ' ')}")
        source_signals.append(f"Assigned passengers: {trip.passenger_count}")
        pending_pickups = len(
            [item for item in trip.passengers if item.status in {"assigned", "notified"}]
        )
        source_signals.append(f"Pending pickups: {pending_pickups}")
        if pending_pickups > 0:
            score -= 6
        quick_prompts = [
            "What should be my next operational action on this trip?",
            "How do I reduce no-show or pickup delay risk right now?",
            "Draft a short rider-facing update for this trip stage.",
        ]

    return {
        "health_score": _clamp_score(score),
        "confidence": confidence,
        "source_signals": source_signals[:5],
        "quick_prompts": quick_prompts,
    }


def _admin_signal_pack(
    db: Session,
    current_user: User,
    insights: list[AIInsight],
) -> dict[str, Any]:
    dashboard = get_admin_dashboard(db, current_user.company_id, current_user.id)
    vans = list_company_vans(db, current_user.company_id)
    trips = list_company_trips(db, current_user.company_id)
    alerts = list_admin_alerts(db, current_user)

    stale_vans = [
        van
        for van in vans
        if van.status in {VanStatus.AVAILABLE.value, VanStatus.ON_TRIP.value}
        and (
            van.last_location_update is None
            or van.last_location_update
            < datetime.utcnow() - timedelta(seconds=settings.VAN_STALE_ALERT_SECONDS)
        )
    ]
    demand_gap = max(dashboard.pending_requests - dashboard.available_vans, 0)
    planned_trips = len(
        [
            trip
            for trip in trips
            if trip.status in {TripStatus.PLANNED.value, TripStatus.DISPATCH_READY.value}
        ]
    )

    score = 100
    score -= min(45, demand_gap * 12)
    score -= min(25, len(alerts) * 8)
    score -= min(20, len(stale_vans) * 6)
    score -= min(10, planned_trips * 2)

    if len(alerts) >= 3 or demand_gap >= 2:
        confidence = "low"
    elif len(stale_vans) <= 1:
        confidence = "high"
    else:
        confidence = "medium"

    source_signals = [
        f"Pending requests: {dashboard.pending_requests}",
        f"Available vans: {dashboard.available_vans}",
        f"Open alerts: {len(alerts)}",
        f"Stale live feeds: {len(stale_vans)}",
        f"Trips waiting start: {planned_trips}",
    ]

    if demand_gap > 0:
        quick_prompts = [
            "Which vans should we pre-position to absorb current demand pressure?",
            "Suggest the fastest reassignment moves to reduce wait times.",
            "Give me a rider-safe status update for unmatched demand.",
        ]
    elif alerts:
        quick_prompts = [
            "Rank current alerts by operational blast radius and urgency.",
            "What exact actions should dispatch take in the next 10 minutes?",
            "Draft a concise shift handoff note for unresolved alerts.",
        ]
    elif insights:
        quick_prompts = [
            "What should ops optimize next while the network is stable?",
            "Suggest pre-positioning actions before the next commute wave.",
            "Create a short checkpoint list for this dispatch shift.",
        ]
    else:
        quick_prompts = [
            "Summarize the fleet health in one paragraph.",
            "What preventive checks should dispatch run now?",
            "List early warning signals I should watch in the next hour.",
        ]

    return {
        "health_score": _clamp_score(score),
        "confidence": confidence,
        "source_signals": source_signals,
        "quick_prompts": quick_prompts,
    }


def _clamp_score(value: int) -> int:
    return max(0, min(100, value))
