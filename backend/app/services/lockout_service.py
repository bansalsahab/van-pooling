"""Account lockout service for brute force protection."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Dict

from app.core.config import settings


# Configuration
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15
FAILED_ATTEMPT_WINDOW_MINUTES = 30


@dataclass
class FailedLoginRecord:
    """Track failed login attempts for an email."""
    attempts: list[datetime] = field(default_factory=list)
    locked_until: datetime | None = None


_LOCK = Lock()
_FAILED_LOGINS: Dict[str, FailedLoginRecord] = defaultdict(FailedLoginRecord)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clean_old_attempts(record: FailedLoginRecord) -> None:
    """Remove attempts older than the window."""
    cutoff = _now() - timedelta(minutes=FAILED_ATTEMPT_WINDOW_MINUTES)
    record.attempts = [a for a in record.attempts if a > cutoff]


def is_account_locked(email: str) -> bool:
    """Check if an account is currently locked."""
    email = email.lower()
    with _LOCK:
        record = _FAILED_LOGINS.get(email)
        if not record or not record.locked_until:
            return False
        if _now() >= record.locked_until:
            # Lock expired, clear it
            record.locked_until = None
            record.attempts.clear()
            return False
        return True


def get_lockout_remaining_seconds(email: str) -> int:
    """Get remaining lockout time in seconds, or 0 if not locked."""
    email = email.lower()
    with _LOCK:
        record = _FAILED_LOGINS.get(email)
        if not record or not record.locked_until:
            return 0
        remaining = record.locked_until - _now()
        return max(0, int(remaining.total_seconds()))


def record_failed_login(email: str) -> bool:
    """
    Record a failed login attempt.
    
    Returns True if the account is now locked.
    """
    email = email.lower()
    now = _now()
    
    with _LOCK:
        record = _FAILED_LOGINS[email]
        
        # Check if already locked
        if record.locked_until and now < record.locked_until:
            return True
        
        # Clear expired lock
        if record.locked_until and now >= record.locked_until:
            record.locked_until = None
            record.attempts.clear()
        
        # Clean old attempts
        _clean_old_attempts(record)
        
        # Record new attempt
        record.attempts.append(now)
        
        # Check if we should lock
        if len(record.attempts) >= MAX_FAILED_ATTEMPTS:
            record.locked_until = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            return True
        
        return False


def record_successful_login(email: str) -> None:
    """Clear failed login attempts on successful login."""
    email = email.lower()
    with _LOCK:
        if email in _FAILED_LOGINS:
            del _FAILED_LOGINS[email]


def get_remaining_attempts(email: str) -> int:
    """Get remaining login attempts before lockout."""
    email = email.lower()
    with _LOCK:
        record = _FAILED_LOGINS.get(email)
        if not record:
            return MAX_FAILED_ATTEMPTS
        _clean_old_attempts(record)
        return max(0, MAX_FAILED_ATTEMPTS - len(record.attempts))


def clear_all_lockouts() -> None:
    """Clear all lockouts (for testing)."""
    with _LOCK:
        _FAILED_LOGINS.clear()
