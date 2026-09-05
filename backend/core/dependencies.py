"""FastAPI dependencies for authentication and authorization."""
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Header
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.context import AuthContext, RequestContext
from core.security import AuthError, decode_supabase_jwt, extract_bearer_token, get_require_auth
from database import get_db


def load_auth_context(
    db: Session, 
    user_id: UUID, 
    org_header: Optional[str] = None
) -> AuthContext:
    """
    Load full auth context from database for a user.
    
    Args:
        db: Database session
        user_id: User UUID from JWT
        org_header: Optional X-Org-Id header to specify which org to use
    
    Returns:
        AuthContext with user, org, and role information
    
    Raises:
        HTTPException: If user/org not found or access denied
    """
    # Get user profile
    profile_res = db.execute(
        text(
            """
            SELECT p.id, p.email, p.default_org_id
            FROM public.profiles p
            WHERE p.id = :user_id
            """
        ),
        {"user_id": str(user_id)},
    )
    profile = profile_res.mappings().first()

    if not profile:
        raise HTTPException(status_code=403, detail="User profile not found")

    # Determine which org to use
    org_id = org_header or (str(profile["default_org_id"]) if profile["default_org_id"] else None)
    if not org_id:
        raise HTTPException(status_code=403, detail="No organization associated with user")

    # Get org membership and role
    membership_res = db.execute(
        text(
            """
            SELECT m.role, o.id as org_id, o.slug, o.plan::text as plan
            FROM public.memberships m
            JOIN public.organizations o ON o.id = m.org_id
            WHERE m.user_id = :user_id AND m.org_id = :org_id
            """
        ),
        {"user_id": str(user_id), "org_id": org_id},
    )
    membership = membership_res.mappings().first()

    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    return AuthContext(
        user_id=user_id,
        email=profile["email"],
        org_id=UUID(str(membership["org_id"])),
        org_slug=membership["slug"],
        org_plan=membership["plan"],
        role=membership["role"],
    )


def get_request_context(
    authorization: Optional[str] = Header(None),
    x_org_id: Optional[str] = Header(None, alias="X-Org-Id"),
    db: Session = Depends(get_db),
) -> RequestContext:
    """
    FastAPI dependency to extract and validate authentication.
    
    Returns:
        RequestContext with auth info (or None if not authenticated)
    
    Raises:
        HTTPException: 401 if auth required but missing/invalid
    """
    token = extract_bearer_token(authorization)
    
    # If no token but auth required, reject
    if not token and get_require_auth():
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please provide a valid Bearer token.",
        )
    
    # If no token and auth not required, allow (legacy mode)
    if not token:
        return RequestContext(request_id="anonymous", auth=None)
    
    # Validate token and load context
    try:
        payload = decode_supabase_jwt(token)
        user_id = UUID(str(payload["sub"]))
        auth = load_auth_context(db, user_id, x_org_id)
        return RequestContext(request_id=str(user_id), auth=auth)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Authentication failed")


def require_auth(ctx: RequestContext = Depends(get_request_context)) -> AuthContext:
    """
    Dependency that REQUIRES authentication.
    Use this on routes that must have a logged-in user.
    
    Returns:
        AuthContext
    
    Raises:
        HTTPException: 401 if not authenticated
    """
    if not ctx.auth:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )
    return ctx.auth


def require_write_access(auth: AuthContext = Depends(require_auth)) -> AuthContext:
    """
    Dependency that requires write permission (analyst, admin, owner).
    
    Returns:
        AuthContext
    
    Raises:
        HTTPException: 403 if user doesn't have write access
    """
    if not auth.can_write():
        raise HTTPException(
            status_code=403,
            detail=f"Write access denied. Your role ({auth.role}) cannot modify resources.",
        )
    return auth


def require_admin_access(auth: AuthContext = Depends(require_auth)) -> AuthContext:
    """
    Dependency that requires admin permission (admin, owner).
    
    Returns:
        AuthContext
    
    Raises:
        HTTPException: 403 if user doesn't have admin access
    """
    if not auth.can_admin():
        raise HTTPException(
            status_code=403,
            detail=f"Admin access denied. Your role ({auth.role}) cannot manage organization settings.",
        )
    return auth
