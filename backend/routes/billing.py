"""
Billing API Routes
Handles subscription billing, payment methods, usage, and invoices
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import List
import logging

from middleware.organization import get_db, require_role
from middleware.auth_helper import get_current_user_id
from schemas_billing import (
    PaymentMethodCreate,
    PaymentMethodResponse,
    PaymentMethodUpdate,
    SubscriptionCreate,
    SubscriptionUpdate,
    SubscriptionResponse,
    ProrationPreview,
    PlanTierInfo,
    AvailablePlans,
    InvoiceResponse,
    InvoiceListResponse,
    UsageMetricResponse,
    UsageAnalyticsResponse,
)
from models_billing import PaymentMethod, Subscription, PlanTier, get_plan_limit, has_feature_access, PLAN_LIMITS
from services.payment_processor import get_payment_processor, PaymentProcessorError, StripeAPIError
from services.usage_tracker import get_usage_tracker, UsageTrackerError
from services.subscription_manager import (
    get_subscription_manager,
    SubscriptionManagerError,
    InvalidUpgradeError,
    InvalidDowngradeError,
    TrialNotEligibleError,
    SubscriptionNotFoundError
)
from services.invoice_generator import get_invoice_generator, InvoiceGeneratorError, InvoiceNotFoundError
from datetime import datetime
from typing import Optional
from fastapi.responses import RedirectResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])


# ============================================================================
# Payment Method Routes
# ============================================================================

@router.post("/payment-methods", response_model=PaymentMethodResponse, status_code=status.HTTP_201_CREATED)
async def add_payment_method(
    payment_data: PaymentMethodCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Add a payment method to the organization.
    
    Requires owner or admin role.
    Securely stores payment method in Stripe and saves reference in database.
    
    **Requirements: 14.1, 14.2**
    """
    # Require owner or admin role
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin"])(request, user_id, db)
    
    # Extract org_id from request.state (set by auth/organization middleware)
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get organization's subscription to get stripe_customer_id
        subscription = db.query(Subscription).filter(
            Subscription.org_id == org_id
        ).first()
        
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found for organization"
            )
        
        if not subscription.stripe_customer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization does not have a Stripe customer. Please subscribe to a plan first."
            )
        
        # Add payment method via Stripe
        payment_processor = get_payment_processor()
        stripe_pm = await payment_processor.add_payment_method(
            customer_id=subscription.stripe_customer_id,
            payment_method_id=payment_data.payment_method_id,
            set_default=payment_data.set_default
        )
        
        # If setting as default, update other payment methods
        if payment_data.set_default:
            db.query(PaymentMethod).filter(
                PaymentMethod.org_id == org_id
            ).update({"is_default": False})
        
        # Create payment method record in database
        payment_method = PaymentMethod(
            org_id=org_id,
            stripe_payment_method_id=stripe_pm['id'],
            card_brand=stripe_pm['card']['brand'] if stripe_pm['card'] else None,
            card_last4=stripe_pm['card']['last4'] if stripe_pm['card'] else None,
            exp_month=stripe_pm['card']['exp_month'] if stripe_pm['card'] else None,
            exp_year=stripe_pm['card']['exp_year'] if stripe_pm['card'] else None,
            is_default=payment_data.set_default,
            created_at=datetime.utcnow()
        )
        
        db.add(payment_method)
        db.commit()
        db.refresh(payment_method)
        
        logger.info(f"Added payment method for org {org_id}")
        return payment_method
        
    except StripeAPIError as e:
        logger.error(f"Stripe API error adding payment method: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to add payment method: {str(e)}"
        )
    except PaymentProcessorError as e:
        logger.error(f"Payment processor error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment processing error: {str(e)}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding payment method: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add payment method"
        )


