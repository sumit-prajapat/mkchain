"""
Member Management Service
"""
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import secrets
import uuid

from models_organization import OrganizationMember, OrganizationInvite, Role
from schemas_organization import OrganizationInviteCreate


def get_org_members(db: Session, org_id: str) -> List[OrganizationMember]:
    """Get all members of an organization"""
    return db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id
    ).all()


def invite_member(db: Session, org_id: str, invite_data: OrganizationInviteCreate, invited_by: str) -> OrganizationInvite:
    """Create an invitation to join organization"""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=7)
    
    invite = OrganizationInvite(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(org_id) if isinstance(org_id, str) else org_id,
        email=invite_data.email,
        role=invite_data.role,
        token=token,
        invited_by=uuid.UUID(invited_by) if isinstance(invited_by, str) else invited_by,
        expires_at=expires_at
    )
    
    db.add(invite)
    db.commit()
    db.refresh(invite)
    
    # TODO: Send email notification
    
    return invite


def accept_invite(db: Session, token: str, user_id: str) -> Optional[OrganizationMember]:
    """Accept an invitation and join organization"""
    invite = db.query(OrganizationInvite).filter(
        OrganizationInvite.token == token
    ).first()
    
    if not invite or invite.is_expired() or invite.is_accepted():
        return None
    
    # Create membership
    member = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=invite.organization_id,
        user_id=uuid.UUID(user_id) if isinstance(user_id, str) else user_id,
        role=invite.role,
        invited_by=invite.invited_by,
        joined_at=datetime.utcnow()
    )
    
    db.add(member)
    
    # Mark invite as accepted
    invite.accepted_at = datetime.utcnow()
    
    db.commit()
    db.refresh(member)
    
    return member


def update_member_role(db: Session, org_id: str, member_id: str, new_role: str) -> Optional[OrganizationMember]:
    """Update member role"""
    member = db.query(OrganizationMember).filter(
        OrganizationMember.id == member_id,
        OrganizationMember.organization_id == org_id
    ).first()
    
    if not member or member.role == Role.OWNER:
        return None
    
    member.role = new_role
    db.commit()
    db.refresh(member)
    
    return member


def remove_member(db: Session, org_id: str, member_id: str) -> bool:
    """Remove member from organization"""
    member = db.query(OrganizationMember).filter(
        OrganizationMember.id == member_id,
        OrganizationMember.organization_id == org_id
    ).first()
    
    if not member or member.role == Role.OWNER:
        return False
    
    db.delete(member)
    db.commit()
    
    return True


def get_invite_by_token(db: Session, token: str) -> Optional[OrganizationInvite]:
    """Get invite by token"""
    return db.query(OrganizationInvite).filter(
        OrganizationInvite.token == token
    ).first()
