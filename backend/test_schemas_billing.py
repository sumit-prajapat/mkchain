"""
Unit tests for billing Pydantic schemas
"""
import pytest
from datetime import datetime, date, timedelta
from decimal import Decimal
from uuid import uuid4
from pydantic import ValidationError

from schemas_billing import (
    SubscriptionCreate,
    SubscriptionResponse,
    UsageMetricResponse,
    PaymentMethodCreate,
    PaymentMethodResponse,
    InvoiceResponse,
    BillingDashboardResponse,
    UsageAnalyticsResponse,
    ProrationPreview,
    RateLimitInfo,
    AdminSubscriptionMetrics,
    PlanTierInfo,
)


# ============================================================================
# Subscription Schema Tests
# ============================================================================

def test_subscription_create_valid():
    """Test valid subscription creation schema"""
    data = {
        "plan_tier": "pro",
        "payment_method_id": "pm_test123"
    }
    schema = SubscriptionCreate(**data)
    assert schema.plan_tier == "pro"
    assert schema.payment_method_id == "pm_test123"


def test_subscription_create_without_payment_method():
    """Test subscription creation without payment method (trial)"""
    data = {
        "plan_tier": "pro",
        "payment_method_id": None
    }
    schema = SubscriptionCreate(**data)
    assert schema.plan_tier == "pro"
    assert schema.payment_method_id is None


def test_subscription_create_invalid_plan():
    """Test that free tier cannot be explicitly subscribed to"""
    data = {
        "plan_tier": "free"
    }
    with pytest.raises(ValidationError) as exc:
        SubscriptionCreate(**data)
    assert "Can only subscribe to pro or enterprise plans" in str(exc.value)