@router.get("/payment-methods", response_model=List[PaymentMethodResponse])
async def list_payment_methods(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    List all payment methods for the organization.
    
    Requires owner or admin role.
    Returns non-sensitive payment method information only (last 4 digits, brand, expiration).
    
    **Requirements: 14.3**
    """
    # Require owner or admin role
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Query payment methods from database
        payment_methods = db.query(PaymentMethod).filter(
            PaymentMethod.org_id == org_id
        ).order_by(
            PaymentMethod.is_default.desc(),
            PaymentMethod.created_at.desc()
        ).all()
        
        logger.info(f"Listed {len(payment_methods)} payment methods for org {org_id}")
        return payment_methods
        
    except Exception as e:
        logger.error(f"Error listing payment methods: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list payment methods"
        )


@router.delete("/payment-methods/{payment_method_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_payment_method(
    payment_method_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Remove a payment method from the organization.
    
    Requires owner or admin role.
    Cannot remove the only payment method on an active paid subscription.
    
    **Requirements: 14.5, 14.6**
    """
    # Require owner or admin role
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get payment method
        payment_method = db.query(PaymentMethod).filter(
            PaymentMethod.id == payment_method_id,
            PaymentMethod.org_id == org_id
        ).first()
        
        if not payment_method:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment method not found"
            )
        
        # Check subscription status
        subscription = db.query(Subscription).filter(
            Subscription.org_id == org_id
        ).first()
        
        # Count remaining payment methods
        payment_method_count = db.query(PaymentMethod).filter(
            PaymentMethod.org_id == org_id
        ).count()
        
        # Validate cannot remove only payment method on active paid subscription
        if payment_method_count == 1:
            if subscription and subscription.plan_tier in ['pro', 'enterprise']:
                if subscription.is_active() or subscription.is_in_grace_period():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot remove the only payment method on an active subscription. Please add another payment method first or cancel your subscription."
                    )
        
        # Detach from Stripe
        payment_processor = get_payment_processor()
        await payment_processor.detach_payment_method(payment_method.stripe_payment_method_id)
        
        # Delete from database
        db.delete(payment_method)
        db.commit()
        
        logger.info(f"Removed payment method {payment_method_id} for org {org_id}")
        return None
        
    except HTTPException:
        raise
    except StripeAPIError as e:
        logger.error(f"Stripe API error removing payment method: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to remove payment method: {str(e)}"
        )
    except PaymentProcessorError as e:
        logger.error(f"Payment processor error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment processing error: {str(e)}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing payment method: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove payment method"
        )


