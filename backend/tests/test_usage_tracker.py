"""
Unit tests for UsageTracker service
"""
import pytest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import JSON

from models import Base
from models_organization import Organization
from models_billing import (
    Subscription, UsageMetric, SubscriptionStatus, PlanTier, PLAN_LIMITS, WebhookEvent
)
from services.usage_tracker import (
    UsageTracker, UsageTrackerError, InvalidMetricTypeError,
    WARNING_THRESHOLD, EXCEEDED_THRESHOLD
)


# Test database setup
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture
def db_session():
    """Create a test database session"""
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    
    # Replace JSONB with JSON for SQLite compatibility
    @event.listens_for(WebhookEvent.__table__, "before_create")
    def replace_jsonb_with_json(target, connection, **kw):
        for col in target.columns:
            if isinstance(col.type, JSONB):
                col.type = JSON()
    
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    
    yield session
    
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def usage_tracker(db_session):
    """Create a UsageTracker instance"""
    return UsageTracker(db_session)


@pytest.fixture
def test_org_with_subscription(db_session):
    """Create a test organization with a subscription"""
    org_id = uuid4()
    owner_id = uuid4()
    
    # Create organization
    org = Organization(
        id=org_id,
        name="Test Organization",
        slug="test-org",
        owner_id=owner_id
    )
    db_session.add(org)
    
    # Create subscription
    period_start = datetime.now(timezone.utc)
    period_end = period_start + timedelta(days=30)
    
    subscription = Subscription(
        org_id=org_id,
        plan_tier=PlanTier.PRO,
        status=SubscriptionStatus.ACTIVE,
        current_period_start=period_start,
        current_period_end=period_end
    )
    db_session.add(subscription)
    db_session.commit()
    
    return {
        'org_id': org_id,
        'owner_id': owner_id,
        'subscription': subscription,
        'period_start': period_start,
        'period_end': period_end
    }


