"""
Subscription & Billing Models
SQLAlchemy ORM models for subscription management, payment processing, and usage tracking
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, DECIMAL, CheckConstraint, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from models import Base


class Subscription(Base):
    """Subscription plan and billing status for organizations"""
    __tablename__ = "subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(
        UUID(as_uuid=True), 
        ForeignKey("organizations.id", ondelete="CASCADE"), 
        nullable=False, 
        unique=True, 
        index=True
    )
    plan_tier = Column(String(20), nullable=False)
    
    # Stripe references
    stripe_customer_id = Column(String(255), unique=True, index=True)
    stripe_subscription_id = Column(String(255), unique=True, index=True)
    stripe_price_id = Column(String(255))
    
    # Subscription state
    status = Column(String(20), nullable=False)
    current_period_start = Column(DateTime(timezone=True))
    current_period_end = Column(DateTime(timezone=True))
    trial_end = Column(DateTime(timezone=True), index=True)
    grace_period_end = Column(DateTime(timezone=True), index=True)
    
    # Scheduled changes
    scheduled_plan_change = Column(String(20))
    scheduled_change_date = Column(DateTime(timezone=True), index=True)
    cancel_at_period_end = Column(Boolean, default=False)
    
    # Trial eligibility tracking
    has_used_trial_pro = Column(Boolean, default=False)
    has_used_trial_ent = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    organization = relationship("Organization", back_populates="subscription")
    
    __table_args__ = (
        CheckConstraint(
            "plan_tier IN ('free', 'pro', 'enterprise')",
            name="check_subscription_plan_tier"
        ),
        CheckConstraint(
            "status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid')",
            name="check_subscription_status"
        ),
    )
    
    def __repr__(self):
        return f"<Subscription {self.org_id} {self.plan_tier} {self.status}>"
    
    def is_active(self) -> bool:
        """Check if subscription is currently active"""
        return self.status in ('active', 'trialing')
    
    def is_in_grace_period(self) -> bool:
        """Check if subscription is in grace period"""
        return self.status == 'past_due' and self.grace_period_end and self.grace_period_end > datetime.utcnow()
    
    def is_trial_eligible(self, target_plan: str) -> bool:
        """Check if organization is eligible for trial on target plan"""
        if target_plan == 'pro':
            return not self.has_used_trial_pro
        elif target_plan == 'enterprise':
            return not self.has_used_trial_ent
        return False


class PaymentMethod(Base):
    """Payment methods stored in Stripe (non-sensitive data only)"""
    __tablename__ = "payment_methods"
    
    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(
        UUID(as_uuid=True), 
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, 
        index=True
    )
    
    # Stripe reference
    stripe_payment_method_id = Column(String(255), nullable=False, unique=True, index=True)
    
    # Non-sensitive card info
    card_brand = Column(String(50))
    card_last4 = Column(String(4))
    exp_month = Column(Integer)
    exp_year = Column(Integer)
    
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    
    # Relationships
    organization = relationship("Organization", back_populates="payment_methods")
    
    __table_args__ = (
        Index('idx_payment_methods_default', 'org_id', 'is_default', postgresql_where=Column('is_default') == True),
    )
    
    def __repr__(self):
        return f"<PaymentMethod {self.card_brand} ****{self.card_last4}>"
    
    def is_expiring_soon(self) -> bool:
        """Check if card expires within 30 days"""
        if not self.exp_month or not self.exp_year:
            return False
        
        from datetime import datetime, timedelta
        expiry_date = datetime(self.exp_year, self.exp_month, 1)
        return (expiry_date - datetime.now()).days <= 30


class UsageMetric(Base):
    """Resource consumption tracking per billing period"""
    __tablename__ = "usage_metrics"
    
    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(
        UUID(as_uuid=True), 
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, 
        index=True
    )
    
    # Billing period
    billing_period_start = Column(DateTime(timezone=True), nullable=False, index=True)
    billing_period_end = Column(DateTime(timezone=True), nullable=False)
    
    # Usage counters
    analyses_count = Column(Integer, default=0, nullable=False)
    api_calls_count = Column(Integer, default=0, nullable=False)
    storage_used_gb = Column(DECIMAL(10, 2), default=0.00, nullable=False)
    
    # Timestamp
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    organization = relationship("Organization", backref="usage_metrics")
    
    __table_args__ = (
        UniqueConstraint('org_id', 'billing_period_start', name='uq_usage_org_period'),
        Index('idx_usage_metrics_org_period', 'org_id', 'billing_period_start'),
        CheckConstraint('analyses_count >= 0', name='check_analyses_count_positive'),
        CheckConstraint('api_calls_count >= 0', name='check_api_calls_count_positive'),
        CheckConstraint('storage_used_gb >= 0', name='check_storage_used_positive'),
    )
    
    def __repr__(self):
        return f"<UsageMetric {self.org_id} analyses={self.analyses_count} api_calls={self.api_calls_count}>"
    
    def get_usage_percentage(self, limit: int, metric_name: str) -> float:
        """Calculate percentage of quota consumed"""
        if limit == -1:  # Unlimited
            return 0.0
        
        if metric_name == 'analyses':
            current = self.analyses_count
        elif metric_name == 'api_calls':
            current = self.api_calls_count
        elif metric_name == 'storage':
            current = float(self.storage_used_gb)
        else:
            return 0.0
        
        return (current / limit * 100) if limit > 0 else 0.0


class Invoice(Base):
    """Billing invoices and payment history"""
    __tablename__ = "invoices"
    
    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(
        UUID(as_uuid=True), 
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, 
        index=True
    )
    
    # Stripe reference
    stripe_invoice_id = Column(String(255), nullable=False, unique=True, index=True)
    stripe_invoice_url = Column(Text)
    stripe_invoice_pdf = Column(Text)
    
    # Invoice details
    amount_due = Column(DECIMAL(10, 2), nullable=False)
    amount_paid = Column(DECIMAL(10, 2))
    currency = Column(String(3), default='usd')
    
    # Billing period
    period_start = Column(DateTime(timezone=True))
    period_end = Column(DateTime(timezone=True))
    
    # Status
    status = Column(String(20))
    
    # Timestamps
    paid_at = Column(DateTime(timezone=True), index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    
    # Relationships
    organization = relationship("Organization", backref="invoices")
    
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'open', 'paid', 'void', 'uncollectible')",
            name="check_invoice_status"
        ),
    )
    
    def __repr__(self):
        return f"<Invoice {self.stripe_invoice_id} {self.amount_due} {self.status}>"
    
    def is_paid(self) -> bool:
        """Check if invoice is paid"""
        return self.status == 'paid'


class WebhookEvent(Base):
    """Stripe webhook events for idempotency and audit trail"""
    __tablename__ = "webhook_events"
    
    id = Column(Integer, primary_key=True, index=True)
    stripe_event_id = Column(String(255), nullable=False, unique=True, index=True)
    event_type = Column(String(100), nullable=False, index=True)
    
    # Event data
    payload = Column(JSONB, nullable=False)
    
    # Processing state
    processed_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    processing_result = Column(String(20))
    error_message = Column(Text)
    
    __table_args__ = (
        CheckConstraint(
            "processing_result IN ('success', 'failure', 'skipped')",
            name="check_webhook_processing_result"
        ),
        CheckConstraint(
            "(processing_result = 'failure' AND error_message IS NOT NULL) OR (processing_result != 'failure')",
            name="check_webhook_error_message"
        ),
        Index('idx_webhook_events_result', 'processing_result'),
    )
    
    def __repr__(self):
        return f"<WebhookEvent {self.stripe_event_id} {self.event_type} {self.processing_result}>"


class RateLimit(Base):
    """API rate limiting counters per organization"""
    __tablename__ = "rate_limits"
    
    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(
        UUID(as_uuid=True), 
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # Time window
    window_start = Column(DateTime(timezone=True), nullable=False)
    window_end = Column(DateTime(timezone=True), nullable=False, index=True)
    
    # Counter
    request_count = Column(Integer, default=0, nullable=False)
    
    __table_args__ = (
        UniqueConstraint('org_id', 'window_start', name='uq_rate_limit_org_window'),
        Index('idx_rate_limits_org_window', 'org_id', 'window_start'),
        CheckConstraint('request_count >= 0', name='check_request_count_positive'),
    )
    
    def __repr__(self):
        return f"<RateLimit {self.org_id} {self.request_count}/{self.window_start}>"


class RetentionCleanupLog(Base):
    """Data retention cleanup history"""
    __tablename__ = "retention_cleanup_log"
    
    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(
        UUID(as_uuid=True), 
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, 
        index=True
    )
    
    # Cleanup details
    analyses_deleted = Column(Integer, default=0, nullable=False)
    data_deleted_gb = Column(DECIMAL(10, 2), default=0.00, nullable=False)
    
    # Timestamp
    cleanup_date = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    
    __table_args__ = (
        CheckConstraint('analyses_deleted >= 0', name='check_analyses_deleted_positive'),
        CheckConstraint('data_deleted_gb >= 0', name='check_data_deleted_positive'),
    )
    
    def __repr__(self):
        return f"<RetentionCleanupLog {self.org_id} deleted={self.analyses_deleted} on {self.cleanup_date}>"


# Plan tier configuration constants
class PlanTier:
    """Subscription plan tier definitions"""
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"
    
    ALL_TIERS = [FREE, PRO, ENTERPRISE]
    PAID_TIERS = [PRO, ENTERPRISE]


# Plan limits configuration
PLAN_LIMITS = {
    PlanTier.FREE: {
        "analyses_per_month": 10,
        "api_calls_per_hour": 100,
        "storage_gb": 1.0,
        "retention_days": 7,
        "features": ["basic_analysis", "2d_graph", "community_support"],
        "price_monthly": 0,
    },
    PlanTier.PRO: {
        "analyses_per_month": 100,
        "api_calls_per_hour": 1000,
        "storage_gb": 50.0,
        "retention_days": 30,
        "features": [
            "basic_analysis", "2d_graph", "3d_graph", 
            "ai_summary", "pdf_report", "comparison",
            "email_support"
        ],
        "price_monthly": 49.00,
    },
    PlanTier.ENTERPRISE: {
        "analyses_per_month": -1,  # Unlimited
        "api_calls_per_hour": 5000,
        "storage_gb": 500.0,
        "retention_days": 365,
        "features": ["*"],  # All features
        "price_monthly": 299.00,
    },
}


# Subscription status constants
class SubscriptionStatus:
    """Subscription status values"""
    ACTIVE = "active"
    TRIALING = "trialing"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    UNPAID = "unpaid"
    
    ALL_STATUSES = [ACTIVE, TRIALING, PAST_DUE, CANCELED, UNPAID]


# Invoice status constants
class InvoiceStatus:
    """Invoice status values"""
    DRAFT = "draft"
    OPEN = "open"
    PAID = "paid"
    VOID = "void"
    UNCOLLECTIBLE = "uncollectible"
    
    ALL_STATUSES = [DRAFT, OPEN, PAID, VOID, UNCOLLECTIBLE]


def get_plan_limit(plan_tier: str, limit_name: str) -> any:
    """Get a specific limit for a plan tier"""
    plan_config = PLAN_LIMITS.get(plan_tier, PLAN_LIMITS[PlanTier.FREE])
    return plan_config.get(limit_name)


def has_feature_access(plan_tier: str, feature: str) -> bool:
    """Check if a plan tier includes a specific feature"""
    plan_config = PLAN_LIMITS.get(plan_tier, PLAN_LIMITS[PlanTier.FREE])
    features = plan_config.get("features", [])
    
    # Enterprise has all features
    if "*" in features:
        return True
    
    return feature in features