@router.put("/payment-methods/{payment_method_id}/default", response_model=PaymentMethodResponse)
async def set_default_payment_method(
    payment_method_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Set a payment method as the default for the organization.
    
    Requires owner or admin role.
    Updates the default payment method in both Stripe and the database.
    
    **Requirements: 14.4**
    """
    # Require owner or admin role
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get payment method
        payment_method = db.query(PaymentMethod).filter(
            PaymentMethod.id == payment_method_id,
            PaymentMethod.org_id == org_id
        ).first()
        
        if not payment_method:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment method not found"
            )
        
        # Get subscription to get stripe_customer_id
        subscription = db.query(Subscription).filter(
            Subscription.org_id == org_id
        ).first()
        
        if not subscription or not subscription.stripe_customer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization does not have a Stripe customer"
            )
        
        # Update default payment method in Stripe
        payment_processor = get_payment_processor()
        await payment_processor.add_payment_method(
            customer_id=subscription.stripe_customer_id,
            payment_method_id=payment_method.stripe_payment_method_id,
            set_default=True
        )
        
        # Update in database: set all to non-default, then set this one as default
        db.query(PaymentMethod).filter(
            PaymentMethod.org_id == org_id
        ).update({"is_default": False})
        
        payment_method.is_default = True
        db.commit()
        db.refresh(payment_method)
        
        logger.info(f"Set payment method {payment_method_id} as default for org {org_id}")
        return payment_method
        
    except HTTPException:
        raise
    except StripeAPIError as e:
        logger.error(f"Stripe API error setting default payment method: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to set default payment method: {str(e)}"
        )
    except PaymentProcessorError as e:
        logger.error(f"Payment processor error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment processing error: {str(e)}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error setting default payment method: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to set default payment method"
        )


# ============================================================================
# Subscription Management Routes
# ============================================================================

@router.post("/subscriptions", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    subscription_data: SubscriptionCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Create a new subscription for the organization.
    
    Requires owner role.
    Creates a subscription to a paid plan (pro or enterprise).
    Includes 14-day trial if eligible. If payment_method_id is not provided,
    starts with trial; otherwise, activates immediately after trial.
    
    **Requirements: 1.1-1.7, 3.1-3.5**
    """
    # Require owner role (only owners can create subscriptions)
    user_id = get_current_user_id(request)
    await require_role(["owner"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get subscription manager
        payment_processor = get_payment_processor()
        sub_manager = get_subscription_manager(db, payment_processor)
        
        # Create subscription
        subscription = await sub_manager.create_subscription(
            org_id=org_id,
            plan_tier=subscription_data.plan_tier,
            payment_method_id=subscription_data.payment_method_id
        )
        
        logger.info(f"Created subscription for org {org_id}: {subscription_data.plan_tier}")
        return subscription
        
    except TrialNotEligibleError as e:
        logger.warning(f"Trial not eligible for org {org_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except SubscriptionManagerError as e:
        logger.error(f"Subscription manager error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except StripeAPIError as e:
        logger.error(f"Stripe API error creating subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create subscription: {str(e)}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create subscription"
        )


@router.get("/subscriptions", response_model=SubscriptionResponse)
async def get_current_subscription(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get the current subscription for the organization.
    
    Requires owner or admin role.
    Returns subscription details including plan tier, status, billing dates, and trial information.
    
    **Requirements: 1.6, 1.7**
    """
    # Require owner or admin role
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Query subscription
        subscription = db.query(Subscription).filter(
            Subscription.org_id == org_id
        ).first()
        
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found for organization"
            )
        
        logger.info(f"Retrieved subscription for org {org_id}")
        return subscription
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve subscription"
        )


@router.put("/subscriptions", response_model=SubscriptionResponse)
async def update_subscription(
    subscription_update: SubscriptionUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Update subscription plan (upgrade or downgrade).
    
    Requires owner role.
    
    - Upgrades (to higher tier): Take effect immediately with prorated charges
    - Downgrades (to lower tier): Scheduled for end of current billing period
    
    **Requirements: 6.1-6.7**
    """
    # Require owner role
    user_id = get_current_user_id(request)
    await require_role(["owner"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get subscription manager
        payment_processor = get_payment_processor()
        sub_manager = get_subscription_manager(db, payment_processor)
        
        # Get current subscription
        current_subscription = db.query(Subscription).filter(
            Subscription.org_id == org_id
        ).first()
        
        if not current_subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found"
            )
        
        # Determine if upgrade or downgrade
        current_tier = current_subscription.plan_tier
        new_tier = subscription_update.new_plan_tier
        
        # Can't change to same tier
        if current_tier == new_tier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Already subscribed to {new_tier} plan"
            )
        
        # Determine if upgrade or downgrade based on tier hierarchy
        tier_order = {"free": 0, "pro": 1, "enterprise": 2}
        is_upgrade = tier_order.get(new_tier, 0) > tier_order.get(current_tier, 0)
        
        if is_upgrade:
            # Upgrade: immediate with proration
            subscription = await sub_manager.upgrade_subscription(
                org_id=org_id,
                new_plan_tier=new_tier,
                payment_method_id=subscription_update.payment_method_id
            )
            logger.info(f"Upgraded subscription for org {org_id}: {current_tier} -> {new_tier}")
        else:
            # Downgrade: scheduled for period end
            subscription = await sub_manager.downgrade_subscription(
                org_id=org_id,
                new_plan_tier=new_tier
            )
            logger.info(f"Scheduled downgrade for org {org_id}: {current_tier} -> {new_tier} at period end")
        
        return subscription
        
    except InvalidUpgradeError as e:
        logger.warning(f"Invalid upgrade for org {org_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except InvalidDowngradeError as e:
        logger.warning(f"Invalid downgrade for org {org_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except SubscriptionManagerError as e:
        logger.error(f"Subscription manager error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except StripeAPIError as e:
        logger.error(f"Stripe API error updating subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update subscription: {str(e)}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update subscription"
        )


@router.delete("/subscriptions", status_code=status.HTTP_200_OK)
async def cancel_subscription(
    request: Request,
    immediate: bool = False,
    db: Session = Depends(get_db)
):
    """
    Cancel the organization's subscription.
    
    Requires owner role.
    
    - By default, cancellation is scheduled for the end of the current billing period
    - If immediate=True, cancels immediately and downgrades to free tier
    
    **Requirements: 11.1-11.6**
    """
    # Require owner role
    user_id = get_current_user_id(request)
    await require_role(["owner"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get subscription manager
        payment_processor = get_payment_processor()
        sub_manager = get_subscription_manager(db, payment_processor)
        
        # Cancel subscription
        subscription = await sub_manager.cancel_subscription(
            org_id=org_id,
            immediate=immediate
        )
        
        if immediate:
            message = "Subscription canceled immediately. Your account has been downgraded to the free plan."
        else:
            cancel_date = subscription.scheduled_change_date or subscription.current_period_end
            message = f"Subscription will be canceled at the end of your billing period ({cancel_date.strftime('%Y-%m-%d')}). You'll retain access until then."
        
        logger.info(f"Canceled subscription for org {org_id}, immediate={immediate}")
        
        return {
            "subscription": subscription,
            "canceled_immediately": immediate,
            "message": message
        }
        
    except SubscriptionNotFoundError as e:
        logger.warning(f"Subscription not found for org {org_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except SubscriptionManagerError as e:
        logger.error(f"Subscription manager error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except StripeAPIError as e:
        logger.error(f"Stripe API error canceling subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to cancel subscription: {str(e)}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error canceling subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel subscription"
        )


@router.get("/plans", response_model=AvailablePlans)
async def list_available_plans(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    List all available subscription plans with pricing and features.
    
    Requires authentication.
    Returns plan information including features, limits, and indicates the user's current plan.
    
    **Requirements: 1.1-1.4**
    """
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    
    try:
        # Get current subscription if org_id is available
        current_plan = "free"
        if org_id:
            subscription = db.query(Subscription).filter(
                Subscription.org_id == org_id
            ).first()
            if subscription:
                current_plan = subscription.plan_tier
        
        # Build plan information from constants
        from decimal import Decimal
        
        plans = [
            PlanTierInfo(
                tier="free",
                name="Free",
                description="Perfect for trying out MKChain",
                price_monthly=Decimal("0.00"),
                analyses_per_month=10,
                api_calls_per_hour=100,
                storage_gb=Decimal("1.0"),
                data_retention_days=7,
                features=["Basic blockchain analysis", "2D graph visualization", "Community support"],
                support_level="Community",
                is_popular=False,
                is_current=(current_plan == "free")
            ),
            PlanTierInfo(
                tier="pro",
                name="Pro",
                description="For professionals and small teams",
                price_monthly=Decimal("49.00"),
                analyses_per_month=100,
                api_calls_per_hour=1000,
                storage_gb=Decimal("50.0"),
                data_retention_days=30,
                features=[
                    "100 analyses per month",
                    "AI-powered summaries",
                    "PDF report generation",
                    "Advanced comparison tools",
                    "30-day data retention",
                    "Email support"
                ],
                support_level="Email",
                is_popular=True,
                is_current=(current_plan == "pro")
            ),
            PlanTierInfo(
                tier="enterprise",
                name="Enterprise",
                description="For organizations requiring unlimited scale",
                price_monthly=Decimal("299.00"),
                analyses_per_month=-1,  # unlimited
                api_calls_per_hour=5000,
                storage_gb=Decimal("500.0"),
                data_retention_days=365,
                features=[
                    "Unlimited analyses",
                    "All Pro features",
                    "Custom integrations",
                    "1-year data retention",
                    "Priority support",
                    "Dedicated account manager",
                    "SLA guarantees"
                ],
                support_level="Priority",
                is_popular=False,
                is_current=(current_plan == "enterprise")
            )
        ]
        
        logger.info(f"Listed available plans (current: {current_plan})")
        
        return AvailablePlans(
            plans=plans,
            current_plan=current_plan
        )
        
    except Exception as e:
        logger.error(f"Error listing plans: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list available plans"
        )


@router.post("/subscriptions/preview", response_model=ProrationPreview)
async def preview_plan_change(
    subscription_update: SubscriptionUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Preview proration for a plan change.
    
    Requires owner or admin role.
    Shows prorated amount, next invoice amount, and effective date for a plan change.
    Helps users understand billing impact before committing to the change.
    
    **Requirements: 19.1-19.6**
    """
    # Require owner or admin role
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get current subscription
        subscription = db.query(Subscription).filter(
            Subscription.org_id == org_id
        ).first()
        
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found"
            )
        
        current_tier = subscription.plan_tier
        new_tier = subscription_update.new_plan_tier
        
        # Can't preview same tier
        if current_tier == new_tier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Already subscribed to {new_tier} plan"
            )
        
        # Get plan prices
        from decimal import Decimal
        plan_prices = {
            "free": Decimal("0.00"),
            "pro": Decimal("49.00"),
            "enterprise": Decimal("299.00")
        }
        
        current_price = plan_prices.get(current_tier, Decimal("0.00"))
        new_price = plan_prices.get(new_tier, Decimal("0.00"))
        
        # Determine if upgrade or downgrade
        tier_order = {"free": 0, "pro": 1, "enterprise": 2}
        is_upgrade = tier_order.get(new_tier, 0) > tier_order.get(current_tier, 0)
        
        # Calculate proration for upgrades
        prorated_amount = Decimal("0.00")
        days_remaining = 0
        
        if is_upgrade and subscription.current_period_end:
            # Calculate days remaining in billing cycle
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            period_end = subscription.current_period_end
            
            # Ensure period_end is timezone-aware
            if period_end.tzinfo is None:
                period_end = period_end.replace(tzinfo=timezone.utc)
            
            period_start = subscription.current_period_start
            if period_start.tzinfo is None:
                period_start = period_start.replace(tzinfo=timezone.utc)
            
            days_remaining = max(0, (period_end - now).days)
            days_in_cycle = max(1, (period_end - period_start).days)
            
            # Proration formula: (new_price - old_price) × (days_remaining / days_in_cycle)
            price_diff = new_price - current_price
            prorated_amount = price_diff * Decimal(days_remaining) / Decimal(days_in_cycle)
            prorated_amount = prorated_amount.quantize(Decimal("0.01"))
            
            effective_date = now
        else:
            # Downgrade: takes effect at period end
            effective_date = subscription.current_period_end or datetime.now(timezone.utc)
            if subscription.current_period_end:
                period_start = subscription.current_period_start or effective_date
                if period_start.tzinfo is None:
                    period_start = period_start.replace(tzinfo=timezone.utc)
                if effective_date.tzinfo is None:
                    effective_date = effective_date.replace(tzinfo=timezone.utc)
                days_remaining = max(0, (effective_date - datetime.now(timezone.utc)).days)
        
        logger.info(f"Generated proration preview for org {org_id}: {current_tier} -> {new_tier}")
        
        return ProrationPreview(
            current_plan=current_tier,
            new_plan=new_tier,
            current_price=current_price,
            new_price=new_price,
            prorated_amount=prorated_amount,
            next_invoice_amount=new_price,
            effective_date=effective_date,
            days_remaining=days_remaining,
            is_upgrade=is_upgrade
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating proration preview: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate proration preview"
        )


# ============================================================================
# Invoice Routes
# ============================================================================

@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    request: Request,
    invoice_status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    """
    List invoices for the organization with filtering and pagination.
    
    Requires owner or admin role.
    Supports filtering by:
    - Status (paid, open, void, etc.)
    - Date range (created_at)
    
    Returns invoices ordered by created_at descending (most recent first).
    
    **Requirements: 9.3, 9.4**
    """
    # Require owner or admin role
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin"])(request, user_id, db)
    
    # Extract org_id from request.state (set by auth/organization middleware)
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get invoice generator
        invoice_generator = get_invoice_generator(db)
        
        # Fetch invoices with filters
        invoices, total = await invoice_generator.get_invoice_history(
            org_id=org_id,
            status=invoice_status,
            start_date=start_date,
            end_date=end_date,
            page=page,
            page_size=page_size
        )
        
        # Calculate pagination metadata
        has_more = (page * page_size) < total
        
        logger.info(
            f"Listed {len(invoices)} invoices for org {org_id} "
            f"(page {page}, total: {total})"
        )
        
        return InvoiceListResponse(
            invoices=invoices,
            total=total,
            page=page,
            page_size=page_size,
            has_more=has_more
        )
        
    except InvoiceGeneratorError as e:
        logger.error(f"Invoice generator error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve invoices: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error listing invoices: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve invoices"
        )


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice_details(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get detailed information for a specific invoice.
    
    Requires owner or admin role.
    Returns full invoice details including line items, amounts, and Stripe URLs.
    
    **Requirements: 9.5**
    """
    # Require owner or admin role
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get invoice generator
        invoice_generator = get_invoice_generator(db)
        
        # Fetch invoice details
        invoice = await invoice_generator.get_invoice_details(
            org_id=org_id,
            invoice_id=invoice_id
        )
        
        logger.info(f"Retrieved invoice {invoice_id} details for org {org_id}")
        
        return invoice
        
    except InvoiceNotFoundError as e:
        logger.warning(f"Invoice not found: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice {invoice_id} not found"
        )
    except InvoiceGeneratorError as e:
        logger.error(f"Invoice generator error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve invoice: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error getting invoice details: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve invoice"
        )


@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get the PDF URL for an invoice and redirect to Stripe's hosted PDF.
    
    Requires owner or admin role.
    Returns a redirect to the Stripe-hosted invoice PDF URL.
    
    **Requirements: 9.6**
    """
    # Require owner or admin role
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get invoice generator
        invoice_generator = get_invoice_generator(db)
        
        # Fetch invoice details
        invoice = await invoice_generator.get_invoice_details(
            org_id=org_id,
            invoice_id=invoice_id
        )
        
        # Check if PDF URL is available
        if not invoice.stripe_invoice_pdf:
            # Fallback to hosted invoice URL if PDF not available
            if invoice.stripe_invoice_url:
                logger.info(
                    f"PDF not available for invoice {invoice_id}, "
                    f"redirecting to hosted invoice URL"
                )
                return RedirectResponse(url=invoice.stripe_invoice_url)
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Invoice PDF not available"
                )
        
        logger.info(f"Redirecting to PDF for invoice {invoice_id}")
        
        # Redirect to Stripe-hosted PDF
        return RedirectResponse(url=invoice.stripe_invoice_pdf)
        
    except InvoiceNotFoundError as e:
        logger.warning(f"Invoice not found: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice {invoice_id} not found"
        )
    except HTTPException:
        raise
    except InvoiceGeneratorError as e:
        logger.error(f"Invoice generator error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve invoice PDF: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error getting invoice PDF: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve invoice PDF"
        )


# ============================================================================
# Usage Tracking and Analytics Routes
# ============================================================================

@router.get("/usage/current", response_model=UsageMetricResponse)
async def get_current_usage(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get current period usage metrics for the organization.
    
    Returns usage counters with quota limits and percentages.
    Includes warnings when approaching quota limits.
    
    **Requirements: 4.1-4.7, 5.1-5.7**
    """
    # Require authentication
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin", "member"])(request, user_id, db)
    
    # Extract org_id from request.state (set by auth/organization middleware)
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get organization's subscription for plan tier
        subscription = db.query(Subscription).filter(
            Subscription.org_id == org_id
        ).first()
        
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found for organization"
            )
        
        # Get current usage from UsageTracker
        usage_tracker = get_usage_tracker(db)
        current_usage = await usage_tracker.get_current_usage(org_id)
        
        if not current_usage:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No usage data found for current period"
            )
        
        # Get plan limits
        plan_config = PLAN_LIMITS.get(subscription.plan_tier, PLAN_LIMITS[PlanTier.FREE])
        
        # Compute usage response with limits and percentages
        response = UsageMetricResponse.model_validate(current_usage)
        
        # Add limit information
        response.analyses_limit = plan_config['analyses_per_month']
        response.api_calls_limit = plan_config['api_calls_per_hour']
        response.storage_limit_gb = plan_config['storage_gb']
        
        # Calculate percentages
        if response.analyses_limit > 0:
            response.analyses_percent = min(
                100.0,
                (current_usage.analyses_count / response.analyses_limit) * 100
            )
        elif response.analyses_limit == -1:  # Unlimited
            response.analyses_percent = 0.0
        else:
            response.analyses_percent = 100.0
        
        if response.storage_limit_gb > 0:
            response.storage_percent = min(
                100.0,
                (float(current_usage.storage_used_gb) / response.storage_limit_gb) * 100
            )
        else:
            response.storage_percent = 100.0
        
        logger.info(f"Retrieved current usage for org {org_id}")
        return response
        
    except UsageTrackerError as e:
        logger.error(f"Usage tracker error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve usage data: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error retrieving current usage: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve current usage"
        )


@router.get("/usage/history", response_model=UsageAnalyticsResponse)
async def get_usage_history(
    request: Request,
    periods: int = 12,
    db: Session = Depends(get_db)
):
    """
    Get historical usage data across multiple billing periods.
    
    Returns up to `periods` billing periods of usage data ordered by period_start descending.
    Includes current period and historical metrics for analytics.
    
    **Requirements: 4.1-4.7, 13.1-13.6**
    
    Query Parameters:
    - periods: Number of historical periods to retrieve (default: 12, max: 24)
    """
    # Require authentication
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin", "member"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    # Validate periods parameter
    if periods < 1 or periods > 24:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Periods must be between 1 and 24"
        )
    
    try:
        # Get organization's subscription for plan tier
        subscription = db.query(Subscription).filter(
            Subscription.org_id == org_id
        ).first()
        
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found for organization"
            )
        
        # Get usage history from UsageTracker
        usage_tracker = get_usage_tracker(db)
        current_usage = await usage_tracker.get_current_usage(org_id)
        historical_usage = await usage_tracker.get_usage_history(org_id, periods=periods)
        
        if not current_usage:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No usage data found"
            )
        
        # Get plan limits
        plan_config = PLAN_LIMITS.get(subscription.plan_tier, PLAN_LIMITS[PlanTier.FREE])
        
        # Enrich current usage with plan limits
        current_response = UsageMetricResponse.model_validate(current_usage)
        current_response.analyses_limit = plan_config['analyses_per_month']
        current_response.api_calls_limit = plan_config['api_calls_per_hour']
        current_response.storage_limit_gb = plan_config['storage_gb']
        
        # Calculate percentages for current period
        if current_response.analyses_limit > 0:
            current_response.analyses_percent = min(
                100.0,
                (current_usage.analyses_count / current_response.analyses_limit) * 100
            )
        elif current_response.analyses_limit == -1:
            current_response.analyses_percent = 0.0
        
        if current_response.storage_limit_gb > 0:
            current_response.storage_percent = min(
                100.0,
                (float(current_usage.storage_used_gb) / current_response.storage_limit_gb) * 100
            )
        
        # Enrich historical usage with plan limits
        historical_responses = []
        for usage in historical_usage:
            hist_response = UsageMetricResponse.model_validate(usage)
            hist_response.analyses_limit = plan_config['analyses_per_month']
            hist_response.api_calls_limit = plan_config['api_calls_per_hour']
            hist_response.storage_limit_gb = plan_config['storage_gb']
            
            # Calculate percentages
            if hist_response.analyses_limit > 0:
                hist_response.analyses_percent = min(
                    100.0,
                    (usage.analyses_count / hist_response.analyses_limit) * 100
                )
            elif hist_response.analyses_limit == -1:
                hist_response.analyses_percent = 0.0
            
            if hist_response.storage_limit_gb > 0:
                hist_response.storage_percent = min(
                    100.0,
                    (float(usage.storage_used_gb) / hist_response.storage_limit_gb) * 100
                )
            
            historical_responses.append(hist_response)
        
        # Calculate projected usage for current period
        projected_usage = {}
        if current_usage and subscription.current_period_start and subscription.current_period_end:
            from datetime import timezone
            now = datetime.now(timezone.utc)
            period_start = subscription.current_period_start
            period_end = subscription.current_period_end
            
            # Ensure timezone aware
            if period_start.tzinfo is None:
                period_start = period_start.replace(tzinfo=timezone.utc)
            if period_end.tzinfo is None:
                period_end = period_end.replace(tzinfo=timezone.utc)
            
            # Calculate days elapsed and total days in period
            days_elapsed = max(1, (now - period_start).days)
            total_days = max(1, (period_end - period_start).days)
            
            # Project end-of-period usage based on daily rate
            if days_elapsed > 0:
                daily_analysis_rate = current_usage.analyses_count / days_elapsed
                daily_api_rate = current_usage.api_calls_count / days_elapsed
                daily_storage_rate = float(current_usage.storage_used_gb) / days_elapsed
                
                projected_usage = {
                    "projected_analyses": int(daily_analysis_rate * total_days),
                    "projected_api_calls": int(daily_api_rate * total_days),
                    "projected_storage_gb": round(daily_storage_rate * total_days, 2),
                    "days_elapsed": days_elapsed,
                    "days_remaining": max(0, total_days - days_elapsed),
                    "total_days": total_days
                }
        
        # Build response
        response = UsageAnalyticsResponse(
            current_period=current_response,
            historical_periods=historical_responses,
            projected_usage=projected_usage
        )
        
        logger.info(f"Retrieved usage history ({len(historical_responses)} periods) for org {org_id}")
        return response
        
    except UsageTrackerError as e:
        logger.error(f"Usage tracker error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve usage history: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error retrieving usage history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve usage history"
        )


@router.get("/quota-status")
async def get_quota_status(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get quota status and limits for the organization.
    
    Returns detailed quota information with warnings when approaching limits.
    Includes feature access information based on plan tier.
    
    **Requirements: 4.1-4.7, 5.1-5.7, 17.1-17.7**
    """
    # Require authentication
    user_id = get_current_user_id(request)
    await require_role(["owner", "admin", "member"])(request, user_id, db)
    
    # Extract org_id from request.state
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found"
        )
    
    try:
        # Get organization's subscription
        subscription = db.query(Subscription).filter(
            Subscription.org_id == org_id
        ).first()
        
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found for organization"
            )
        
        # Get current usage
        usage_tracker = get_usage_tracker(db)
        current_usage = await usage_tracker.get_current_usage(org_id)
        
        if not current_usage:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No usage data found for current period"
            )
        
        # Get plan limits
        plan_config = PLAN_LIMITS.get(subscription.plan_tier, PLAN_LIMITS[PlanTier.FREE])
        
        # Build quota status response
        analyses_limit = plan_config['analyses_per_month']
        analyses_used = current_usage.analyses_count
        analyses_remaining = -1 if analyses_limit == -1 else max(0, analyses_limit - analyses_used)
        analyses_percent = 0.0 if analyses_limit == -1 else min(100.0, (analyses_used / analyses_limit * 100)) if analyses_limit > 0 else 100.0
        
        api_calls_limit = plan_config['api_calls_per_hour']
        api_calls_used = current_usage.api_calls_count
        
        storage_limit = plan_config['storage_gb']
        storage_used = float(current_usage.storage_used_gb)
        storage_remaining = -1 if storage_limit == -1 else max(0, storage_limit - storage_used)
        storage_percent = 0.0 if storage_limit == -1 else min(100.0, (storage_used / storage_limit * 100)) if storage_limit > 0 else 100.0
        
        # Determine warning level
        warning_level = "ok"
        warning_messages = []
        
        if analyses_limit > 0 and analyses_percent >= 100:
            warning_level = "exceeded"
            warning_messages.append(f"Monthly analysis quota exceeded ({analyses_used}/{analyses_limit}). Upgrade to continue.")
        elif analyses_limit > 0 and analyses_percent >= 80:
            warning_level = "warning"
            warning_messages.append(f"You've used {analyses_percent:.0f}% of your monthly analysis quota ({analyses_used}/{analyses_limit}).")
        
        if storage_limit > 0 and storage_percent >= 100:
            if warning_level != "exceeded":
                warning_level = "exceeded"
            warning_messages.append(f"Storage quota exceeded ({storage_used:.2f}/{storage_limit} GB). Upgrade to continue.")
        elif storage_limit > 0 and storage_percent >= 80:
            if warning_level == "ok":
                warning_level = "warning"
            warning_messages.append(f"You've used {storage_percent:.0f}% of your storage quota ({storage_used:.2f}/{storage_limit} GB).")
        
        # Build response
        response = {
            "plan_tier": subscription.plan_tier,
            "status": subscription.status,
            "quotas": {
                "analyses": {
                    "limit": analyses_limit,
                    "used": analyses_used,
                    "remaining": analyses_remaining,
                    "percent": round(analyses_percent, 1),
                    "unlimited": analyses_limit == -1
                },
                "api_calls_per_hour": {
                    "limit": api_calls_limit,
                    "current_usage": api_calls_used,
                },
                "storage": {
                    "limit_gb": storage_limit,
                    "used_gb": round(storage_used, 2),
                    "remaining_gb": round(storage_remaining, 2) if storage_remaining != -1 else -1,
                    "percent": round(storage_percent, 1),
                    "unlimited": storage_limit == -1
                }
            },
            "warning_level": warning_level,
            "warnings": warning_messages,
            "features": plan_config.get('features', []),
            "billing_period": {
                "start": subscription.current_period_start,
                "end": subscription.current_period_end
            }
        }
        
        logger.info(f"Retrieved quota status for org {org_id} - level: {warning_level}")
        return response
        
    except UsageTrackerError as e:
        logger.error(f"Usage tracker error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve quota status: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error retrieving quota status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve quota status"
        )


# ============================================================================
# Stripe Webhook Endpoint
# ============================================================================

@router.post("/webhooks/stripe", status_code=status.HTTP_200_OK)
async def handle_stripe_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Handle Stripe webhook events.
    
    This endpoint receives webhook events from Stripe and processes them securely.
    
    Security:
    - Verifies webhook signature to prevent spoofed events
    - No authentication required (webhook signature is the security mechanism)
    - Implements idempotency to prevent duplicate processing
    
    Supported Events:
    - invoice.payment_succeeded: Update subscription to active, create invoice
    - invoice.payment_failed: Update subscription to past_due, set grace period
    - customer.subscription.deleted: Cancel subscription, downgrade to free
    - customer.subscription.trial_will_end: Send trial ending notification
    
    **Requirements: 8.1-8.7 (Webhook Processing)**
    
    Returns:
        200 OK: Event processed successfully or already processed
        400 Bad Request: Invalid signature or malformed payload
        500 Internal Server Error: Processing error
    """
    try:
        # Get raw request body and signature header
        payload = await request.body()
        signature = request.headers.get('Stripe-Signature')
        
        if not signature:
            logger.warning("Webhook request missing Stripe-Signature header")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing Stripe-Signature header"
            )
        
        # Get webhook handler
        from services.webhook_handler import get_webhook_handler, SignatureVerificationError, EventProcessingError
        
        webhook_handler = get_webhook_handler(db)
        
        # Process webhook (signature verification happens inside)
        result = await webhook_handler.handle_webhook(
            payload=payload,
            signature=signature
        )
        
        # Log the result
        logger.info(
            f"Webhook processed: event_id={result.get('event_id')}, "
            f"type={result.get('event_type')}, status={result.get('status')}"
        )
        
        # Return 200 OK to acknowledge receipt
        return {
            "received": True,
            "event_id": result.get('event_id'),
            "status": result.get('status')
        }
        
    except SignatureVerificationError as e:
        logger.error(f"Webhook signature verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature"
        )
    except EventProcessingError as e:
        logger.error(f"Webhook event processing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process webhook event"
        )
    except ValueError as e:
        # Missing webhook secret configuration
        logger.error(f"Webhook handler configuration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook handler not configured"
        )
    except Exception as e:
        logger.error(f"Unexpected error in webhook endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error processing webhook"
        )
