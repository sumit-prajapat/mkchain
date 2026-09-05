"""Request context with authentication and multi-tenancy information."""
from dataclasses import dataclass
from typing import Optional
from uuid import UUID


@dataclass
class AuthContext:
    """Authentication context for a logged-in user"""
    user_id: UUID
    email: str
    org_id: UUID
    org_slug: str
    org_plan: str
    role: str = "analyst"  # owner, admin, analyst, viewer, billing
    
    def can_write(self) -> bool:
        """Check if user can create/modify resources"""
        return self.role in ("owner", "admin", "analyst")
    
    def can_admin(self) -> bool:
        """Check if user can manage org settings"""
        return self.role in ("owner", "admin")


@dataclass
class RequestContext:
    """Request-level context passed through middleware"""
    request_id: str
    auth: Optional[AuthContext] = None
    
    @property
    def is_authenticated(self) -> bool:
        return self.auth is not None
