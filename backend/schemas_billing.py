"""
      Pydantic Schemas for Subscription and Billing System
"""
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from typing import Optional, Literal, List
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal


# ============================================================================
# Subscription Schemas
# ============================================================================

class SubscriptionBase(BaseModel):
    """Base schema for subscription"""
    plan_tier: Literal["free", "pro", "enterprise"]
    status: Literal["active", "trialing", "past_due", "canceled", "unpaid"]


class SubscriptionCreate(BaseModel):
    """Schema for creating a subscription"""
    plan_tier: Literal["free", "pro", "enterprise"]
    payment_method_id: Optional[str] = Field(
        None,
        description="Stripe payment method ID (optional for trial, required for immediate activation)"
    )
    
    @field_validator('plan_tier')
    @classmethod
    def validate_paid_plan(cls, v):
        """Validate that only paid plans can be explicitly subscribed to"""
        if v not in ['pro', 'enterprise']:
            raise ValueError('Can only subscribe to pro or enterprise plans')
        return v


class SubscriptionUpdate(BaseModel):
    """Schema for updating a subscription (plan changes)"""
    new_plan_tier: Literal["free", "pro", "enterprise"]
    payment_method_id: Optional[str] = Field(
        None,
        description="Required when upgrading without existing payment method"
    )


class SubscriptionResponse(SubscriptionBase):
    """Schema for subscription response"""
    id: int
    org_id: UUID
    
    # Stripe references
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    stripe_price_id: Optional[str] = None
    
    # Subscription state
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    trial_end: Optional[datetime] = None
    grace_period_end: Optional[datetime] = None
    
    # Scheduled changes
    scheduled_plan_change: Optional[str] = None
    scheduled_change_date: Optional[datetime] = None
    cancel_at_period_end: bool = False
    
    # Trial eligibility
    has_used_trial_pro: bool = False
    has_used_trial_ent: bool = False
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Usage Metric Schemas
# ============================================================================

class UsageMetricResponse(BaseModel):
    """Schema for usage metrics response"""
    id: int
    org_id: UUID
    
    # Billing period
    billing_period_start: datetime
    billing_period_end: datetime
    
    # Usage counters
    analyses_count: int = 0
    api_calls_count: int = 0
    storage_used_gb: Decimal = Field(default=Decimal("0.00"))
    
    # Timestamp
    updated_at: datetime
    
    # Computed fields (set by service layer)
    analyses_limit: Optional[int] = Field(
        None,
        description="Maximum analyses allowed for current plan (-1 for unlimited)"
    )
    analyses_percent: Optional[float] = Field(
        None,
        description="Percentage of analysis quota consumed (0-100)",
        ge=0,
        le=100
    )
    api_calls_limit: Optional[int] = Field(
        None,
        description="Hourly API call rate limit"
    )
    storage_limit_gb: Optional[Decimal] = Field(
        None,
        description="Storage limit in GB for current plan"
    )
    storage_percent: Optional[float] = Field(
        None,
        description="Percentage of storage quota consumed (0-100)",
        ge=0,
        le=100
    )
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Payment Method Schemas
# ============================================================================

class PaymentMethodCreate(BaseModel):
    """Schema for adding a payment method"""
    payment_method_id: str = Field(
        ...,
        description="Stripe payment method ID from Stripe Elements",
        min_length=1
    )
    set_default: bool = Field(
        True,
        description="Whether to set this as the default payment method"
    )


class PaymentMethodResponse(BaseModel):
    """Schema for payment method response"""
    id: int
    org_id: UUID
    
    # Stripe reference
    stripe_payment_method_id: str
    
    # Non-sensitive card info
    card_brand: Optional[str] = None
    card_last4: Optional[str] = None
    exp_month: Optional[int] = Field(None, ge=1, le=12)
    exp_year: Optional[int] = Field(None, ge=2024)
    
    is_default: bool = False
    created_at: datetime
    
    # Computed field
    is_expiring_soon: bool = Field(
        default=False,
        description="True if card expires within 30 days"
    )
    
    @model_validator(mode='after')
    def compute_expiring_soon(self) -> 'PaymentMethodResponse':
        """Compute whether the card is expiring within 30 days"""
        exp_month = self.exp_month
        exp_year = self.exp_year
        
        if exp_month and exp_year:
            from calendar import monthrange
            
            # Last day of expiration month
            last_day = monthrange(exp_year, exp_month)[1]
            exp_date = date(exp_year, exp_month, last_day)
            today = date.today()
            
            # Check if expiration is within 30 days
            days_until_expiration = (exp_date - today).days
            self.is_expiring_soon = days_until_expiration <= 30
        
        return self
    
    model_config = ConfigDict(from_attributes=True)


