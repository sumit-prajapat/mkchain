"""
Organization API Routes
Handles organization CRUD, member management, and invitations
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from middleware.organization import get_db, require_organization, require_role, get_user_role
from middleware.auth_helper import get_current_user_id
from services.organizations import OrganizationService
from schemas_organization import (
    OrganizationResponse,
    OrganizationCreate,
    OrganizationUpdate,
    MemberResponse,
    MemberInvite,
    MemberRoleUpdate,
    InviteResponse,
    InviteAccept,
)

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


# ============================================================================
# Organization Management
# ============================================================================

@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    org_data: OrganizationCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Create a new organization
    
    The creator becomes the owner
    """
    try:
        org = OrganizationService.create_organization(
            db=db,
            org_data=org_data,
            owner_id=uuid.UUID(user_id)
        )
        return org
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("", response_model=List[OrganizationResponse])
async def list_organizations(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    List all organizations where user is a member
    """
    orgs = OrganizationService.get_user_organizations(
        db=db,
        user_id=uuid.UUID(user_id)
    )
    return orgs


@router.get("/{org_id}", response_model=OrganizationResponse)
async def get_organization(
    org_id: uuid.UUID,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Get organization details
    
    User must be a member
    """
    # Check membership
    is_member = OrganizationService.check_permission(
        db=db,
        user_id=uuid.UUID(user_id),
        org_id=org_id,
        required_roles=["owner", "admin", "analyst", "viewer"]
    )
    
    if not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization"
        )
    
    org = OrganizationService.get_organization(db=db, org_id=org_id)
    
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    return org


@router.patch("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: uuid.UUID,
    org_data: OrganizationUpdate,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Update organization details
    
    Requires owner or admin role
    """
    # Check permission
    has_permission = OrganizationService.check_permission(
        db=db,
        user_id=uuid.UUID(user_id),
        org_id=org_id,
        required_roles=["owner", "admin"]
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can update organization details"
        )
    
    try:
        org = OrganizationService.update_organization(
            db=db,
            org_id=org_id,
            org_data=org_data
        )
        return org
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    org_id: uuid.UUID,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Delete organization
    
    Requires owner role
    Cascades to all members, invites, and related data
    """
    # Check permission
    has_permission = OrganizationService.check_permission(
        db=db,
        user_id=uuid.UUID(user_id),
        org_id=org_id,
        required_roles=["owner"]
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can delete the organization"
        )
    
    deleted = OrganizationService.delete_organization(db=db, org_id=org_id)
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    return None


# ============================================================================
# Member Management
# ============================================================================

@router.get("/{org_id}/members", response_model=List[MemberResponse])
async def list_members(
    org_id: uuid.UUID,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    List all members of an organization
    
    User must be a member
    """
    # Check membership
    is_member = OrganizationService.check_permission(
        db=db,
        user_id=uuid.UUID(user_id),
        org_id=org_id,
        required_roles=["owner", "admin", "analyst", "viewer"]
    )
    
    if not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization"
        )
    
    members = OrganizationService.get_members(db=db, org_id=org_id)
    return members


@router.post("/{org_id}/members/invite", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    org_id: uuid.UUID,
    invite_data: MemberInvite,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Invite a new member to the organization
    
    Requires owner or admin role
    """
    # Check permission
    has_permission = OrganizationService.check_permission(
        db=db,
        user_id=uuid.UUID(user_id),
        org_id=org_id,
        required_roles=["owner", "admin"]
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can invite members"
        )
    
    try:
        invite = OrganizationService.invite_member(
            db=db,
            org_id=org_id,
            email=invite_data.email,
            role=invite_data.role,
            invited_by=uuid.UUID(user_id)
        )
        return invite
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.patch("/{org_id}/members/{member_id}", response_model=MemberResponse)
async def update_member_role(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    role_update: MemberRoleUpdate,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Update a member's role
    
    Requires owner or admin role
    Cannot change owner role
    """
    # Check permission
    has_permission = OrganizationService.check_permission(
        db=db,
        user_id=uuid.UUID(user_id),
        org_id=org_id,
        required_roles=["owner", "admin"]
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can update member roles"
        )
    
    try:
        member = OrganizationService.update_member_role(
            db=db,
            org_id=org_id,
            member_id=member_id,
            new_role=role_update.role
        )
        return member
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{org_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Remove a member from the organization
    
    Requires owner or admin role
    Cannot remove owner
    """
    # Check permission
    has_permission = OrganizationService.check_permission(
        db=db,
        user_id=uuid.UUID(user_id),
        org_id=org_id,
        required_roles=["owner", "admin"]
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can remove members"
        )
    
    try:
        removed = OrganizationService.remove_member(
            db=db,
            org_id=org_id,
            member_id=member_id
        )
        
        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found"
            )
        
        return None
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# ============================================================================
# Invitation Management
# ============================================================================

@router.get("/invites/{token}", response_model=InviteResponse)
async def get_invite(
    token: str,
    db: Session = Depends(get_db)
):
    """
    Get invitation details by token
    
    Public endpoint - no authentication required
    """
    invite = OrganizationService.get_invite(db=db, token=token)
    
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
    
    return invite


@router.post("/invites/{token}/accept", response_model=MemberResponse)
async def accept_invite(
    token: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Accept an invitation and join the organization
    
    Requires authentication
    """
    try:
        member = OrganizationService.accept_invite(
            db=db,
            token=token,
            user_id=uuid.UUID(user_id)
        )
        return member
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
