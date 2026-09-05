"""Security utilities: JWT validation, token extraction."""
from typing import Any, Optional
from uuid import UUID

import jwt
from jwt import PyJWTError

from core.config import get_settings


class AuthError(Exception):
    """Raised when authentication fails"""
    pass


def get_require_auth() -> bool:
    """Check if authentication is required"""
    settings = get_settings()
    return settings.require_auth


def decode_supabase_jwt(token: str) -> dict[str, Any]:
    """
    Decode and validate Supabase JWT token.
    
    Raises:
        AuthError: If token is invalid or expired
    """
    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise AuthError("SUPABASE_JWT_SECRET is not configured")

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except PyJWTError as exc:
        raise AuthError("Invalid or expired token") from exc

    sub = payload.get("sub")
    if not sub:
        raise AuthError("Token missing subject")
    
    try:
        UUID(str(sub))
    except ValueError as exc:
        raise AuthError("Invalid user id in token") from exc

    return payload


def extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None
