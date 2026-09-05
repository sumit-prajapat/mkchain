"""
Subscription Manager Service
Orchestrates subscription lifecycle management, plan changes, and billing operations
"""
import logging
from typing import Optional, Literal
from datetime import datetime, timedelta
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from models_billing import (
    Subscription, 
    SubscriptionStatus, 
    PlanTier, 
    PLAN_LIMITS,
    UsageMetric
)
from services.payment_processor import (
    PaymentProcessor, 
    PaymentProcessorError,
    StripeAPIError,
    PaymentMethodRequiredError
)

logger = logging.getLogger(__name__)


class SubscriptionManagerError(Exception):
    """Base exception for subscription manager errors"""
    pass


class InvalidUpgradeError(SubscriptionManagerError):
    """Invalid plan upgrade"""
    pass


class InvalidDowngradeError(SubscriptionManagerError):
    """Invalid plan downgrade"""
    pass


class SubscriptionNotFoundError(SubscriptionManagerError):
    """Subscription not found"""
    pass


class TrialNotEligibleError(SubscriptionManagerError):
    """Organization not eligible for trial"""
    pass


class SubscriptionManager:
    """Orchestrates subscription lifecycle management"""
    
    # Stripe price IDs (from environment variables)
    STRIPE_PRICE_IDS = {
        PlanTier.PRO: None,  # Set from environment
        PlanTier.ENTERPRISE: None,  # Set from environment
    }
    
    TRIAL_DAYS = 14
    GRACE_PERIOD_DAYS = 7
    
    def __init__(self, db: Session, payment_processor: PaymentProcessor):
        """
        Initialize SubscriptionManager
        
        Args:
            db: SQLAlchemy database session
            payment_processor: PaymentProcessor instance
        """
        self.db = db
        self.payment_processor = payment_processor
        logger.info("SubscriptionManager initialized")
    
    async def create_subscription(
        self,
        org_id: UUID,
        plan_tier: Literal["free", "pro", "enterprise"],
        payment_method_id: Optional[str] = None,
        email: Optional[str] = None,
        org_name: Optional[str] = None
    ) -> Subscription:
        """
        Create a new subscription for an organization.
        
        For paid plans:
        - Creates Stripe customer if not exists
        - Creates Stripe subscription with trial if eligible
        - Records subscription in database with trialing status
        
        Args:
            org_id: Organization UUID
            plan_tier: Target subscription tier
            payment_method_id: Stripe payment method ID (optional for trial)
            email: Organization owner email (required for paid plans)
            org_name: Organization name (required for paid plans)
            
        Returns:
            Subscription entity with trial_end date
            
        Raises:
            PaymentMethodRequiredError: If payment required but no method provided
            StripeAPIError: If Stripe API call fails
            SubscriptionManagerError: If subscription creation fails
        """
        try:
            # Check if subscription already exists
            existing = self.db.query(Subscription).filter_by(org_id=org_id).first()
            if existing:
                logger.warning(f"Subscription already exists for org {org_id}")
                return existing
            
            # For free tier, create simple subscription
            if plan_tier == PlanTier.FREE:
                return await self._create_free_subscription(org_id)
            
            # For paid tiers, need email and org_name
            if not email or not org_name:
                raise SubscriptionManagerError(
                    "Email and organization name required for paid subscriptions"
                )
            
            # Check trial eligibility
            trial_eligible = await self._check_trial_eligibility(org_id, plan_tier)
            trial_days = self.TRIAL_DAYS if trial_eligible else None
            
            # Create Stripe customer
            customer_id = await self.payment_processor.create_customer(
                org_id=org_id,
                email=email,
                org_name=org_name
            )
            
            # Get Stripe price ID for plan
            price_id = self._get_stripe_price_id(plan_tier)
            
            # Create Stripe subscription
            stripe_subscription = await self.payment_processor.create_subscription(
                customer_id=customer_id,
                price_id=price_id,
                trial_days=trial_days,
                payment_method_id=payment_method_id
            )
            
            # Determine subscription status
            status = (
                SubscriptionStatus.TRIALING if trial_days 
                else SubscriptionStatus.ACTIVE
            )
            
            # Create subscription record
            subscription = Subscription(
                org_id=org_id,
                plan_tier=plan_tier,
                stripe_customer_id=customer_id,
                stripe_subscription_id=stripe_subscription['id'],
                stripe_price_id=price_id,
                status=status,
                current_period_start=stripe_subscription['current_period_start'],
                current_period_end=stripe_subscription['current_period_end'],
                trial_end=stripe_subscription['trial_end'],
                has_used_trial_pro=(plan_tier == PlanTier.PRO and trial_days is not None),
                has_used_trial_ent=(plan_tier == PlanTier.ENTERPRISE and trial_days is not None)
            )
            
            self.db.add(subscription)
            self.db.commit()
            self.db.refresh(subscription)
            
            # Create initial usage metrics
            await self._create_initial_usage_metrics(
                org_id=org_id,
                period_start=subscription.current_period_start,
                period_end=subscription.current_period_end
            )
            
            logger.info(
                f"Created {plan_tier} subscription for org {org_id} with status {status}"
            )
            return subscription
            
        except (StripeAPIError, PaymentMethodRequiredError):
            self.db.rollback()
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to create subscription: {e}")
            raise SubscriptionManagerError(f"Failed to create subscription: {str(e)}")
    
    async def upgrade_subscription(
        self,
        org_id: UUID,
        new_plan_tier: Literal["pro", "enterprise"],
        payment_method_id: Optional[str] = None,
        email: Optional[str] = None,
        org_name: Optional[str] = None
    ) -> Subscription:
        """
        Upgrade subscription to higher tier with immediate effect.
        
        - Updates Stripe subscription with proration
        - Charges prorated amount immediately
        - Updates database subscription record
        
        Args:
            org_id: Organization UUID
            new_plan_tier: Target tier (must be higher than current)
            payment_method_id: Required if no existing payment method
            email: Organization owner email (required for free to paid upgrade)
            org_name: Organization name (required for free to paid upgrade)
            
        Returns:
            Updated subscription with new plan and prorated charge
            
        Raises:
            InvalidUpgradeError: If new tier is not higher than current
            PaymentMethodRequiredError: If payment method missing
            SubscriptionNotFoundError: If subscription not found
        """
        try:
            subscription = self.db.query(Subscription).filter_by(org_id=org_id).first()
            if not subscription:
                raise SubscriptionNotFoundError(f"Subscription not found for org {org_id}")
            
            # Validate upgrade (new tier must be higher)
            current_tier = subscription.plan_tier
            if not self._is_upgrade(current_tier, new_plan_tier):
                raise InvalidUpgradeError(
                    f"Cannot upgrade from {current_tier} to {new_plan_tier}"
                )
            
            # If upgrading from free, create new paid subscription
            if current_tier == PlanTier.FREE:
                return await self._upgrade_from_free(
                    subscription=subscription,
                    new_plan_tier=new_plan_tier,
                    payment_method_id=payment_method_id,
                    email=email,
                    org_name=org_name
                )
            
            # If upgrading between paid tiers, update existing subscription
            return await self._upgrade_paid_tier(
                subscription=subscription,
                new_plan_tier=new_plan_tier
            )
            
        except (InvalidUpgradeError, SubscriptionNotFoundError, PaymentMethodRequiredError):
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to upgrade subscription: {e}")
            raise SubscriptionManagerError(f"Failed to upgrade subscription: {str(e)}")
    
    async def downgrade_subscription(
        self,
        org_id: UUID,
        new_plan_tier: Literal["free", "pro"]
    ) -> Subscription:
        """
        Schedule subscription downgrade to occur at period end.
        
        - Schedules change in Stripe for period boundary
        - Updates database with scheduled_plan_change
        - Maintains current access until scheduled date
        
        Args:
            org_id: Organization UUID
            new_plan_tier: Target tier (must be lower than current)
            
        Returns:
            Subscription with scheduled_downgrade_date set
            
        Raises:
            InvalidDowngradeError: If new tier is not lower than current
            SubscriptionNotFoundError: If subscription not found
        """
        try:
            subscription = self.db.query(Subscription).filter_by(org_id=org_id).first()
            if not subscription:
                raise SubscriptionNotFoundError(f"Subscription not found for org {org_id}")
            
            # Validate downgrade (new tier must be lower)
            current_tier = subscription.plan_tier
            if not self._is_downgrade(current_tier, new_plan_tier):
                raise InvalidDowngradeError(
                    f"Cannot downgrade from {current_tier} to {new_plan_tier}"
                )
            
            # Schedule the downgrade
            subscription.scheduled_plan_change = new_plan_tier
            subscription.scheduled_change_date = subscription.current_period_end
            
            # If downgrading to free, cancel Stripe subscription at period end
            if new_plan_tier == PlanTier.FREE and subscription.stripe_subscription_id:
                await self.payment_processor.cancel_subscription(
                    subscription_id=subscription.stripe_subscription_id,
                    at_period_end=True
                )
                subscription.cancel_at_period_end = True
            
            self.db.commit()
            self.db.refresh(subscription)
            
            logger.info(
                f"Scheduled downgrade from {current_tier} to {new_plan_tier} "
                f"for org {org_id} at {subscription.scheduled_change_date}"
            )
            return subscription
            
        except (InvalidDowngradeError, SubscriptionNotFoundError):
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to downgrade subscription: {e}")
            raise SubscriptionManagerError(f"Failed to downgrade subscription: {str(e)}")
    
    async def cancel_subscription(
        self,
        org_id: UUID,
        immediate: bool = False
    ) -> Subscription:
        """
        Cancel subscription (schedule or immediate).
        
        - By default, schedules cancellation for period end
        - If immediate=True, cancels immediately and downgrades to free
        - Cancels Stripe subscription to stop future charges
        
        Args:
            org_id: Organization UUID
            immediate: If True, cancel immediately instead of at period end
            
        Returns:
            Subscription with canceled status or scheduled cancellation
            
        Raises:
            SubscriptionNotFoundError: If subscription not found
        """
        try:
            subscription = self.db.query(Subscription).filter_by(org_id=org_id).first()
            if not subscription:
                raise SubscriptionNotFoundError(f"Subscription not found for org {org_id}")
            
            # Can't cancel free tier (already free)
            if subscription.plan_tier == PlanTier.FREE:
                logger.warning(f"Cannot cancel free subscription for org {org_id}")
                return subscription
            
            if immediate:
                # Immediate cancellation - cancel Stripe subscription and downgrade
                if subscription.stripe_subscription_id:
                    await self.payment_processor.cancel_subscription(
                        subscription_id=subscription.stripe_subscription_id,
                        at_period_end=False
                    )
                
                subscription.status = SubscriptionStatus.CANCELED
                subscription.plan_tier = PlanTier.FREE
                subscription.stripe_subscription_id = None
                subscription.stripe_price_id = None
                subscription.cancel_at_period_end = False
                
                logger.info(f"Immediately canceled subscription for org {org_id}")
            else:
                # Schedule cancellation at period end
                if subscription.stripe_subscription_id:
                    await self.payment_processor.cancel_subscription(
                        subscription_id=subscription.stripe_subscription_id,
                        at_period_end=True
                    )
                
                subscription.cancel_at_period_end = True
                subscription.scheduled_plan_change = PlanTier.FREE
                subscription.scheduled_change_date = subscription.current_period_end
                
                logger.info(
                    f"Scheduled cancellation for org {org_id} at "
                    f"{subscription.current_period_end}"
                )
            
            self.db.commit()
            self.db.refresh(subscription)
            
            return subscription
            
        except SubscriptionNotFoundError:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to cancel subscription: {e}")
            raise SubscriptionManagerError(f"Failed to cancel subscription: {str(e)}")
    
    async def handle_trial_expiration(self, subscription_id: int) -> None:
        """
        Process trial expiration event (called by scheduler).
        
        - Attempts to charge payment method
        - If success: transition to active status
        - If failure or no payment method: cancel and downgrade to free
        
        Args:
            subscription_id: Subscription ID
        """
        try:
            subscription = self.db.query(Subscription).filter_by(id=subscription_id).first()
            if not subscription:
                logger.error(f"Subscription {subscription_id} not found for trial expiration")
                return
            
            # Check if trial has actually expired
            if subscription.trial_end and subscription.trial_end > datetime.utcnow():
                logger.warning(f"Trial not yet expired for subscription {subscription_id}")
                return
            
            # Stripe will automatically attempt to charge, we just need to check the result
            # If payment succeeded, Stripe webhook will update status to active
            # If payment failed or no payment method, cancel and downgrade
            
            if subscription.status == SubscriptionStatus.TRIALING:
                # No successful payment, downgrade to free
                logger.info(
                    f"Trial expired without payment for subscription {subscription_id}, "
                    f"downgrading to free"
                )
                
                if subscription.stripe_subscription_id:
                    await self.payment_processor.cancel_subscription(
                        subscription_id=subscription.stripe_subscription_id,
                        at_period_end=False
                    )
                
                subscription.status = SubscriptionStatus.CANCELED
                subscription.plan_tier = PlanTier.FREE
                subscription.stripe_subscription_id = None
                subscription.stripe_price_id = None
                subscription.trial_end = None
                
                self.db.commit()
                
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to handle trial expiration: {e}")
    
    async def handle_grace_period_expiration(self, subscription_id: int) -> None:
        """
        Process grace period expiration (called by scheduler).
        
        - Cancel subscription in Stripe
        - Downgrade organization to free tier
        - Enforce free tier limits immediately
        
        Args:
            subscription_id: Subscription ID
        """
        try:
            subscription = self.db.query(Subscription).filter_by(id=subscription_id).first()
            if not subscription:
                logger.error(
                    f"Subscription {subscription_id} not found for grace period expiration"
                )
                return
            
            # Check if grace period has actually expired
            if (subscription.grace_period_end and 
                subscription.grace_period_end > datetime.utcnow()):
                logger.warning(
                    f"Grace period not yet expired for subscription {subscription_id}"
                )
                return
            
            logger.info(
                f"Grace period expired for subscription {subscription_id}, "
                f"downgrading to free"
            )
            
            # Cancel Stripe subscription
            if subscription.stripe_subscription_id:
                await self.payment_processor.cancel_subscription(
                    subscription_id=subscription.stripe_subscription_id,
                    at_period_end=False
                )
            
            # Downgrade to free tier
            subscription.status = SubscriptionStatus.CANCELED
            subscription.plan_tier = PlanTier.FREE
            subscription.stripe_subscription_id = None
            subscription.stripe_price_id = None
            subscription.grace_period_end = None
            
            self.db.commit()
            
            # Usage enforcement will automatically apply free tier limits
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to handle grace period expiration: {e}")
    
    async def execute_scheduled_downgrade(self, subscription_id: int) -> None:
        """
        Execute a scheduled plan downgrade (called by scheduler).
        
        - Update subscription plan_tier in database
        - Update Stripe subscription if not downgrading to free
        - Clear scheduled_downgrade_date
        - Trigger usage limit re-evaluation
        
        Args:
            subscription_id: Subscription ID
        """
        try:
            subscription = self.db.query(Subscription).filter_by(id=subscription_id).first()
            if not subscription:
                logger.error(
                    f"Subscription {subscription_id} not found for scheduled downgrade"
                )
                return
            
            # Check if downgrade is scheduled
            if not subscription.scheduled_plan_change:
                logger.warning(f"No scheduled downgrade for subscription {subscription_id}")
                return
            
            # Check if downgrade date has been reached
            if (subscription.scheduled_change_date and 
                subscription.scheduled_change_date > datetime.utcnow()):
                logger.warning(
                    f"Scheduled downgrade date not yet reached for subscription {subscription_id}"
                )
                return
            
            new_plan_tier = subscription.scheduled_plan_change
            old_plan_tier = subscription.plan_tier
            
            logger.info(
                f"Executing scheduled downgrade from {old_plan_tier} to {new_plan_tier} "
                f"for subscription {subscription_id}"
            )
            
            # If downgrading to free, Stripe subscription should already be canceled
            if new_plan_tier == PlanTier.FREE:
                subscription.status = SubscriptionStatus.CANCELED
                subscription.stripe_subscription_id = None
                subscription.stripe_price_id = None
            else:
                # Downgrade between paid tiers
                if subscription.stripe_subscription_id:
                    price_id = self._get_stripe_price_id(new_plan_tier)
                    await self.payment_processor.update_subscription(
                        subscription_id=subscription.stripe_subscription_id,
                        new_price_id=price_id,
                        proration_behavior="none"  # No proration on downgrade
                    )
                    subscription.stripe_price_id = price_id
            
            # Update plan tier
            subscription.plan_tier = new_plan_tier
            subscription.scheduled_plan_change = None
            subscription.scheduled_change_date = None
            subscription.cancel_at_period_end = False
            
            self.db.commit()
            
            # Usage enforcement will automatically apply new tier limits
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to execute scheduled downgrade: {e}")
    
    # Private helper methods
    
    async def _create_free_subscription(self, org_id: UUID) -> Subscription:
        """Create a free tier subscription"""
        subscription = Subscription(
            org_id=org_id,
            plan_tier=PlanTier.FREE,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=datetime.utcnow(),
            current_period_end=None,  # Free tier has no billing period
        )
        
        self.db.add(subscription)
        self.db.commit()
        self.db.refresh(subscription)
        
        logger.info(f"Created free subscription for org {org_id}")
        return subscription
    
    async def _check_trial_eligibility(
        self, 
        org_id: UUID, 
        plan_tier: str
    ) -> bool:
        """Check if organization is eligible for trial on plan"""
        subscription = self.db.query(Subscription).filter_by(org_id=org_id).first()
        
        if not subscription:
            return True  # New org is eligible
        
        return subscription.is_trial_eligible(plan_tier)
    
    def _get_stripe_price_id(self, plan_tier: str) -> str:
        """Get Stripe price ID for plan tier"""
        # In production, these would come from environment variables
        # For now, return placeholder
        import os
        
        if plan_tier == PlanTier.PRO:
            price_id = os.getenv('STRIPE_PRICE_ID_PRO')
            if not price_id:
                raise SubscriptionManagerError(
                    "STRIPE_PRICE_ID_PRO environment variable not set"
                )
            return price_id
        elif plan_tier == PlanTier.ENTERPRISE:
            price_id = os.getenv('STRIPE_PRICE_ID_ENTERPRISE')
            if not price_id:
                raise SubscriptionManagerError(
                    "STRIPE_PRICE_ID_ENTERPRISE environment variable not set"
                )
            return price_id
        else:
            raise SubscriptionManagerError(f"No Stripe price ID for plan tier {plan_tier}")
    
    def _is_upgrade(self, current_tier: str, new_tier: str) -> bool:
        """Check if moving from current_tier to new_tier is an upgrade"""
        tier_order = [PlanTier.FREE, PlanTier.PRO, PlanTier.ENTERPRISE]
        try:
            current_index = tier_order.index(current_tier)
            new_index = tier_order.index(new_tier)
            return new_index > current_index
        except ValueError:
            return False
    
    def _is_downgrade(self, current_tier: str, new_tier: str) -> bool:
        """Check if moving from current_tier to new_tier is a downgrade"""
        tier_order = [PlanTier.FREE, PlanTier.PRO, PlanTier.ENTERPRISE]
        try:
            current_index = tier_order.index(current_tier)
            new_index = tier_order.index(new_tier)
            return new_index < current_index
        except ValueError:
            return False
    
    async def _upgrade_from_free(
        self,
        subscription: Subscription,
        new_plan_tier: str,
        payment_method_id: Optional[str],
        email: Optional[str] = None,
        org_name: Optional[str] = None
    ) -> Subscription:
        """Upgrade from free to paid tier"""
        # Get organization details (need to query from Organization model)
        from models_organization import Organization, OrganizationMember, Role
        org = self.db.query(Organization).filter_by(id=subscription.org_id).first()
        if not org:
            raise SubscriptionManagerError(
                f"Organization not found: {subscription.org_id}"
            )
        
        # Use provided org_name or fall back to org.name
        customer_org_name = org_name if org_name else org.name
        
        # Get email if not provided
        if not email:
            # Try to get owner email from organization members
            # For now, use a placeholder since we don't have user email in the member table
            email = f"owner-{org.id}@mkchain.app"
        
        # Check trial eligibility
        trial_eligible = subscription.is_trial_eligible(new_plan_tier)
        trial_days = self.TRIAL_DAYS if trial_eligible else None
        
        # Create Stripe customer if not exists
        if not subscription.stripe_customer_id:
            customer_id = await self.payment_processor.create_customer(
                org_id=subscription.org_id,
                email=email,
                org_name=customer_org_name
            )
            subscription.stripe_customer_id = customer_id
        
        # Get Stripe price ID
        price_id = self._get_stripe_price_id(new_plan_tier)
        
        # Create Stripe subscription
        stripe_subscription = await self.payment_processor.create_subscription(
            customer_id=subscription.stripe_customer_id,
            price_id=price_id,
            trial_days=trial_days,
            payment_method_id=payment_method_id
        )
        
        # Update subscription record
        subscription.plan_tier = new_plan_tier
        subscription.stripe_subscription_id = stripe_subscription['id']
        subscription.stripe_price_id = price_id
        subscription.status = (
            SubscriptionStatus.TRIALING if trial_days 
            else SubscriptionStatus.ACTIVE
        )
        subscription.current_period_start = stripe_subscription['current_period_start']
        subscription.current_period_end = stripe_subscription['current_period_end']
        subscription.trial_end = stripe_subscription['trial_end']
        
        # Mark trial as used
        if trial_days:
            if new_plan_tier == PlanTier.PRO:
                subscription.has_used_trial_pro = True
            elif new_plan_tier == PlanTier.ENTERPRISE:
                subscription.has_used_trial_ent = True
        
        self.db.commit()
        self.db.refresh(subscription)
        
        # Create usage metrics for new billing period
        await self._create_initial_usage_metrics(
            org_id=subscription.org_id,
            period_start=subscription.current_period_start,
            period_end=subscription.current_period_end
        )
        
        logger.info(
            f"Upgraded from free to {new_plan_tier} for org {subscription.org_id}"
        )
        return subscription
    
    async def _upgrade_paid_tier(
        self,
        subscription: Subscription,
        new_plan_tier: str
    ) -> Subscription:
        """Upgrade between paid tiers with proration"""
        # Get new Stripe price ID
        price_id = self._get_stripe_price_id(new_plan_tier)
        
        # Update Stripe subscription with proration
        stripe_subscription = await self.payment_processor.update_subscription(
            subscription_id=subscription.stripe_subscription_id,
            new_price_id=price_id,
            proration_behavior="create_prorations"
        )
        
        # Update subscription record
        subscription.plan_tier = new_plan_tier
        subscription.stripe_price_id = price_id
        subscription.status = SubscriptionStatus.ACTIVE
        subscription.current_period_start = stripe_subscription['current_period_start']
        subscription.current_period_end = stripe_subscription['current_period_end']
        
        self.db.commit()
        self.db.refresh(subscription)
        
        logger.info(
            f"Upgraded to {new_plan_tier} with proration for org {subscription.org_id}"
        )
        return subscription
    
    async def _create_initial_usage_metrics(
        self,
        org_id: UUID,
        period_start: datetime,
        period_end: datetime
    ) -> UsageMetric:
        """Create initial usage metrics record for billing period"""
        try:
            usage_metric = UsageMetric(
                org_id=org_id,
                billing_period_start=period_start,
                billing_period_end=period_end,
                analyses_count=0,
                api_calls_count=0,
                storage_used_gb=0.0
            )
            
            self.db.add(usage_metric)
            self.db.commit()
            self.db.refresh(usage_metric)
            
            logger.info(f"Created usage metrics for org {org_id}")
            return usage_metric
            
        except IntegrityError:
            # Usage metrics already exist for this period
            self.db.rollback()
            logger.warning(
                f"Usage metrics already exist for org {org_id} period {period_start}"
            )
            return self.db.query(UsageMetric).filter_by(
                org_id=org_id,
                billing_period_start=period_start
            ).first()


def get_subscription_manager(
    db: Session, 
    payment_processor: Optional[PaymentProcessor] = None
) -> SubscriptionManager:
    """Factory function to create SubscriptionManager instance"""
    if payment_processor is None:
        from services.payment_processor import get_payment_processor
        payment_processor = get_payment_processor()
    
    return SubscriptionManager(db, payment_processor)
