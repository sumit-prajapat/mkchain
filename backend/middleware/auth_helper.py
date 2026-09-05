"""
Authentication Helper Functions
"""
from fastapi import Request, HTTPException


def get_current_user_id(request: Request) -> str:
    """
    Extract user_id from request state (set by auth middleware).
    Used as a dependency in route handlers.
    """
    user_id = getattr(request.state, 'user_id', None)
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
    return user_id


def get_user_id_from_request(request: Request) -> str:
    """Alias for get_current_user_id"""
    return get_current_user_id(request)
