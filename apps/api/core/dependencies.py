from typing import Optional
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.context import AuthContext, RequestContext
from database import get_db


def get_request_context(request: Request) -> RequestContext:
    ctx = getattr(request.state, "ctx", None)
    if ctx is None:
        return RequestContext(request_id=getattr(request.state, "request_id", "unknown"))
    return ctx


def get_optional_auth(request: Request) -> Optional[AuthContext]:
    ctx = get_request_context(request)
    return ctx.auth


def require_auth(request: Request) -> AuthContext:
    auth = get_optional_auth(request)
    if auth is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return auth


async def load_auth_context(db: AsyncSession, user_id: UUID, org_header: Optional[str] = None) -> AuthContext:
    """Resolve user membership and default org from Postgres using async session."""
    profile_res = await db.execute(
        text(
            """
            select p.id, p.email, p.default_org_id
            from public.profiles p
            where p.id = :user_id
            """
        ),
        {"user_id": str(user_id)},
    )
    profile = profile_res.mappings().first()

    if not profile:
        raise HTTPException(status_code=403, detail="User profile not found")

    org_id = org_header or (str(profile["default_org_id"]) if profile["default_org_id"] else None)
    if not org_id:
        raise HTTPException(status_code=403, detail="No organization associated with user")

    row_res = await db.execute(
        text(
            """
            select m.role, o.id as org_id, o.slug, o.plan::text as plan
            from public.memberships m
            join public.organizations o on o.id = m.org_id
            where m.user_id = :user_id and m.org_id = :org_id
            """
        ),
        {"user_id": str(user_id), "org_id": org_id},
    )
    row = row_res.mappings().first()

    if not row:
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    return AuthContext(
        user_id=user_id,
        email=profile["email"],
        org_id=UUID(str(row["org_id"])),
        org_slug=row["slug"],
        org_plan=row["plan"],
        role=row["role"],
    )


async def get_db_session():
    async for db in get_db():
        yield db