class TestUsageTrackerIncrement:
    """Tests for increment_usage method"""
    
    @pytest.mark.asyncio
    async def test_increment_analysis_creates_new_usage_metric(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test that incrementing analysis usage creates a new usage metric if none exists"""
        org_id = test_org_with_subscription['org_id']
        
        # Increment usage
        await usage_tracker.increment_usage(org_id, "analysis", 1.0)
        
        # Verify usage metric was created
        usage_metric = db_session.query(UsageMetric).filter(
            UsageMetric.org_id == org_id
        ).first()
        
        assert usage_metric is not None
        assert usage_metric.analyses_count == 1
        assert usage_metric.api_calls_count == 0
        assert float(usage_metric.storage_used_gb) == 0.0
    
    @pytest.mark.asyncio
    async def test_increment_analysis_updates_existing_metric(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test that incrementing analysis usage updates existing metric"""
        org_id = test_org_with_subscription['org_id']
        
        # First increment
        await usage_tracker.increment_usage(org_id, "analysis", 1.0)
        
        # Second increment
        await usage_tracker.increment_usage(org_id, "analysis", 1.0)
        
        # Verify count is 2
        usage_metric = db_session.query(UsageMetric).filter(
            UsageMetric.org_id == org_id
        ).first()
        
        assert usage_metric.analyses_count == 2
    
    @pytest.mark.asyncio
    async def test_increment_api_call_usage(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test incrementing API call usage"""
        org_id = test_org_with_subscription['org_id']
        
        await usage_tracker.increment_usage(org_id, "api_call", 1.0)
        
        usage_metric = db_session.query(UsageMetric).filter(
            UsageMetric.org_id == org_id
        ).first()
        
        assert usage_metric.api_calls_count == 1
        assert usage_metric.analyses_count == 0
    
    @pytest.mark.asyncio
    async def test_increment_storage_usage(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test incrementing storage usage"""
        org_id = test_org_with_subscription['org_id']
        
        await usage_tracker.increment_usage(org_id, "storage_gb", 2.5)
        
        usage_metric = db_session.query(UsageMetric).filter(
            UsageMetric.org_id == org_id
        ).first()
        
        assert float(usage_metric.storage_used_gb) == 2.5
        assert usage_metric.analyses_count == 0
    
    @pytest.mark.asyncio
    async def test_increment_invalid_metric_type_raises_error(
        self, usage_tracker, test_org_with_subscription
    ):
        """Test that invalid metric type raises InvalidMetricTypeError"""
        org_id = test_org_with_subscription['org_id']
        
        with pytest.raises(InvalidMetricTypeError):
            await usage_tracker.increment_usage(org_id, "invalid_metric", 1.0)
    
    @pytest.mark.asyncio
    async def test_increment_usage_without_subscription_logs_warning(
        self, usage_tracker, db_session
    ):
        """Test that incrementing usage without subscription logs warning and skips"""
        org_id = uuid4()
        owner_id = uuid4()
        
        # Create org without subscription
        org = Organization(
            id=org_id,
            name="No Subscription Org",
            slug="no-sub-org",
            owner_id=owner_id
        )
        db_session.add(org)
        db_session.commit()
        
        # Should not raise error, just log warning
        await usage_tracker.increment_usage(org_id, "analysis", 1.0)
        
        # Verify no usage metric was created
        usage_metric = db_session.query(UsageMetric).filter(
            UsageMetric.org_id == org_id
        ).first()
        
        assert usage_metric is None
    
    @pytest.mark.asyncio
    async def test_increment_usage_updates_timestamp(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test that incrementing usage updates the updated_at timestamp"""
        org_id = test_org_with_subscription['org_id']
        
        # First increment
        await usage_tracker.increment_usage(org_id, "analysis", 1.0)
        
        usage_metric = db_session.query(UsageMetric).filter(
            UsageMetric.org_id == org_id
        ).first()
        first_update_time = usage_metric.updated_at
        
        # Wait a tiny bit and increment again
        import time
        time.sleep(0.01)
        
        await usage_tracker.increment_usage(org_id, "analysis", 1.0)
        
        db_session.refresh(usage_metric)
        second_update_time = usage_metric.updated_at
        
        assert second_update_time > first_update_time


class TestUsageTrackerCurrentUsage:
    """Tests for get_current_usage method"""
    
    @pytest.mark.asyncio
    async def test_get_current_usage_returns_existing_metric(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test retrieving current usage metric"""
        org_id = test_org_with_subscription['org_id']
        
        # Create usage
        await usage_tracker.increment_usage(org_id, "analysis", 5.0)
        await usage_tracker.increment_usage(org_id, "api_call", 10.0)
        
        # Get current usage
        usage_metric = await usage_tracker.get_current_usage(org_id)
        
        assert usage_metric is not None
        assert usage_metric.analyses_count == 5
        assert usage_metric.api_calls_count == 10
    
    @pytest.mark.asyncio
    async def test_get_current_usage_creates_empty_metric_if_none_exists(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test that get_current_usage creates empty metric if none exists"""
        org_id = test_org_with_subscription['org_id']
        
        # Get usage without any prior increments
        usage_metric = await usage_tracker.get_current_usage(org_id)
        
        assert usage_metric is not None
        assert usage_metric.analyses_count == 0
        assert usage_metric.api_calls_count == 0
        assert float(usage_metric.storage_used_gb) == 0.0
    
    @pytest.mark.asyncio
    async def test_get_current_usage_returns_none_without_subscription(
        self, usage_tracker, db_session
    ):
        """Test that get_current_usage returns None without active subscription"""
        org_id = uuid4()
        owner_id = uuid4()
        
        # Create org without subscription
        org = Organization(
            id=org_id,
            name="No Subscription Org",
            slug="no-sub-org",
            owner_id=owner_id
        )
        db_session.add(org)
        db_session.commit()
        
        usage_metric = await usage_tracker.get_current_usage(org_id)
        
        assert usage_metric is None


class TestUsageTrackerHistory:
    """Tests for get_usage_history method"""
    
    @pytest.mark.asyncio
    async def test_get_usage_history_returns_ordered_list(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test that usage history returns metrics ordered by period_start descending"""
        org_id = test_org_with_subscription['org_id']
        
        # Create usage metrics for multiple periods
        for i in range(3):
            period_start = datetime.now(timezone.utc) - timedelta(days=30 * i)
            period_end = period_start + timedelta(days=30)
            
            usage_metric = UsageMetric(
                org_id=org_id,
                billing_period_start=period_start,
                billing_period_end=period_end,
                analyses_count=i + 1,
                api_calls_count=(i + 1) * 10,
                storage_used_gb=Decimal(str((i + 1) * 1.5))
            )
            db_session.add(usage_metric)
        
        db_session.commit()
        
        # Get history
        history = await usage_tracker.get_usage_history(org_id, periods=3)
        
        assert len(history) == 3
        # Should be ordered descending (most recent first)
        assert history[0].analyses_count == 1  # Most recent (i=0)
        assert history[1].analyses_count == 2  # i=1
        assert history[2].analyses_count == 3  # i=2
    
    @pytest.mark.asyncio
    async def test_get_usage_history_limits_periods(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test that usage history respects the periods limit"""
        org_id = test_org_with_subscription['org_id']
        
        # Create 15 usage metrics
        for i in range(15):
            period_start = datetime.now(timezone.utc) - timedelta(days=30 * i)
            period_end = period_start + timedelta(days=30)
            
            usage_metric = UsageMetric(
                org_id=org_id,
                billing_period_start=period_start,
                billing_period_end=period_end,
                analyses_count=i + 1,
                api_calls_count=0,
                storage_used_gb=Decimal('0.0')
            )
            db_session.add(usage_metric)
        
        db_session.commit()
        
        # Get only last 5 periods
        history = await usage_tracker.get_usage_history(org_id, periods=5)
        
        assert len(history) == 5
    
    @pytest.mark.asyncio
    async def test_get_usage_history_returns_empty_list_for_no_metrics(
        self, usage_tracker, test_org_with_subscription
    ):
        """Test that usage history returns empty list when no metrics exist"""
        org_id = test_org_with_subscription['org_id']
        
        history = await usage_tracker.get_usage_history(org_id)
        
        assert history == []


class TestUsageTrackerRollover:
    """Tests for roll_over_period method"""
    
    @pytest.mark.asyncio
    async def test_roll_over_period_creates_new_metric(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test that rolling over period creates new usage metric"""
        org_id = test_org_with_subscription['org_id']
        
        # Create usage in current period
        await usage_tracker.increment_usage(org_id, "analysis", 10.0)
        
        # Roll over to new period
        new_period_start = datetime.now(timezone.utc) + timedelta(days=30)
        new_period_end = new_period_start + timedelta(days=30)
        
        await usage_tracker.roll_over_period(org_id, new_period_start, new_period_end)
        
        # Verify new metric exists with zero counters
        new_metric = db_session.query(UsageMetric).filter(
            UsageMetric.org_id == org_id,
            UsageMetric.billing_period_start == new_period_start
        ).first()
        
        assert new_metric is not None
        assert new_metric.analyses_count == 0
        assert new_metric.api_calls_count == 0
        assert float(new_metric.storage_used_gb) == 0.0
    
    @pytest.mark.asyncio
    async def test_roll_over_period_preserves_previous_metric(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test that rolling over period preserves previous period's metrics"""
        org_id = test_org_with_subscription['org_id']
        period_start = test_org_with_subscription['period_start']
        
        # Create usage in current period
        await usage_tracker.increment_usage(org_id, "analysis", 10.0)
        
        # Roll over to new period
        new_period_start = datetime.now(timezone.utc) + timedelta(days=30)
        new_period_end = new_period_start + timedelta(days=30)
        
        await usage_tracker.roll_over_period(org_id, new_period_start, new_period_end)
        
        # Verify old metric still exists with original values
        old_metric = db_session.query(UsageMetric).filter(
            UsageMetric.org_id == org_id,
            UsageMetric.billing_period_start == period_start
        ).first()
        
        assert old_metric is not None
        assert old_metric.analyses_count == 10
    
    @pytest.mark.asyncio
    async def test_roll_over_period_skips_if_already_exists(
        self, usage_tracker, test_org_with_subscription, db_session
    ):
        """Test that rolling over period doesn't create duplicate if already exists"""
        org_id = test_org_with_subscription['org_id']
        
        new_period_start = datetime.now(timezone.utc) + timedelta(days=30)
        new_period_end = new_period_start + timedelta(days=30)
        
        # Roll over once
        await usage_tracker.roll_over_period(org_id, new_period_start, new_period_end)
        
        # Try to roll over again with same period
        await usage_tracker.roll_over_period(org_id, new_period_start, new_period_end)
        
        # Verify only one metric exists for this period
        metrics = db_session.query(UsageMetric).filter(
            UsageMetric.org_id == org_id,
            UsageMetric.billing_period_start == new_period_start
        ).all()
        
        assert len(metrics) == 1


class TestUsageTrackerThresholdEvents:
    """Tests for warning and exceeded event emission"""
    
    @pytest.mark.asyncio
    async def test_warning_event_emitted_at_80_percent(
        self, usage_tracker, test_org_with_subscription, db_session, caplog
    ):
        """Test that warning event is emitted when usage reaches 80%"""
        org_id = test_org_with_subscription['org_id']
        
        # PRO plan has 100 analyses per month
        # 80% is 80 analyses
        
        # Increment to 79 (just below threshold)
        for _ in range(79):
            await usage_tracker.increment_usage(org_id, "analysis", 1.0)
        
        # Clear any previous logs
        caplog.clear()
        
        # Increment to 80 (should trigger warning)
        await usage_tracker.increment_usage(org_id, "analysis", 1.0)
        
        # Check that warning was logged
        assert any("[USAGE_WARNING]" in record.message for record in caplog.records)
    
    @pytest.mark.asyncio
    async def test_exceeded_event_emitted_at_100_percent(
        self, usage_tracker, test_org_with_subscription, db_session, caplog
    ):
        """Test that exceeded event is emitted when usage reaches 100%"""
        org_id = test_org_with_subscription['org_id']
        
        # PRO plan has 100 analyses per month
        
        # Increment to 99 (just below limit)
        for _ in range(99):
            await usage_tracker.increment_usage(org_id, "analysis", 1.0)
        
        # Clear any previous logs
        caplog.clear()
        
        # Increment to 100 (should trigger exceeded event)
        await usage_tracker.increment_usage(org_id, "analysis", 1.0)
        
        # Check that exceeded event was logged
        assert any("[USAGE_EXCEEDED]" in record.message for record in caplog.records)
    
    @pytest.mark.asyncio
    async def test_no_threshold_events_for_unlimited_quota(
        self, usage_tracker, db_session, caplog
    ):
        """Test that no threshold events are emitted for unlimited quotas (enterprise)"""
        org_id = uuid4()
        owner_id = uuid4()
        
        # Create org with enterprise plan (unlimited analyses)
        org = Organization(
            id=org_id,
            name="Enterprise Org",
            slug="enterprise-org",
            owner_id=owner_id
        )
        db_session.add(org)
        
        period_start = datetime.now(timezone.utc)
        period_end = period_start + timedelta(days=30)
        
        subscription = Subscription(
            org_id=org_id,
            plan_tier=PlanTier.ENTERPRISE,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=period_start,
            current_period_end=period_end
        )
        db_session.add(subscription)
        db_session.commit()
        
        caplog.clear()
        
        # Increment way beyond what would be a limit
        for _ in range(1000):
            await usage_tracker.increment_usage(org_id, "analysis", 1.0)
        
        # No warning or exceeded events should be emitted
        assert not any("[USAGE_WARNING]" in record.message for record in caplog.records)
        assert not any("[USAGE_EXCEEDED]" in record.message for record in caplog.records)


class TestUsageTrackerMetricLimits:
    """Tests for _get_metric_limit helper method"""
    
    def test_get_metric_limit_for_free_tier(self, usage_tracker):
        """Test getting metric limits for free tier"""
        assert usage_tracker._get_metric_limit(PlanTier.FREE, "analysis") == 10
        assert usage_tracker._get_metric_limit(PlanTier.FREE, "api_call") == 100
        assert usage_tracker._get_metric_limit(PlanTier.FREE, "storage_gb") == 1
    
    def test_get_metric_limit_for_pro_tier(self, usage_tracker):
        """Test getting metric limits for pro tier"""
        assert usage_tracker._get_metric_limit(PlanTier.PRO, "analysis") == 100
        assert usage_tracker._get_metric_limit(PlanTier.PRO, "api_call") == 1000
        assert usage_tracker._get_metric_limit(PlanTier.PRO, "storage_gb") == 50
    
    def test_get_metric_limit_for_enterprise_tier(self, usage_tracker):
        """Test getting metric limits for enterprise tier"""
        assert usage_tracker._get_metric_limit(PlanTier.ENTERPRISE, "analysis") == -1  # Unlimited
        assert usage_tracker._get_metric_limit(PlanTier.ENTERPRISE, "api_call") == 5000
        assert usage_tracker._get_metric_limit(PlanTier.ENTERPRISE, "storage_gb") == 500