class PaymentMethodUpdate(BaseModel):
    """Schema for updating payment method (setting default)"""
    set_default: bool = Field(
        True,
        description="Set this payment method as default"
    )


# ============================================================================
# Invoice Schemas
# ============================================================================

class InvoiceResponse(BaseModel):
    """Schema for invoice response"""
    id: int
    org_id: UUID
    
    # Stripe reference
    stripe_invoice_id: str
    stripe_invoice_url: Optional[str] = None
    stripe_invoice_pdf: Optional[str] = None
    
    # Invoice details
    amount_due: Decimal = Field(default=Decimal("0.00"))
    amount_paid: Optional[Decimal] = None
    currency: str = "usd"
    
    # Billing period
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    
    # Status
    status: Literal["draft", "open", "paid", "void", "uncollectible"]
    
    # Timestamps
    paid_at: Optional[datetime] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class InvoiceListResponse(BaseModel):
    """Schema for invoice list response with pagination"""
    invoices: List[InvoiceResponse]
    total: int
    page: int = 1
    page_size: int = 20
    has_more: bool = False


class InvoiceFilterParams(BaseModel):
    """Schema for invoice filtering parameters"""
    status: Optional[Literal["draft", "open", "paid", "void", "uncollectible"]] = None
    start_date: Optional[datetime] = Field(
        None,
        description="Filter invoices created after this date"
    )
    end_date: Optional[datetime] = Field(
        None,
        description="Filter invoices created before this date"
    )
    page: int = Field(1, ge=1, description="Page number")
    page_size: int = Field(20, ge=1, le=100, description="Items per page")


# ============================================================================
# Billing Dashboard Schema
# ============================================================================

class BillingDashboardResponse(BaseModel):
    """Comprehensive billing dashboard data"""
    subscription: SubscriptionResponse
    current_usage: UsageMetricResponse
    payment_methods: List[PaymentMethodResponse] = []
    recent_invoices: List[InvoiceResponse] = []
    
    # Additional computed fields
    days_until_renewal: Optional[int] = Field(
        None,
        description="Days until next billing cycle (null if no active subscription)"
    )
    next_invoice_amount: Optional[Decimal] = Field(
        None,
        description="Expected amount for next invoice"
    )


# ============================================================================
# Usage Analytics Schema
# ============================================================================

class UsageAnalyticsResponse(BaseModel):
    """Historical usage analytics"""
    current_period: UsageMetricResponse
    historical_periods: List[UsageMetricResponse] = Field(
        default_factory=list,
        description="Historical usage metrics ordered by period_start descending"
    )
    projected_usage: dict = Field(
        default_factory=dict,
        description="Projected end-of-period usage based on daily rate"
    )
    
    @field_validator('historical_periods')
    @classmethod
    def validate_historical_order(cls, v):
        """Ensure historical periods are ordered correctly"""
        if len(v) > 1:
            # Verify descending order by period_start
            for i in range(len(v) - 1):
                if v[i].billing_period_start < v[i + 1].billing_period_start:
                    raise ValueError('Historical periods must be ordered by period_start descending')
        return v


# ============================================================================
# Proration Preview Schema
# ============================================================================

class ProrationPreview(BaseModel):
    """Preview of proration calculation for plan change"""
    current_plan: str
    new_plan: str
    current_price: Decimal = Field(default=Decimal("0.00"))
    new_price: Decimal = Field(default=Decimal("0.00"))
    prorated_amount: Decimal = Field(
        default=Decimal("0.00"),
        description="Amount to charge/credit (positive for charge, negative for credit)"
    )
    next_invoice_amount: Decimal = Field(
        default=Decimal("0.00"),
        description="Expected amount for next full billing cycle"
    )
    effective_date: datetime = Field(
        description="When the plan change will take effect"
    )
    days_remaining: int = Field(
        ge=0,
        description="Days remaining in current billing cycle"
    )
    is_upgrade: bool = Field(
        description="True if this is an upgrade (immediate), False if downgrade (scheduled)"
    )
    
    @model_validator(mode='after')
    def validate_proration_sign(self) -> 'ProrationPreview':
        """Ensure proration amount has correct sign"""
        if self.is_upgrade:
            # Upgrades should have positive proration (charge)
            if self.prorated_amount < 0:
                raise ValueError('Upgrade proration must be positive (charge)')
        return self


# ============================================================================
# Subscription Cancellation Schema
# ============================================================================

class SubscriptionCancelRequest(BaseModel):
    """Schema for subscription cancellation request"""
    immediate: bool = Field(
        False,
        description="If True, cancel immediately; if False, cancel at period end"
    )
    feedback: Optional[str] = Field(
        None,
        max_length=1000,
        description="Optional feedback about cancellation reason"
    )


