"""
backend/middleware/auth.py

FastAPI dependency for API key authentication.
Validates key → fetches user plan → enforces limits.

Usage:
    @router.post("/api/analyze")
    async def analyze(
        body: AnalyzeRequest,
        ctx: AuthContext = Depends(require_api_key),
    ):
        ...
"""

import hashlib
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db


# ─── Plan limits (must match Supabase plans table) ──────────────────────────

PLAN_LIMITS: dict[str, dict] = {
    "free": {
        "analyses_per_month": 100,
        "rate_per_min": 5,
        "pdf_reports": False,
        "alerts": False,
    },
    "pro": {
        "analyses_per_month": 1000,
        "rate_per_min": 60,
        "pdf_reports": True,
        "alerts": True,
    },
    "team": {
        "analyses_per_month": 10_000,
        "rate_per_min": 300,
        "pdf_reports": True,
        "alerts": True,
    },
}


# ─── Auth context passed to route handlers ──────────────────────────────────

@dataclass
class AuthContext:
    user_id: str
    api_key_id: str
    plan_id: str
    plan: dict
    calls_used: int
    calls_remaining: int


# ─── Key hashing ─────────────────────────────────────────────────────────────

def hash_api_key(raw_key: str) -> str:
    """SHA-256 hash of the raw key. Only the hash is stored."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


# ─── Main dependency ─────────────────────────────────────────────────────────

def require_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> AuthContext:
    """
    Accepts key via:
      - X-API-Key: mk_live_xxxxx
      - Authorization: Bearer mk_live_xxxxx
    """
    raw_key = _extract_key(x_api_key, authorization)

    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required. Pass X-API-Key header or Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    key_hash = hash_api_key(raw_key)

    # ── Lookup key + user profile in one query ───────────────────────────────
    row = _fetch_key_and_profile(db, key_hash)

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key.",
        )

    if not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This API key has been deactivated.",
        )

    if row["expires_at"] and row["expires_at"] < time.time():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This API key has expired.",
        )

    plan_id = row["plan_id"] or "free"
    plan = PLAN_LIMITS.get(plan_id, PLAN_LIMITS["free"])
    calls_used = row["api_calls_used"] or 0
    monthly_limit = plan["analyses_per_month"]

    # ── Monthly quota check ──────────────────────────────────────────────────
    if calls_used >= monthly_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Monthly limit of {monthly_limit} analyses reached. "
                f"Upgrade your plan at https://mkchain.app/billing"
            ),
            headers={"X-Plan": plan_id, "X-Limit": str(monthly_limit)},
        )

    # ── Update last_used_at on key ───────────────────────────────────────────
    db.execute(
        text("UPDATE api_keys SET last_used_at = now() WHERE key_hash = :h"),
        {"h": key_hash},
    )
    db.commit()

    return AuthContext(
        user_id=row["user_id"],
        api_key_id=row["api_key_id"],
        plan_id=plan_id,
        plan=plan,
        calls_used=calls_used,
        calls_remaining=monthly_limit - calls_used,
    )


# ─── Feature gate dependencies ───────────────────────────────────────────────

def require_pdf_access(ctx: AuthContext = Depends(require_api_key)) -> AuthContext:
    """Blocks PDF generation on free plan."""
    if not ctx.plan.get("pdf_reports"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PDF reports require a Pro or Team plan. Upgrade at https://mkchain.app/billing",
        )
    return ctx


def require_alerts_access(ctx: AuthContext = Depends(require_api_key)) -> AuthContext:
    """Blocks real-time alerts on free plan."""
    if not ctx.plan.get("alerts"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Alerts require a Pro or Team plan.",
        )
    return ctx


# ─── Usage incrementer (call AFTER successful analysis) ──────────────────────

def increment_usage(user_id: str, db: Session) -> None:
    """Increment api_calls_used in profiles. Call after every successful analysis."""
    db.execute(
        text(
            "UPDATE profiles SET api_calls_used = api_calls_used + 1 "
            "WHERE id = :uid"
        ),
        {"uid": user_id},
    )
    db.commit()


# ─── Private helpers ─────────────────────────────────────────────────────────

def _extract_key(x_api_key: Optional[str], authorization: Optional[str]) -> Optional[str]:
    if x_api_key:
        return x_api_key.strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def _fetch_key_and_profile(db: Session, key_hash: str):
    result = db.execute(
        text("""
            SELECT
                k.id            AS api_key_id,
                k.user_id,
                k.is_active,
                k.key_hash,
                EXTRACT(EPOCH FROM k.expires_at) AS expires_at,
                p.plan_id,
                p.api_calls_used
            FROM api_keys k
            JOIN profiles p ON p.id = k.user_id
            WHERE k.key_hash = :hash
            LIMIT 1
        """),
        {"hash": key_hash},
    )
    row = result.mappings().first()
    return dict(row) if row else None