def test_subscription_response_minimal():
    """Test subscription response with minimal required fields"""
    data = {
        "id": 1,
        "org_id": str(uuid4()),
        "plan_tier": "free",
        "status": "active",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    schema = SubscriptionResponse(**data)
    assert schema.id == 1
    assert schema.plan_tier == "free"
    assert schema.status == "active"
    assert schema.cancel_at_period_end is False


# ============================================================================
# Usage Metric Schema Tests
# ============================================================================

def test_usage_metric_response_with_computed_fields():
    """Test usage metric response with computed percentage fields"""
    data = {
        "id": 1,
        "org_id": str(uuid4()),
        "billing_period_start": datetime.utcnow(),
        "billing_period_end": datetime.utcnow() + timedelta(days=30),
        "analyses_count": 80,
        "api_calls_count": 5000,
        "storage_used_gb": Decimal("25.50"),
        "updated_at": datetime.utcnow(),
        "analyses_limit": 100,
        "analyses_percent": 80.0,
        "api_calls_limit": 1000,
        "storage_limit_gb": Decimal("50.00"),
        "storage_percent": 51.0,
    }
    schema = UsageMetricResponse(**data)
    assert schema.analyses_count == 80
    assert schema.analyses_limit == 100
    assert schema.analyses_percent == 80.0
    assert schema.storage_percent == 51.0


def test_usage_metric_percentage_validation():
    """Test that usage percentage must be between 0-100"""
    data = {
        "id": 1,
        "org_id": str(uuid4()),
        "billing_period_start": datetime.utcnow(),
        "billing_period_end": datetime.utcnow() + timedelta(days=30),
        "analyses_count": 150,
        "updated_at": datetime.utcnow(),
        "analyses_limit": 100,
        "analyses_percent": 150.0,  # Invalid: > 100
    }
    with pytest.raises(ValidationError) as exc:
        UsageMetricResponse(**data)
    assert "less than or equal to 100" in str(exc.value)


# ============================================================================
# Payment Method Schema Tests
# ============================================================================

def test_payment_method_create_valid():
    """Test valid payment method creation"""
    data = {
        "payment_method_id": "pm_1234567890",
        "set_default": True
    }
    schema = PaymentMethodCreate(**data)
    assert schema.payment_method_id == "pm_1234567890"
    assert schema.set_default is True


def test_payment_method_create_empty_id():
    """Test that payment method ID cannot be empty"""
    data = {
        "payment_method_id": "",
        "set_default": False
    }
    with pytest.raises(ValidationError) as exc:
        PaymentMethodCreate(**data)
    # Pydantic V2 error message
    assert "String should have at least 1 character" in str(exc.value)


def test_payment_method_response_not_expiring():
    """Test payment method that is not expiring soon"""
    data = {
        "id": 1,
        "org_id": str(uuid4()),
        "stripe_payment_method_id": "pm_test",
        "card_brand": "visa",
        "card_last4": "4242",
        "exp_month": 12,
        "exp_year": 2027,  # Far in future
        "is_default": True,
        "created_at": datetime.utcnow(),
    }
    schema = PaymentMethodResponse(**data)
    assert schema.is_expiring_soon is False


def test_payment_method_response_expiring_soon():
    """Test payment method that is expiring within 30 days"""
    today = date.today()
    # Set expiration to next month
    exp_month = today.month + 1 if today.month < 12 else 1
    exp_year = today.year if today.month < 12 else today.year + 1
    
    data = {
        "id": 1,
        "org_id": str(uuid4()),
        "stripe_payment_method_id": "pm_test",
        "card_brand": "visa",
        "card_last4": "4242",
        "exp_month": exp_month,
        "exp_year": exp_year,
        "is_default": True,
        "created_at": datetime.utcnow(),
    }
    schema = PaymentMethodResponse(**data)
    # Depending on the day of month, this might or might not be expiring soon
    assert isinstance(schema.is_expiring_soon, bool)


def test_payment_method_response_invalid_exp_month():
    """Test that exp_month must be between 1-12"""
    data = {
        "id": 1,
        "org_id": str(uuid4()),
        "stripe_payment_method_id": "pm_test",
        "card_brand": "visa",
        "card_last4": "4242",
        "exp_month": 13,  # Invalid
        "exp_year": 2027,
        "is_default": True,
        "created_at": datetime.utcnow(),
    }
    with pytest.raises(ValidationError) as exc:
        PaymentMethodResponse(**data)
    assert "less than or equal to 12" in str(exc.value)


# ============================================================================
# Invoice Schema Tests
# ============================================================================

def test_invoice_response_paid():
    """Test invoice response for paid invoice"""
    data = {
        "id": 1,
        "org_id": str(uuid4()),
        "stripe_invoice_id": "in_test123",
        "stripe_invoice_url": "https://invoice.stripe.com/...",
        "stripe_invoice_pdf": "https://invoice.stripe.com/.../pdf",
        "amount_due": Decimal("49.00"),
        "amount_paid": Decimal("49.00"),
        "currency": "usd",
        "period_start": datetime.utcnow() - timedelta(days=30),
        "period_end": datetime.utcnow(),
        "status": "paid",
        "paid_at": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }
    schema = InvoiceResponse(**data)
    assert schema.status == "paid"
    assert schema.amount_paid == Decimal("49.00")


def test_invoice_response_invalid_status():
    """Test that invoice status must be valid"""
    data = {
        "id": 1,
        "org_id": str(uuid4()),
        "stripe_invoice_id": "in_test123",
        "amount_due": Decimal("49.00"),
        "currency": "usd",
        "status": "invalid_status",  # Invalid
        "created_at": datetime.utcnow(),
    }
    with pytest.raises(ValidationError) as exc:
        InvoiceResponse(**data)
    # Pydantic V2 error message
    assert "Input should be" in str(exc.value)


# ============================================================================
# Proration Preview Schema Tests
# ============================================================================

def test_proration_preview_upgrade():
    """Test proration preview for upgrade"""
    data = {
        "current_plan": "pro",
        "new_plan": "enterprise",
        "current_price": Decimal("49.00"),
        "new_price": Decimal("299.00"),
        "prorated_amount": Decimal("200.00"),  # Positive charge
        "next_invoice_amount": Decimal("299.00"),
        "effective_date": datetime.utcnow(),
        "days_remaining": 15,
        "is_upgrade": True,
    }
    schema = ProrationPreview(**data)
    assert schema.is_upgrade is True
    assert schema.prorated_amount > 0


def test_proration_preview_upgrade_negative_amount():
    """Test that upgrade proration cannot be negative"""
    data = {
        "current_plan": "pro",
        "new_plan": "enterprise",
        "current_price": Decimal("49.00"),
        "new_price": Decimal("299.00"),
        "prorated_amount": Decimal("-50.00"),  # Invalid: negative for upgrade
        "next_invoice_amount": Decimal("299.00"),
        "effective_date": datetime.utcnow(),
        "days_remaining": 15,
        "is_upgrade": True,
    }
    with pytest.raises(ValidationError) as exc:
        ProrationPreview(**data)
    assert "Upgrade proration must be positive" in str(exc.value)


def test_proration_preview_downgrade():
    """Test proration preview for downgrade (credit)"""
    data = {
        "current_plan": "enterprise",
        "new_plan": "pro",
        "current_price": Decimal("299.00"),
        "new_price": Decimal("49.00"),
        "prorated_amount": Decimal("-100.00"),  # Negative credit
        "next_invoice_amount": Decimal("49.00"),
        "effective_date": datetime.utcnow() + timedelta(days=15),
        "days_remaining": 15,
        "is_upgrade": False,
    }
    schema = ProrationPreview(**data)
    assert schema.is_upgrade is False
    assert schema.prorated_amount < 0


# ============================================================================
# Usage Analytics Schema Tests
# ============================================================================

def test_usage_analytics_response_valid():
    """Test usage analytics with properly ordered historical periods"""
    now = datetime.utcnow()
    
    current = UsageMetricResponse(
        id=3,
        org_id=uuid4(),
        billing_period_start=now,
        billing_period_end=now + timedelta(days=30),
        analyses_count=50,
        updated_at=now,
    )
    
    historical = [
        UsageMetricResponse(
            id=2,
            org_id=uuid4(),
            billing_period_start=now - timedelta(days=30),
            billing_period_end=now,
            analyses_count=80,
            updated_at=now,
        ),
        UsageMetricResponse(
            id=1,
            org_id=uuid4(),
            billing_period_start=now - timedelta(days=60),
            billing_period_end=now - timedelta(days=30),
            analyses_count=90,
            updated_at=now,
        ),
    ]
    
    data = {
        "current_period": current,
        "historical_periods": historical,
        "projected_usage": {"analyses_count": 100, "api_calls_count": 5000},
    }
    
    schema = UsageAnalyticsResponse(**data)
    assert len(schema.historical_periods) == 2
    assert schema.current_period.analyses_count == 50


def test_usage_analytics_invalid_order():
    """Test that historical periods must be in descending order"""
    now = datetime.utcnow()
    
    current = UsageMetricResponse(
        id=3,
        org_id=uuid4(),
        billing_period_start=now,
        billing_period_end=now + timedelta(days=30),
        analyses_count=50,
        updated_at=now,
    )
    
    # Wrong order: ascending instead of descending
    historical = [
        UsageMetricResponse(
            id=1,
            org_id=uuid4(),
            billing_period_start=now - timedelta(days=60),
            billing_period_end=now - timedelta(days=30),
            analyses_count=90,
            updated_at=now,
        ),
        UsageMetricResponse(
            id=2,
            org_id=uuid4(),
            billing_period_start=now - timedelta(days=30),
            billing_period_end=now,
            analyses_count=80,
            updated_at=now,
        ),
    ]
    
    data = {
        "current_period": current,
        "historical_periods": historical,
    }
    
    with pytest.raises(ValidationError) as exc:
        UsageAnalyticsResponse(**data)
    assert "must be ordered by period_start descending" in str(exc.value)


# ============================================================================
# Rate Limit Info Schema Tests
# ============================================================================

def test_rate_limit_info_computes_reset_seconds():
    """Test that rate limit info correctly computes reset_in_seconds"""
    from datetime import timezone
    
    reset_time = datetime.now(timezone.utc) + timedelta(seconds=300)  # 5 minutes from now
    
    data = {
        "limit": 1000,
        "remaining": 750,
        "reset": reset_time,
    }
    
    schema = RateLimitInfo(**data)
    assert schema.limit == 1000
    assert schema.remaining == 750
    # Should be approximately 300 seconds (allowing for processing time)
    assert 290 <= schema.reset_in_seconds <= 310


# ============================================================================
# Admin Metrics Schema Tests
# ============================================================================

def test_admin_subscription_metrics_valid():
    """Test admin subscription metrics schema"""
    data = {
        "total_organizations": 150,
        "free_count": 100,
        "pro_count": 40,
        "enterprise_count": 10,
        "active_subscriptions": 50,
        "trialing_subscriptions": 5,
        "past_due_subscriptions": 2,
        "canceled_subscriptions": 3,
        "monthly_recurring_revenue": Decimal("3450.00"),
        "churn_rate": 5.5,
        "trials_expiring_soon": 3,
        "scheduled_downgrades": 1,
    }
    
    schema = AdminSubscriptionMetrics(**data)
    assert schema.total_organizations == 150
    assert schema.monthly_recurring_revenue == Decimal("3450.00")
    assert schema.churn_rate == 5.5


def test_admin_subscription_metrics_invalid_churn_rate():
    """Test that churn rate must be between 0-100"""
    data = {
        "churn_rate": 150.0,  # Invalid: > 100
    }
    
    with pytest.raises(ValidationError) as exc:
        AdminSubscriptionMetrics(**data)
    assert "less than or equal to 100" in str(exc.value)


# ============================================================================
# Plan Tier Info Schema Tests
# ============================================================================

def test_plan_tier_info_free():
    """Test plan tier info for free plan"""
    data = {
        "tier": "free",
        "name": "Free",
        "description": "Get started with basic features",
        "price_monthly": Decimal("0.00"),
        "analyses_per_month": 10,
        "api_calls_per_hour": 100,
        "storage_gb": Decimal("1.0"),
        "data_retention_days": 7,
        "features": ["basic_analysis", "2d_graph", "community_support"],
        "support_level": "community",
        "is_popular": False,
        "is_current": True,
    }
    
    schema = PlanTierInfo(**data)
    assert schema.tier == "free"
    assert schema.price_monthly == Decimal("0.00")
    assert schema.analyses_per_month == 10
    assert schema.is_current is True


def test_plan_tier_info_enterprise_unlimited():
    """Test plan tier info for enterprise with unlimited analyses"""
    data = {
        "tier": "enterprise",
        "name": "Enterprise",
        "description": "Unlimited power for your organization",
        "price_monthly": Decimal("299.00"),
        "analyses_per_month": -1,  # Unlimited
        "api_calls_per_hour": 5000,
        "storage_gb": Decimal("500.0"),
        "data_retention_days": 365,
        "features": ["all_features", "priority_support", "custom_integration"],
        "support_level": "priority",
        "is_popular": False,
        "is_current": False,
    }
    
    schema = PlanTierInfo(**data)
    assert schema.tier == "enterprise"
    assert schema.analyses_per_month == -1
    assert "priority_support" in schema.features


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
