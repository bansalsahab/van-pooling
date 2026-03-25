"""AI insight routes."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.ai import (
    AICopilotAskRequest,
    AICopilotBrief,
    AICopilotReply,
    AIInsight,
)
from app.services.ai_service import (
    answer_role_copilot_question,
    build_role_copilot_brief,
    build_role_insights,
)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/insights", response_model=list[AIInsight])
def insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AIInsight]:
    """Return role-specific operational guidance for the signed-in user."""
    return build_role_insights(db, current_user)


@router.get("/copilot/brief", response_model=AICopilotBrief)
def copilot_brief(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AICopilotBrief:
    """Return an OpenAI-backed role-specific briefing."""
    return build_role_copilot_brief(db, current_user)


@router.post("/copilot/ask", response_model=AICopilotReply)
def copilot_ask(
    payload: AICopilotAskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AICopilotReply:
    """Answer a role-specific question using current platform state."""
    return answer_role_copilot_question(db, current_user, payload.question)
