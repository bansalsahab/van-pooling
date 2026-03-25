"""AI assistant schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AIInsight(BaseModel):
    """Role-specific assistant insight block."""

    title: str
    summary: str
    priority: str
    recommended_actions: list[str]
    signals: list[str]


class AICopilotBrief(BaseModel):
    """Expanded role-aware copilot brief."""

    headline: str
    summary: str
    urgency: Literal["low", "medium", "high"] = "medium"
    priorities: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    operational_notes: list[str] = Field(default_factory=list)
    rider_message: str | None = None
    generated_at: datetime
    generated_by: Literal["openai", "fallback"] = "fallback"
    model: str | None = None


class AICopilotAskRequest(BaseModel):
    """Question payload for the role-aware copilot."""

    question: str = Field(min_length=3, max_length=2000)


class AICopilotReply(BaseModel):
    """Structured response to an operator question."""

    answer: str
    action_items: list[str] = Field(default_factory=list)
    caution: str | None = None
    generated_at: datetime
    generated_by: Literal["openai", "fallback"] = "fallback"
    model: str | None = None
