"""
Basic tests for SubscriptionManager
"""
import pytest
from datetime import datetime
from uuid import uuid4
from unittest.mock import Mock, AsyncMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base
from models_billing import Subscription, SubscriptionStatus, PlanTier
from models_organization import Organization  # Import to ensure tables are created
from services.subscription_manager import (
    SubscriptionManager, 
    SubscriptionManagerError,
    InvalidUpgradeError,
    InvalidDowngradeError,
    SubscriptionNotFoundError
)
from services.payment_processor import PaymentProcessor


# Test database setup
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture
def db_session():
    """Create a test database session"""
    engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    
    yield session
    
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def mock_payment_processor():
    """Create a mock PaymentProcessor"""
    processor = Mock(spec=PaymentProcessor)
    
    # Mock async methods
    processor.create_customer = AsyncMock(return_value="cus_test123")
    processor.create_subscription = AsyncMock(return_value={
        'id': 'sub_test123',
        'status': 'trialing',
        'current_period_start': datetime.utcnow(),
        'current_period_end': datetime.utcnow(),
        'trial_end': datetime.utcnow(),
        'cancel_at_period_end': False
    })
    processor.update_subscription = AsyncMock(return_value={
        'id': 'sub_test123',
        'status': 'active',
        'current_period_start': datetime.utcnow(),
        'current_period_end': datetime.utcnow(),
        'trial_end': None,
        'cancel_at_period_end': False,
        'latest_invoice': None
    })
    processor.cancel_subscription = AsyncMock(return_value={
        'id': 'sub_test123',
        'status': 'canceled',
        'current_period_start': datetime.utcnow(),
        'current_period_end': datetime.utcnow(),
        'canceled_at': datetime.utcnow(),
        'cancel_at_period_end': True
    })
    
    return processor


@pytest.fixture
def subscription_manager(db_session, mock_payment_processor):
    """Create a SubscriptionManager instance"""
    return SubscriptionManager(db_session, mock_payment_processor)


@pytest.mark.asyncio
async def test_create_free_subscription(subscription_manager, db_session):
    """Test creating a free tier subscription"""
    org_id = uuid4()
    
    subscription = await subscription_manager.create_subscription(
        org_id=org_id,
        plan_tier=PlanTier.FREE
    )
    
    assert subscription.org_id == org_id
    assert subscription.plan_tier == PlanTier.FREE
    assert subscription.status == SubscriptionStatus.ACTIVE
    assert subscription.stripe_customer_id is None
    assert subscription.stripe_subscription_id is None
    
    # Verify it was saved to database
    db_subscription = db_session.query(Subscription).filter_by(org_id=org_id).first()
    assert db_subscription is not None
    assert db_subscription.plan_tier == PlanTier.FREE


@pytest.mark.asyncio
async def test_is_upgrade_logic(subscription_manager):
    """Test upgrade validation logic"""
    # Valid upgrades
    assert subscription_manager._is_upgrade(PlanTier.FREE, PlanTier.PRO) is True
    assert subscription_manager._is_upgrade(PlanTier.FREE, PlanTier.ENTERPRISE) is True
    assert subscription_manager._is_upgrade(PlanTier.PRO, PlanTier.ENTERPRISE) is True
    
    # Invalid upgrades (same tier or downgrade)
    assert subscription_manager._is_upgrade(PlanTier.PRO, PlanTier.FREE) is False
    assert subscription_manager._is_upgrade(PlanTier.PRO, PlanTier.PRO) is False
    assert subscription_manager._is_upgrade(PlanTier.ENTERPRISE, PlanTier.PRO) is False


@pytest.mark.asyncio
async def test_is_downgrade_logic(subscription_manager):
    """Test downgrade validation logic"""
    # Valid downgrades
    assert subscription_manager._is_downgrade(PlanTier.PRO, PlanTier.FREE) is True
    assert subscription_manager._is_downgrade(PlanTier.ENTERPRISE, PlanTier.FREE) is True
    assert subscription_manager._is_downgrade(PlanTier.ENTERPRISE, PlanTier.PRO) is True
    
    # Invalid downgrades (same tier or upgrade)
    assert subscription_manager._is_downgrade(PlanTier.FREE, PlanTier.PRO) is False
    assert subscription_manager._is_downgrade(PlanTier.PRO, PlanTier.PRO) is False
    assert subscription_manager._is_downgrade(PlanTier.PRO, PlanTier.ENTERPRISE) is False


