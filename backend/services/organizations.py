"""
Organization Management Service
Handles organization CRUD operations, member management, and permissions
"""
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from datetime import datetime, timedelta
import uuid
import secrets
import re

from models_organization import Organization, OrganizationMember, OrganizationInvite
from schemas_organization import (
    OrganizationCreate,
    OrganizationUpdate,
    MemberInvite,
    InviteAccept,
)


class OrganizationService:
    """Service for organization management"""
    
    @staticmethod
    def generate_slug(name: str) -> str:
        """Generate URL-safe slug from organization name"""
        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        # Add random suffix to ensure uniqueness
        return f"{slug}-{secrets.token_hex(3)}"
    
    @staticmethod
    def create_organization(
        db: Session,
        org_data: OrganizationCreate,
        owner_id: uuid.UUID
    ) -> Organization:
        """
        Create a new organization and add owner as first member
        
        Args:
            db: Database session
            org_data: Organization creation data
            owner_id: UUID of the user creating the organization
            
        Returns:
            Created organization
            
        Raises:
            ValueError: If slug already exists
        """
        # Generate unique slug
        slug = org_data.slug or OrganizationService.generate_slug(org_data.name)
        
        # Create organization
        org = Organization(
            id=uuid.uuid4(),
            name=org_data.name,
            slug=slug,
            plan_tier="free",
            owner_id=owner_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        try:
            db.add(org)
            db.flush()  # Get the org.id before creating member
            
            # Add owner as first member
            owner_member = OrganizationMember(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=owner_id,
                role="owner",
                joined_at=datetime.utcnow(),
                invited_at=datetime.utcnow(),
                invited_by=owner_id
            )
            db.add(owner_member)
            db.commit()
            db.refresh(org)
            
            return org
            
        except IntegrityError as e:
            db.rollback()
            if "organizations_slug_key" in str(e):
                raise ValueError(f"Organization slug '{slug}' already exists")
            raise
    
    @staticmethod
    def get_organization(db: Session, org_id: uuid.UUID) -> Optional[Organization]:
        """Get organization by ID"""
        return db.query(Organization).filter(Organization.id == org_id).first()
    
    @staticmethod
    def get_organization_by_slug(db: Session, slug: str) -> Optional[Organization]:
        """Get organization by slug"""
        return db.query(Organization).filter(Organization.slug == slug).first()
    
    @staticmethod
    def get_user_organizations(db: Session, user_id: uuid.UUID) -> List[Organization]:
        """
        Get all organizations where user is a member
        
        Args:
            db: Database session
            user_id: User UUID
            
        Returns:
            List of organizations
        """
        return (
            db.query(Organization)
            .join(OrganizationMember)
            .filter(OrganizationMember.user_id == user_id)
            .order_by(Organization.created_at.desc())
            .all()
        )
    
    @staticmethod
    def update_organization(
        db: Session,
        org_id: uuid.UUID,
        org_data: OrganizationUpdate
    ) -> Organization:
        """
        Update organization details
        
        Args:
            db: Database session
            org_id: Organization UUID
            org_data: Update data
            
        Returns:
            Updated organization
            
        Raises:
            ValueError: If organization not found
        """
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            raise ValueError(f"Organization {org_id} not found")
        
        # Update fields
        if org_data.name is not None:
            org.name = org_data.name
        
        org.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(org)
        return org
    
    @staticmethod
    def delete_organization(db: Session, org_id: uuid.UUID) -> bool:
        """
        Delete organization and all related data (cascades to members, invites, etc.)
        
        Args:
            db: Database session
            org_id: Organization UUID
            
        Returns:
            True if deleted, False if not found
        """
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            return False
        
        db.delete(org)
        db.commit()
        return True
    
    @staticmethod
    def invite_member(
        db: Session,
        org_id: uuid.UUID,
        email: str,
        role: str,
        invited_by: uuid.UUID
    ) -> OrganizationInvite:
        """
        Create an invitation for a new member
        
        Args:
            db: Database session
            org_id: Organization UUID
            email: Email of person to invite
            role: Role to assign (admin, analyst, viewer)
            invited_by: UUID of user creating the invite
            
        Returns:
            Created invite
            
        Raises:
            ValueError: If organization not found or role invalid
        """
        # Validate organization exists
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            raise ValueError(f"Organization {org_id} not found")
        
        # Validate role
        valid_roles = ["admin", "analyst", "viewer"]
        if role not in valid_roles:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(valid_roles)}")
        
        # Generate secure token
        token = secrets.token_urlsafe(32)
        
        # Create invite
        invite = OrganizationInvite(
            id=uuid.uuid4(),
            organization_id=org_id,
            email=email.lower(),
            role=role,
            token=token,
            invited_by=invited_by,
            invited_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=7)
        )
        
        db.add(invite)
        db.commit()
        db.refresh(invite)
        
        return invite
    
    @staticmethod
    def accept_invite(
        db: Session,
        token: str,
        user_id: uuid.UUID
    ) -> OrganizationMember:
        """
        Accept an invitation and create organization membership
        
        Args:
            db: Database session
            token: Invitation token
            user_id: UUID of user accepting
            
        Returns:
            Created membership
            
        Raises:
            ValueError: If invite not found, expired, or already used
        """
        # Get invite
        invite = db.query(OrganizationInvite).filter(
            OrganizationInvite.token == token
        ).first()
        
        if not invite:
            raise ValueError("Invitation not found")
        
        if invite.accepted_at:
            raise ValueError("Invitation already accepted")
        
        if datetime.utcnow() > invite.expires_at:
            raise ValueError("Invitation has expired")
        
        # Check if user is already a member
        existing_member = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == invite.organization_id,
            OrganizationMember.user_id == user_id
        ).first()
        
        if existing_member:
            raise ValueError("You are already a member of this organization")
        
        # Create membership
        member = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=invite.organization_id,
            user_id=user_id,
            role=invite.role,
            invited_at=invite.invited_at,
            joined_at=datetime.utcnow(),
            invited_by=invite.invited_by
        )
        
        # Mark invite as accepted
        invite.accepted_at = datetime.utcnow()
        invite.accepted_by = user_id
        
        db.add(member)
        db.commit()
        db.refresh(member)
        
        return member
    
    @staticmethod
    def get_members(db: Session, org_id: uuid.UUID) -> List[OrganizationMember]:
        """Get all members of an organization"""
        return (
            db.query(OrganizationMember)
            .filter(OrganizationMember.organization_id == org_id)
            .order_by(OrganizationMember.joined_at)
            .all()
        )
    
    @staticmethod
    def update_member_role(
        db: Session,
        org_id: uuid.UUID,
        member_id: uuid.UUID,
        new_role: str
    ) -> OrganizationMember:
        """
        Update a member's role
        
        Args:
            db: Database session
            org_id: Organization UUID
            member_id: Member UUID
            new_role: New role to assign
            
        Returns:
            Updated member
            
        Raises:
            ValueError: If member not found, role invalid, or trying to change owner
        """
        member = db.query(OrganizationMember).filter(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == org_id
        ).first()
        
        if not member:
            raise ValueError("Member not found")
        
        if member.role == "owner":
            raise ValueError("Cannot change owner role")
        
        valid_roles = ["admin", "analyst", "viewer"]
        if new_role not in valid_roles:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(valid_roles)}")
        
        member.role = new_role
        db.commit()
        db.refresh(member)
        
        return member
    
    @staticmethod
    def remove_member(
        db: Session,
        org_id: uuid.UUID,
        member_id: uuid.UUID
    ) -> bool:
        """
        Remove a member from organization
        
        Args:
            db: Database session
            org_id: Organization UUID
            member_id: Member UUID
            
        Returns:
            True if removed, False if not found
            
        Raises:
            ValueError: If trying to remove owner
        """
        member = db.query(OrganizationMember).filter(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == org_id
        ).first()
        
        if not member:
            return False
        
        if member.role == "owner":
            raise ValueError("Cannot remove organization owner")
        
        db.delete(member)
        db.commit()
        return True
    
    @staticmethod
    def get_invite(db: Session, token: str) -> Optional[OrganizationInvite]:
        """Get invitation by token"""
        return db.query(OrganizationInvite).filter(
            OrganizationInvite.token == token
        ).first()
    
    @staticmethod
    def check_permission(
        db: Session,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
        required_roles: List[str]
    ) -> bool:
        """
        Check if user has required role in organization
        
        Args:
            db: Database session
            user_id: User UUID
            org_id: Organization UUID
            required_roles: List of acceptable roles
            
        Returns:
            True if user has permission, False otherwise
        """
        member = db.query(OrganizationMember).filter(
            OrganizationMember.user_id == user_id,
            OrganizationMember.organization_id == org_id
        ).first()
        
        if not member:
            return False
        
        return member.role in required_roles
