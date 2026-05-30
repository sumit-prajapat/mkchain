"""
backend/routes/api_keys.py

Endpoints:
  POST   /api/keys           — create key
  GET    /api/keys           — list keys
  DELETE /api/keys/{key_id}  — revoke key
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from middleware.auth import require_api_key, AuthContext
from services.api_keys.manager import create_api_key, list_api_keys, revoke_api_key

router = APIRouter(prefix="/api/keys", tags=["API Keys"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class CreateKeyRequest(BaseModel):
    name: str = Field(default="My key", max_length=64)
    expires_at: Optional[datetime] = None


class CreateKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    raw_key: str          # shown ONCE
    created_at: str
    warning: str = "Store this key securely. It will not be shown again."


class ApiKeyItem(BaseModel):
    id: str
    name: str
    key_prefix: str
    is_active: bool
    last_used_at: Optional[str]
    expires_at: Optional[str]
    created_at: str


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("", response_model=CreateKeyResponse, status_code=201)
async def create_key(
    body: CreateKeyRequest,
    ctx: AuthContext = Depends(require_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API key. The raw key is returned only once."""
    try:
        result = await create_api_key(
            db=db,
            user_id=ctx.user_id,
            name=body.name,
            expires_at=body.expires_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    return {**result, "warning": "Store this key securely. It will not be shown again."}


@router.get("", response_model=list[ApiKeyItem])
async def list_keys(
    ctx: AuthContext = Depends(require_api_key),
    db: AsyncSession = Depends(get_db),
):
    """List all API keys for the authenticated user."""
    return await list_api_keys(db=db, user_id=ctx.user_id)


@router.delete("/{key_id}", status_code=204)
async def revoke_key(
    key_id: str,
    ctx: AuthContext = Depends(require_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Revoke (deactivate) an API key."""
    found = await revoke_api_key(db=db, user_id=ctx.user_id, key_id=key_id)
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Key not found or you don't own it.",
        )
