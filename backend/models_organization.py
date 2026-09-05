"""
Organization Models for Multi-Tenancy
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from models import Base


class Organization(Base):
    """Organization (Workspace/Tenant) model"""
    __tablename__ = "organizations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    plan_tier = Column(String(50), default="free")  # free, starter, professional, enterprise
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    owner_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    
    # Relationships
    members = relationship("OrganizationMember", back_populates="organization", cascade="all, delete-orphan")
    invites = relationship("OrganizationInvite", back_populates="organization", cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="organization", uselist=False, cascade="all, delete-orphan")
    payment_methods = relationship("PaymentMethod", back_populates="organization", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Organization {self.name} ({self.slug})>"


class OrganizationMember(Base):
    """Organization membership with role-based access"""
    __tablename__ = "organization_members"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # owner, admin, analyst, viewer
    invited_at = Column(DateTime, default=datetime.utcnow)
    joined_at = Column(DateTime)
    invited_by = Column(UUID(as_uuid=True))
    
    # Relationships
    organization = relationship("Organization", back_populates="members")
    
    # Unique constraint: user can only be in org once
    __table_args__ = (
        UniqueConstraint('organization_id', 'user_id', name='uq_org_member'),
    )
    
    def __repr__(self):
        return f"<Member {self.user_id} in {self.organization_id} as {self.role}>"


class OrganizationInvite(Base):
    """Pending invitations to join organizations"""
    __tablename__ = "organization_invites"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # admin, analyst, viewer (not owner)
    token = Column(String(255), unique=True, nullable=False, index=True)
    invited_by = Column(UUID(as_uuid=True), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    organization = relationship("Organization", back_populates="invites")
    
    def is_expired(self) -> bool:
        """Check if invite has expired"""
        return datetime.utcnow() > self.expires_at
    
    def is_accepted(self) -> bool:
        """Check if invite was accepted"""
        return self.accepted_at is not None
    
    def __repr__(self):
        return f"<Invite {self.email} to {self.organization_id} as {self.role}>"


# Role definitions
class Role:
    OWNER = "owner"
    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"
    
    ALL_ROLES = [OWNER, ADMIN, ANALYST, VIEWER]
    ASSIGNABLE_ROLES = [ADMIN, ANALYST, VIEWER]  # Cannot assign owner role


# Permission definitions
PERMISSIONS = {
    Role.OWNER: [
        "*",  # All permissions
    ],
    Role.ADMIN: [
        "organization:read",
        "organization:update",
        "members:read",
        "members:invite",
        "members:update",
        "members:delete",
        "analyses:read",
        "analyses:create",
        "analyses:update",
        "analyses:delete",
        "alerts:read",
        "alerts:create",
        "alerts:update",
        "alerts:delete",
        "watchlists:read",
        "watchlists:create",
        "watchlists:update",
        "watchlists:delete",
    ],
    Role.ANALYST: [
        "organization:read",
        "members:read",
        "analyses:read",
        "analyses:create",
        "analyses:update",
        "alerts:read",
        "alerts:create",
        "alerts:update",
        "watchlists:read",
        "watchlists:create",
        "watchlists:update",
    ],
    Role.VIEWER: [
        "organization:read",
        "members:read",
        "analyses:read",
        "alerts:read",
        "watchlists:read",
    ],
}


def check_permission(role: str, permission: str) -> bool:
    """Check if a role has a specific permission"""
    if role == Role.OWNER:
        return True  # Owner has all permissions
    
    role_permissions = PERMISSIONS.get(role, [])
    return permission in role_permissions
