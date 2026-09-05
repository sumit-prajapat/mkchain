"""
Organization Context Middleware
Provides organization context and permission checking for routes
"""
from fastapi import Request, HTTPException, status, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from middleware.auth_helper import get_current_user_id
from models_organization import Organization, OrganizationMember


def get_db(request: Request) -> Session:
    """Get database session from request state"""
    return request.state.db


async def get_current_organization(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[Organization]:
    """
    Get current organization from X-Organization-ID header
    
    Sets request.state.org_id and request.state.organization
    Returns None if header not present
    """
    org_id_header = request.headers.get('X-Organization-ID')
    
    if not org_id_header:
        return None
    
    try:
        org_id = uuid.UUID(org_id_header)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid organization ID format"
        )
    
    # Get organization
    org = db.query(Organization).filter(Organization.id == org_id).first()
    
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization {org_id} not found"
        )
    
    # Store in request state
    request.state.org_id = org_id
    request.state.organization = org
    
    return org


async def require_organization(
    request: Request,
    db: Session = Depends(get_db)
) -> Organization:
    """
    Require X-Organization-ID header and return organization
    
    Raises 400 if header missing or invalid
    """
    org = await get_current_organization(request, db)
    
    if not org:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-ID header required"
        )
    
    return org


def require_role(allowed_roles: List[str]):
    """
    Decorator factory to require specific roles in organization
    
    Usage:
        @router.get("/admin")
        async def admin_route(
            request: Request,
            _: None = Depends(require_role(["owner", "admin"]))
        ):
            # Only owners and admins can access
            ...
    
    Args:
        allowed_roles: List of roles that can access the route
        
    Returns:
        Dependency function for FastAPI
    """
    async def check_role(
        request: Request,
        user_id: str = Depends(get_current_user_id),
        db: Session = Depends(get_db)
    ):
        # Get organization from request state
        org_id = getattr(request.state, 'org_id', None)
        
        if not org_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization context required"
            )
        
        # Check membership
        member = db.query(OrganizationMember).filter(
            OrganizationMember.user_id == uuid.UUID(user_id),
            OrganizationMember.organization_id == org_id
        ).first()
        
        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization"
            )
        
        if member.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires one of these roles: {', '.join(allowed_roles)}"
            )
        
        # Store member info in request state
        request.state.member = member
        request.state.user_role = member.role
        
        return None
    
    return check_role


def require_permission(permission: str):
    """
    Decorator factory to require specific permission in organization
    
    Permission-to-role mapping:
    - read: viewer, analyst, admin, owner
    - write: analyst, admin, owner
    - manage: admin, owner
    - admin: owner
    
    Usage:
        @router.post("/analyses")
        async def create_analysis(
            request: Request,
            _: None = Depends(require_permission("write"))
        ):
            # Only roles with write permission can access
            ...
    """
    # Define permission hierarchy
    PERMISSIONS = {
        "read": ["viewer", "analyst", "admin", "owner"],
        "write": ["analyst", "admin", "owner"],
        "manage": ["admin", "owner"],
        "admin": ["owner"],
    }
    
    if permission not in PERMISSIONS:
        raise ValueError(f"Unknown permission: {permission}")
    
    allowed_roles = PERMISSIONS[permission]
    return require_role(allowed_roles)


async def get_user_role(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Optional[str]:
    """
    Get user's role in current organization
    
    Returns:
        Role string or None if not a member
    """
    org_id = getattr(request.state, 'org_id', None)
    
    if not org_id:
        return None
    
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == uuid.UUID(user_id),
        OrganizationMember.organization_id == org_id
    ).first()
    
    return member.role if member else None