class SubscriptionCancelResponse(BaseModel):
    """Schema for subscription cancellation response"""
    subscription: SubscriptionResponse
    canceled_immediately: bool
    cancellation_date: datetime
    message: str = Field(
        description="Human-readable message about the cancellation"
    )


# ============================================================================
# Webhook Event Schema
# ============================================================================

class WebhookEventResponse(BaseModel):
    """Schema for webhook event response (admin/debugging)"""
    id: int
    stripe_event_id: str
    event_type: str
    payload: dict
    processed_at: datetime
    processing_result: Literal["success", "failure", "skipped"]
    error_message: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Rate Limit Schema
# ============================================================================

class RateLimitInfo(BaseModel):
    """Schema for rate limit information"""
    limit: int = Field(description="Maximum requests allowed in window")
    remaining: int = Field(ge=0, description="Requests remaining in current window")
    reset: datetime = Field(description="When the rate limit window resets")
    reset_in_seconds: int = Field(default=0, ge=0, description="Seconds until reset")
    
    @model_validator(mode='after')
    def compute_reset_seconds(self) -> 'RateLimitInfo':
        """Compute seconds until reset"""
        reset_time = self.reset
        if reset_time:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            if reset_time.tzinfo is None:
                # Assume UTC if no timezone
                reset_time = reset_time.replace(tzinfo=timezone.utc)
            delta = (reset_time - now).total_seconds()
            self.reset_in_seconds = max(0, int(delta))
        return self


# ============================================================================
# Admin Dashboard Schema
# ============================================================================

class AdminSubscriptionMetrics(BaseModel):
    """Aggregate subscription metrics for admin dashboard"""
    total_organizations: int = 0
    
    # Organizations by plan
    free_count: int = 0
    pro_count: int = 0
    enterprise_count: int = 0
    
    # Subscriptions by status
    active_subscriptions: int = 0
    trialing_subscriptions: int = 0
    past_due_subscriptions: int = 0
    canceled_subscriptions: int = 0
    
    # Revenue metrics
    monthly_recurring_revenue: Decimal = Field(
        default=Decimal("0.00"),
        description="Total MRR from active paid subscriptions"
    )
    
    # Churn metrics
    churn_rate: float = Field(
        default=0.0,
        ge=0,
        le=100,
        description="Churn rate as percentage (cancellations / active)"
    )
    
    # Upcoming events
    trials_expiring_soon: int = Field(
        default=0,
        description="Trials expiring within 3 days"
    )
    scheduled_downgrades: int = Field(
        default=0,
        description="Number of scheduled downgrades"
    )
    
    # Timestamp
    computed_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When these metrics were computed"
    )


class AdminUsageMetrics(BaseModel):
    """Aggregate usage metrics for admin dashboard"""
    total_analyses_this_month: int = 0
    total_api_calls_this_month: int = 0
    total_storage_used_gb: Decimal = Field(default=Decimal("0.00"))
    
    # Averages
    avg_analyses_per_org: float = 0.0
    avg_storage_per_org_gb: float = 0.0
    
    # Usage distribution
    orgs_near_quota: int = Field(
        default=0,
        description="Organizations using >80% of any quota"
    )
    orgs_at_quota: int = Field(
        default=0,
        description="Organizations at 100% of any quota"
    )


# ============================================================================
# Notification Schemas
# ============================================================================

class BillingNotification(BaseModel):
    """Schema for billing-related notifications"""
    notification_type: Literal[
        "trial_ending",
        "payment_failed",
        "quota_warning",
        "quota_exceeded",
        "subscription_renewed",
        "downgrade_scheduled",
        "payment_method_expiring"
    ]
    title: str
    message: str
    severity: Literal["info", "warning", "error"] = "info"
    action_url: Optional[str] = None
    action_text: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Plan Information Schema
# ============================================================================

class PlanTierInfo(BaseModel):
    """Information about a plan tier (for frontend display)"""
    tier: Literal["free", "pro", "enterprise"]
    name: str
    description: str
    price_monthly: Decimal
    
    # Limits
    analyses_per_month: int = Field(description="-1 for unlimited")
    api_calls_per_hour: int
    storage_gb: Decimal
    data_retention_days: int
    
    # Features
    features: List[str] = Field(
        description="List of feature names included in this plan"
    )
    support_level: str
    
    # Flags
    is_popular: bool = False
    is_current: bool = Field(
        default=False,
        description="True if this is the user's current plan"
    )


class AvailablePlans(BaseModel):
    """List of available plans with current plan indicator"""
    plans: List[PlanTierInfo]
    current_plan: str