@pytest.mark.asyncio
async def test_downgrade_scheduling(subscription_manager, db_session):
    """Test that downgrade is scheduled, not immediate"""
    org_id = uuid4()
    
    # Create a pro subscription
    subscription = Subscription(
        org_id=org_id,
        plan_tier=PlanTier.PRO,
        status=SubscriptionStatus.ACTIVE,
        stripe_subscription_id="sub_test123",
        current_period_start=datetime.utcnow(),
        current_period_end=datetime.utcnow()
    )
    db_session.add(subscription)
    db_session.commit()
    
    # Downgrade to free
    updated = await subscription_manager.downgrade_subscription(
        org_id=org_id,
        new_plan_tier=PlanTier.FREE
    )
    
    # Should still be on pro tier
    assert updated.plan_tier == PlanTier.PRO
    # But with scheduled downgrade
    assert updated.scheduled_plan_change == PlanTier.FREE
    assert updated.scheduled_change_date is not None
    assert updated.cancel_at_period_end is True


@pytest.mark.asyncio
async def test_cancel_subscription_scheduled(subscription_manager, db_session):
    """Test scheduled subscription cancellation"""
    org_id = uuid4()
    
    # Create a pro subscription
    subscription = Subscription(
        org_id=org_id,
        plan_tier=PlanTier.PRO,
        status=SubscriptionStatus.ACTIVE,
        stripe_subscription_id="sub_test123",
        current_period_start=datetime.utcnow(),
        current_period_end=datetime.utcnow()
    )
    db_session.add(subscription)
    db_session.commit()
    
    # Cancel (scheduled)
    updated = await subscription_manager.cancel_subscription(
        org_id=org_id,
        immediate=False
    )
    
    # Should still be on pro tier
    assert updated.plan_tier == PlanTier.PRO
    # But with scheduled cancellation
    assert updated.cancel_at_period_end is True
    assert updated.scheduled_plan_change == PlanTier.FREE


@pytest.mark.asyncio
async def test_cancel_subscription_immediate(subscription_manager, db_session):
    """Test immediate subscription cancellation"""
    org_id = uuid4()
    
    # Create a pro subscription
    subscription = Subscription(
        org_id=org_id,
        plan_tier=PlanTier.PRO,
        status=SubscriptionStatus.ACTIVE,
        stripe_subscription_id="sub_test123",
        current_period_start=datetime.utcnow(),
        current_period_end=datetime.utcnow()
    )
    db_session.add(subscription)
    db_session.commit()
    
    # Cancel immediately
    updated = await subscription_manager.cancel_subscription(
        org_id=org_id,
        immediate=True
    )
    
    # Should be downgraded to free immediately
    assert updated.plan_tier == PlanTier.FREE
    assert updated.status == SubscriptionStatus.CANCELED
    assert updated.stripe_subscription_id is None


@pytest.mark.asyncio
async def test_subscription_not_found_error(subscription_manager):
    """Test that appropriate error is raised when subscription not found"""
    org_id = uuid4()
    
    with pytest.raises(SubscriptionNotFoundError):
        await subscription_manager.upgrade_subscription(
            org_id=org_id,
            new_plan_tier=PlanTier.PRO
        )


@pytest.mark.asyncio
async def test_invalid_upgrade_error(subscription_manager, db_session):
    """Test that invalid upgrades are rejected"""
    org_id = uuid4()
    
    # Create an enterprise subscription
    subscription = Subscription(
        org_id=org_id,
        plan_tier=PlanTier.ENTERPRISE,
        status=SubscriptionStatus.ACTIVE
    )
    db_session.add(subscription)
    db_session.commit()
    
    # Try to "upgrade" to pro (invalid)
    with pytest.raises(InvalidUpgradeError):
        await subscription_manager.upgrade_subscription(
            org_id=org_id,
            new_plan_tier=PlanTier.PRO
        )


@pytest.mark.asyncio
async def test_invalid_downgrade_error(subscription_manager, db_session):
    """Test that invalid downgrades are rejected"""
    org_id = uuid4()
    
    # Create a free subscription
    subscription = Subscription(
        org_id=org_id,
        plan_tier=PlanTier.FREE,
        status=SubscriptionStatus.ACTIVE
    )
    db_session.add(subscription)
    db_session.commit()
    
    # Try to "downgrade" to pro (invalid)
    with pytest.raises(InvalidDowngradeError):
        await subscription_manager.downgrade_subscription(
            org_id=org_id,
            new_plan_tier=PlanTier.PRO
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
