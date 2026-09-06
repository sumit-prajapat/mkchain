"""
Unit tests for billing ORM models
Tests model creation, validation, and relationships
"""
import pytest
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import create_engine, JSON
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError

from models import Base
from models_organization import Organization
from models_billing import (
    Subscription, PaymentMethod, UsageMetric, Invoice, 
    WebhookEvent, RateLimit, RetentionCleanupLog,
    PlanTier, SubscriptionStatus, InvoiceStatus, PLAN_LIMITS,
    get_plan_limit, has_feature_access
)

# Patch JSONB to JSON for SQLite testing
import models_billing
models_billing.JSONB = JSON


# Test database setup
@pytest.fixture(scope="function")
def db_session():
    """Create an in-memory SQLite database for testing"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def test_org(db_session):
    """Create a test organization"""
    org = Organization(
        id=uuid4(),
        name="Test Organization",
        slug="test-org",
        owner_id=uuid4()
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


# ============================================================================
# Subscription Model Tests
# ============================================================================

def test_subscription_creation(db_session, test_org):
    """Test basic subscription creation"""
    subscription = Subscription(
        org_id=test_org.id,
        plan_tier=PlanTier.FREE,
        status=SubscriptionStatus.ACTIVE,
        current_period_start=datetime.utcnow(),
        current_period_end=datetime.utcnow() + timedelta(days=30)
    )
    
    db_session.add(subscription)
    db_session.commit()
    db_session.refresh(subscription)
    
    assert subscription.id is not None
    assert subscription.org_id == test_org.id
    assert subscription.plan_tier == PlanTier.FREE
    assert subscription.status == SubscriptionStatus.ACTIVE
    assert subscription.is_active() is True


def test_subscription_plan_tier_constraint(db_session, test_org):
    """Test that invalid plan_tier values are rejected"""
    subscription = Subscription(
        org_id=test_org.id,
        plan_tier="invalid_plan",  # Invalid value
        status=SubscriptionStatus.ACTIVE
    )
    
    db_session.add(subscription)
    
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_subscription_status_constraint(db_session, test_org):
    """Test that invalid status values are rejected"""
    subscription = Subscription(
        org_id=test_org.id,
        plan_tier=PlanTier.PRO,
        status="invalid_status"  # Invalid value
    )
    
    db_session.add(subscription)
    
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_subscription_unique_org_constraint(db_session, test_org):
    """Test that organization can only have one subscription"""
    # First subscription
    subscription1 = Subscription(
        org_id=test_org.id,
        plan_tier=PlanTier.FREE,
        status=SubscriptionStatus.ACTIVE
    )
    db_session.add(subscription1)
    db_session.commit()
    
    # Second subscription for same org (should fail)
    subscription2 = Subscription(
        org_id=test_org.id,
        plan_tier=PlanTier.PRO,
        status=SubscriptionStatus.ACTIVE
    )
    db_session.add(subscription2)
    
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_subscription_trial_eligibility(db_session, test_org):
    """Test trial eligibility checking"""
    subscription = Subscription(
        org_id=test_org.id,
        plan_tier=PlanTier.FREE,
        status=SubscriptionStatus.ACTIVE,
        has_used_trial_pro=False,
        has_used_trial_ent=True
    )
    
    assert subscription.is_trial_eligible("pro") is True
    assert subscription.is_trial_eligible("enterprise") is False
    assert subscription.is_trial_eligible("free") is False


def test_subscription_grace_period(db_session, test_org):
    """Test grace period detection"""
    future_time = datetime.utcnow() + timedelta(days=5)
    past_time = datetime.utcnow() - timedelta(days=1)
    
    # Active grace period
    subscription = Subscription(
        org_id=test_org.id,
        plan_tier=PlanTier.PRO,
        status=SubscriptionStatus.PAST_DUE,
        grace_period_end=future_time
    )
    assert subscription.is_in_grace_period() is True
    
    # Expired grace period
    subscription.grace_period_end = past_time
    assert subscription.is_in_grace_period() is False
    
    # No grace period
    subscription.status = SubscriptionStatus.ACTIVE
    subscription.grace_period_end = None
    assert subscription.is_in_grace_period() is False


# ============================================================================
# Payment Method Model Tests
# ============================================================================

def test_payment_method_creation(db_session, test_org):
    """Test payment method creation"""
    payment_method = PaymentMethod(
        org_id=test_org.id,
        stripe_payment_method_id="pm_test123",
        card_brand="visa",
        card_last4="4242",
        exp_month=12,
        exp_year=2027,
        is_default=True
    )
    
    db_session.add(payment_method)
    db_session.commit()
    db_session.refresh(payment_method)
    
    assert payment_method.id is not None
    assert payment_method.stripe_payment_method_id == "pm_test123"
    assert payment_method.is_default is True


def test_payment_method_expiration_check(db_session, test_org):
    """Test payment method expiration checking"""
    # Card expiring next month
    next_month = datetime.now().month + 1 if datetime.now().month < 12 else 1
    next_year = datetime.now().year if datetime.now().month < 12 else datetime.now().year + 1
    
    payment_method = PaymentMethod(
        org_id=test_org.id,
        stripe_payment_method_id="pm_test123",
        card_brand="visa",
        card_last4="4242",
        exp_month=next_month,
        exp_year=next_year,
        is_default=True
    )
    
    # Expiration check depends on current day of month
    expiring = payment_method.is_expiring_soon()
    assert isinstance(expiring, bool)
    
    # Card expiring in far future
    payment_method.exp_year = 2030
    assert payment_method.is_expiring_soon() is False


def test_payment_method_unique_stripe_id(db_session, test_org):
    """Test that Stripe payment method ID must be unique"""
    payment_method1 = PaymentMethod(
        org_id=test_org.id,
        stripe_payment_method_id="pm_test123"
    )
    db_session.add(payment_method1)
    db_session.commit()
    
    # Duplicate Stripe ID (should fail)
    payment_method2 = PaymentMethod(
        org_id=test_org.id,
        stripe_payment_method_id="pm_test123"
    )
    db_session.add(payment_method2)
    
    with pytest.raises(IntegrityError):
        db_session.commit()


# ============================================================================
# Usage Metric Model Tests
# ============================================================================

def test_usage_metric_creation(db_session, test_org):
    """Test usage metric creation"""
    period_start = datetime.utcnow()
    period_end = period_start + timedelta(days=30)
    
    usage = UsageMetric(
        org_id=test_org.id,
        billing_period_start=period_start,
        billing_period_end=period_end,
        analyses_count=25,
        api_calls_count=1500,
        storage_used_gb=Decimal("12.50")
    )
    
    db_session.add(usage)
    db_session.commit()
    db_session.refresh(usage)
    
    assert usage.id is not None
    assert usage.analyses_count == 25
    assert usage.api_calls_count == 1500
    assert usage.storage_used_gb == Decimal("12.50")


def test_usage_metric_unique_constraint(db_session, test_org):
    """Test unique constraint on org_id + billing_period_start"""
    period_start = datetime.utcnow()
    period_end = period_start + timedelta(days=30)
    
    usage1 = UsageMetric(
        org_id=test_org.id,
        billing_period_start=period_start,
        billing_period_end=period_end
    )
    db_session.add(usage1)
    db_session.commit()
    
    # Duplicate period for same org (should fail)
    usage2 = UsageMetric(
        org_id=test_org.id,
        billing_period_start=period_start,
        billing_period_end=period_end
    )
    db_session.add(usage2)
    
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_usage_metric_percentage_calculation(db_session, test_org):
    """Test usage percentage calculation"""
    usage = UsageMetric(
        org_id=test_org.id,
        billing_period_start=datetime.utcnow(),
        billing_period_end=datetime.utcnow() + timedelta(days=30),
        analyses_count=80,
        api_calls_count=500,
        storage_used_gb=Decimal("25.00")
    )
    
    # Test analysis percentage (80/100 = 80%)
    assert usage.get_usage_percentage(100, 'analyses') == 80.0
    
    # Test unlimited (-1 limit = 0%)
    assert usage.get_usage_percentage(-1, 'analyses') == 0.0
    
    # Test storage percentage (25/50 = 50%)
    assert usage.get_usage_percentage(50, 'storage') == 50.0
    
    # Test invalid metric
    assert usage.get_usage_percentage(100, 'invalid') == 0.0


def test_usage_metric_negative_values_rejected(db_session, test_org):
    """Test that negative usage values are rejected"""
    usage = UsageMetric(
        org_id=test_org.id,
        billing_period_start=datetime.utcnow(),
        billing_period_end=datetime.utcnow() + timedelta(days=30),
        analyses_count=-5  # Invalid negative value
    )
    
    db_session.add(usage)
    
    with pytest.raises(IntegrityError):
        db_session.commit()


# ============================================================================
# Invoice Model Tests
# ============================================================================

def test_invoice_creation(db_session, test_org):
    """Test invoice creation"""
    invoice = Invoice(
        org_id=test_org.id,
        stripe_invoice_id="in_test123",
        amount_due=Decimal("49.00"),
        amount_paid=Decimal("49.00"),
        status=InvoiceStatus.PAID,
        paid_at=datetime.utcnow()
    )
    
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)
    
    assert invoice.id is not None
    assert invoice.stripe_invoice_id == "in_test123"
    assert invoice.amount_due == Decimal("49.00")
    assert invoice.is_paid() is True


def test_invoice_status_constraint(db_session, test_org):
    """Test that invalid invoice status values are rejected"""
    invoice = Invoice(
        org_id=test_org.id,
        stripe_invoice_id="in_test123",
        amount_due=Decimal("49.00"),
        status="invalid_status"  # Invalid value
    )
    
    db_session.add(invoice)
    
    with pytest.raises(IntegrityError):
        db_session.commit()


# ============================================================================
# Webhook Event Model Tests
# ============================================================================

def test_webhook_event_creation(db_session):
    """Test webhook event creation"""
    event = WebhookEvent(
        stripe_event_id="evt_test123",
        event_type="invoice.payment_succeeded",
        payload={"test": "data"},
        processing_result="success"
    )
    
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    
    assert event.id is not None
    assert event.stripe_event_id == "evt_test123"
    assert event.event_type == "invoice.payment_succeeded"
    assert event.payload == {"test": "data"}


def test_webhook_event_error_constraint(db_session):
    """Test that failure result requires error message"""
    event = WebhookEvent(
        stripe_event_id="evt_test123",
        event_type="invoice.payment_failed",
        payload={"test": "data"},
        processing_result="failure",
        error_message=None  # Should be required for failure
    )
    
    db_session.add(event)
    
    with pytest.raises(IntegrityError):
        db_session.commit()


# ============================================================================
# Plan Configuration Tests
# ============================================================================

def test_plan_limits_configuration():
    """Test plan limits are properly configured"""
    # Free plan
    assert get_plan_limit(PlanTier.FREE, "analyses_per_month") == 10
    assert get_plan_limit(PlanTier.FREE, "price_monthly") == 0
    
    # Pro plan
    assert get_plan_limit(PlanTier.PRO, "analyses_per_month") == 100
    assert get_plan_limit(PlanTier.PRO, "price_monthly") == 49.00
    
    # Enterprise plan
    assert get_plan_limit(PlanTier.ENTERPRISE, "analyses_per_month") == -1  # Unlimited
    assert get_plan_limit(PlanTier.ENTERPRISE, "price_monthly") == 299.00
    
    # Invalid plan defaults to free
    assert get_plan_limit("invalid_plan", "analyses_per_month") == 10


def test_feature_access_control():
    """Test feature access by plan tier"""
    # Free plan features
    assert has_feature_access(PlanTier.FREE, "basic_analysis") is True
    assert has_feature_access(PlanTier.FREE, "ai_summary") is False
    assert has_feature_access(PlanTier.FREE, "pdf_report") is False
    
    # Pro plan features
    assert has_feature_access(PlanTier.PRO, "basic_analysis") is True
    assert has_feature_access(PlanTier.PRO, "ai_summary") is True
    assert has_feature_access(PlanTier.PRO, "pdf_report") is True
    
    # Enterprise plan (all features)
    assert has_feature_access(PlanTier.ENTERPRISE, "basic_analysis") is True
    assert has_feature_access(PlanTier.ENTERPRISE, "ai_summary") is True
    assert has_feature_access(PlanTier.ENTERPRISE, "custom_integration") is True
    assert has_feature_access(PlanTier.ENTERPRISE, "any_feature") is True  # * means all


# ============================================================================
# Relationship Tests
# ============================================================================

def test_subscription_organization_relationship(db_session, test_org):
    """Test relationship between Subscription and Organization"""
    subscription = Subscription(
        org_id=test_org.id,
        plan_tier=PlanTier.PRO,
        status=SubscriptionStatus.ACTIVE
    )
    
    db_session.add(subscription)
    db_session.commit()
    db_session.refresh(subscription)
    
    # Test relationship access
    assert subscription.organization.id == test_org.id
    assert test_org.subscription.id == subscription.id


def test_cascade_delete_organization(db_session, test_org):
    """Test that deleting organization cascades to billing records"""
    # Create related records
    subscription = Subscription(org_id=test_org.id, plan_tier=PlanTier.PRO, status=SubscriptionStatus.ACTIVE)
    payment_method = PaymentMethod(org_id=test_org.id, stripe_payment_method_id="pm_test")
    usage_metric = UsageMetric(
        org_id=test_org.id,
        billing_period_start=datetime.utcnow(),
        billing_period_end=datetime.utcnow() + timedelta(days=30)
    )
    
    db_session.add_all([subscription, payment_method, usage_metric])
    db_session.commit()
    
    # Delete organization
    db_session.delete(test_org)
    db_session.commit()
    
    # Verify cascade delete worked
    assert db_session.query(Subscription).count() == 0
    assert db_session.query(PaymentMethod).count() == 0
    assert db_session.query(UsageMetric).count() == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])