"""
Pydantic Schemas for Organizations
"""
from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
from datetime import datetime
import re


# ============================================================================
# Organization Schemas
# ============================================================================

class OrganizationBase(BaseModel):
    name: str
    slug: Optional[str] = None


class OrganizationCreate(OrganizationBase):
    """Schema for creating an organization"""
    pass


class OrganizationUpdate(BaseModel):
    """Schema for updating an organization"""
    name: Optional[str] = None
    
    @validator('name')
    def name_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Organization name cannot be empty')
        return v


class Organization(OrganizationBase):
    """Schema for organization response"""
    id: str
    plan_tier: str
    created_at: datetime
    updated_at: datetime
    owner_id: str
    
    class Config:
        orm_mode = True


# ============================================================================
# Organization Member Schemas
# ============================================================================

class OrganizationMemberBase(BaseModel):
    role: str
    
    @validator('role')
    def valid_role(cls, v):
        valid_roles = ['owner', 'admin', 'analyst', 'viewer']
        if v not in valid_roles:
            raise ValueError(f'Role must be one of: {", ".join(valid_roles)}')
        return v


class OrganizationMemberCreate(OrganizationMemberBase):
    """Schema for adding a member"""
    user_id: str


class OrganizationMemberUpdate(BaseModel):
    """Schema for updating a member"""
    role: str
    
    @validator('role')
    def valid_assignable_role(cls, v):
        assignable_roles = ['admin', 'analyst', 'viewer']
        if v not in assignable_roles:
            raise ValueError(f'Can only assign roles: {", ".join(assignable_roles)}')
        return v


class OrganizationMember(OrganizationMemberBase):
    """Schema for member response"""
    id: str
    organization_id: str
    user_id: str
    invited_at: datetime
    joined_at: Optional[datetime] = None
    invited_by: Optional[str] = None
    
    class Config:
        orm_mode = True


# ============================================================================
# Organization Invite Schemas
# ============================================================================

class OrganizationInviteCreate(BaseModel):
    """Schema for inviting a member"""
    email: EmailStr
    role: str
    
    @validator('role')
    def valid_invite_role(cls, v):
        assignable_roles = ['admin', 'analyst', 'viewer']
        if v not in assignable_roles:
            raise ValueError(f'Can only invite as: {", ".join(assignable_roles)}')
        return v


class OrganizationInvite(BaseModel):
    """Schema for invite response"""
    id: str
    organization_id: str
    email: str
    role: str
    token: str
    invited_by: str
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        orm_mode = True


class OrganizationInvitePublic(BaseModel):
    """Public schema for invite (via token)"""
    organization_name: str
    organization_slug: str
    email: str
    role: str
    invited_by_email: str
    expires_at: datetime
    is_expired: bool
    is_accepted: bool


# ============================================================================
# Helper Schemas
# ============================================================================

class OrganizationWithMembers(Organization):
    """Organization with member list"""
    members: List[OrganizationMember] = []
    member_count: int = 0


class MemberWithUser(OrganizationMember):
    """Member with user information"""
    user_email: Optional[str] = None
    user_name: Optional[str] = None


# ============================================================================
# Additional API Schemas
# ============================================================================

class MemberInvite(BaseModel):
    """Schema for inviting a member via API"""
    email: EmailStr
    role: str
    
    @validator('role')
    def valid_invite_role(cls, v):
        assignable_roles = ['admin', 'analyst', 'viewer']
        if v not in assignable_roles:
            raise ValueError(f'Can only invite as: {", ".join(assignable_roles)}')
        return v


class MemberRoleUpdate(BaseModel):
    """Schema for updating member role"""
    role: str
    
    @validator('role')
    def valid_assignable_role(cls, v):
        assignable_roles = ['admin', 'analyst', 'viewer']
        if v not in assignable_roles:
            raise ValueError(f'Can only assign roles: {", ".join(assignable_roles)}')
        return v


class InviteAccept(BaseModel):
    """Schema for accepting an invitation"""
    pass  # No body needed, token is in URL


class OrganizationResponse(Organization):
    """Organization response schema"""
    pass


class MemberResponse(OrganizationMember):
    """Member response schema"""
    pass


class InviteResponse(OrganizationInvite):
    """Invite response schema"""
    pass
