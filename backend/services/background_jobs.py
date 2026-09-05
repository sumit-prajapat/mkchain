"""
Background Job Scheduler Service
Handles scheduled tasks for subscription billing system:
- Usage reset at start of billing periods
- Trial expiration checks and notifications
- Grace period expiration checks and subscription cancellations
- Scheduled plan changes execution
"""
import logging
from datetime import datetime, timedelta
from typing import Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models_billing import Subscription, SubscriptionStatus, UsageMetric
from services.subscription_manager import SubscriptionManager
from services.payment_processor import PaymentProcessor
from services.data_retention_cleanup import DataRetentionCleanupService

logger = logging.getLogger(__name__)


class BackgroundJobScheduler:
    """
    Manages scheduled background jobs for subscription billing system
    """
    
    def __init__(
        self, 
        db_session_factory,
        subscription_manager: Optional[SubscriptionManager] = None,
        payment_processor: Optional[PaymentProcessor] = None
    ):
        """
        Initialize the background job scheduler
        
        Args:
            db_session_factory: Factory function that returns a new database session
            subscription_manager: Optional SubscriptionManager instance (will be created if not provided)
            payment_processor: Optional PaymentProcessor instance (will be created if not provided)
        """
        self.db_session_factory = db_session_factory
        self.subscription_manager = subscription_manager
        self.payment_processor = payment_processor
        self.scheduler = AsyncIOScheduler()
        logger.info("BackgroundJobScheduler initialized")
    
    def start(self):
        """
        Start all scheduled jobs
        """
        try:
            # Job 1: Usage reset at start of each billing period
            # This is handled by subscription renewal webhooks from Stripe
            # But we add a daily job to catch any missed resets
            self.scheduler.add_job(
                self._reset_usage_metrics_job,
                CronTrigger(hour=0, minute=5),  # Run at 12:05 AM UTC daily
                id='usage_reset_daily',
                name='Daily Usage Reset Check',
                replace_existing=True
            )
            logger.info("Scheduled daily usage reset check job")
            
            # Job 2: Trial expiration check (runs daily, sends notifications 3 days before expiry)
            self.scheduler.add_job(
                self._trial_expiration_check_job,
                CronTrigger(hour=9, minute=0),  # Run at 9:00 AM UTC daily
                id='trial_expiration_daily',
                name='Daily Trial Expiration Check',
                replace_existing=True
            )
            logger.info("Scheduled daily trial expiration check job")
            
            # Job 3: Grace period expiration check (runs hourly, cancels subscriptions after grace period)
            self.scheduler.add_job(
                self._grace_period_expiration_job,
                IntervalTrigger(hours=1),  # Run every hour
                id='grace_period_hourly',
                name='Hourly Grace Period Expiration Check',
                replace_existing=True
            )
            logger.info("Scheduled hourly grace period expiration job")
            
            # Job 4: Scheduled plan changes (runs daily, applies downgrades at period end)
            self.scheduler.add_job(
                self._scheduled_downgrade_job,
                CronTrigger(hour=0, minute=30),  # Run at 12:30 AM UTC daily
                id='scheduled_downgrades_daily',
                name='Daily Scheduled Downgrade Execution',
                replace_existing=True
            )
            logger.info("Scheduled daily scheduled downgrade job")
            
            # Job 5: Data retention cleanup (runs daily at 2 AM UTC)
            self.scheduler.add_job(
                self._data_retention_cleanup_job,
                CronTrigger(hour=2, minute=0),  # Run at 2:00 AM UTC daily
                id='data_retention_cleanup_daily',
                name='Daily Data Retention Cleanup',
                replace_existing=True
            )
            logger.info("Scheduled daily data retention cleanup job")
            
            # Start the scheduler
            self.scheduler.start()
            logger.info("Background job scheduler started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start background job scheduler: {e}")
            raise
    
    def shutdown(self):
        """
        Gracefully shutdown the scheduler
        """
        try:
            self.scheduler.shutdown(wait=True)
            logger.info("Background job scheduler shut down successfully")
        except Exception as e:
            logger.error(f"Error shutting down scheduler: {e}")
    
    # Job implementations
    
    async def _reset_usage_metrics_job(self):
        """
        Job 1: Reset usage metrics at the start of each billing period
        
        This job creates new usage metric records for organizations whose
        billing period has ended. It runs daily to catch any periods that
        may have been missed.
        """
        logger.info("Starting usage reset job")
        db = None
        
        try:
            db = self.db_session_factory()
            now = datetime.utcnow()
            
            # Find subscriptions whose current_period_end has passed
            subscriptions = db.query(Subscription).filter(
                and_(
                    Subscription.status.in_([
                        SubscriptionStatus.ACTIVE,
                        SubscriptionStatus.TRIALING
                    ]),
                    Subscription.current_period_end.isnot(None),
                    Subscription.current_period_end <= now
                )
            ).all()
            
            reset_count = 0
            for subscription in subscriptions:
                try:
                    # Check if usage metrics already exist for the new period
                    new_period_start = subscription.current_period_end
                    existing_metric = db.query(UsageMetric).filter(
                        and_(
                            UsageMetric.org_id == subscription.org_id,
                            UsageMetric.billing_period_start == new_period_start
                        )
                    ).first()
                    
                    if existing_metric:
                        logger.debug(
                            f"Usage metrics already exist for org {subscription.org_id} "
                            f"period starting {new_period_start}"
                        )
                        continue
                    
                    # Calculate new period end (assume monthly billing)
                    new_period_end = new_period_start + timedelta(days=30)
                    
                    # Create new usage metrics record
                    new_metric = UsageMetric(
                        org_id=subscription.org_id,
                        billing_period_start=new_period_start,
                        billing_period_end=new_period_end,
                        analyses_count=0,
                        api_calls_count=0,
                        storage_used_gb=0.00
                    )
                    db.add(new_metric)
                    reset_count += 1
                    
                    logger.info(
                        f"Created new usage metrics for org {subscription.org_id} "
                        f"for period {new_period_start} to {new_period_end}"
                    )
                    
                except Exception as e:
                    logger.error(
                        f"Failed to reset usage for org {subscription.org_id}: {e}"
                    )
                    continue
            
            db.commit()
            logger.info(f"Usage reset job completed: {reset_count} metrics created")
            
        except Exception as e:
            logger.error(f"Usage reset job failed: {e}")
            if db:
                db.rollback()
        finally:
            if db:
                db.close()
    
    async def _trial_expiration_check_job(self):
        """
        Job 2: Check for trial expirations and send notifications
        
        This job runs daily and:
        - Sends notifications 3 days before trial expiration
        - Processes expired trials (charge payment or downgrade)
        """
        logger.info("Starting trial expiration check job")
        db = None
        
        try:
            db = self.db_session_factory()
            now = datetime.utcnow()
            three_days_from_now = now + timedelta(days=3)
            
            # Find trials expiring in 3 days (for notifications)
            expiring_soon = db.query(Subscription).filter(
                and_(
                    Subscription.status == SubscriptionStatus.TRIALING,
                    Subscription.trial_end.isnot(None),
                    Subscription.trial_end >= now,
                    Subscription.trial_end <= three_days_from_now
                )
            ).all()
            
            notification_count = 0
            for subscription in expiring_soon:
                try:
                    days_remaining = (subscription.trial_end - now).days
                    logger.info(
                        f"Trial expiring in {days_remaining} days for org {subscription.org_id}"
                    )
                    
                    # TODO: Send notification to organization owner
                    # This would integrate with a notification service
                    # For now, we just log
                    logger.info(
                        f"Notification: Trial ends in {days_remaining} days for org "
                        f"{subscription.org_id}. Add payment method to continue."
                    )
                    notification_count += 1
                    
                except Exception as e:
                    logger.error(
                        f"Failed to send trial expiration notification for "
                        f"subscription {subscription.id}: {e}"
                    )
                    continue
            
            # Find expired trials (for processing)
            expired_trials = db.query(Subscription).filter(
                and_(
                    Subscription.status == SubscriptionStatus.TRIALING,
                    Subscription.trial_end.isnot(None),
                    Subscription.trial_end <= now
                )
            ).all()
            
            processed_count = 0
            for subscription in expired_trials:
                try:
                    logger.info(
                        f"Processing expired trial for subscription {subscription.id}"
                    )
                    
                    # Get subscription manager
                    if not self.subscription_manager:
                        if not self.payment_processor:
                            self.payment_processor = PaymentProcessor()
                        self.subscription_manager = SubscriptionManager(
                            db=db,
                            payment_processor=self.payment_processor
                        )
                    
                    # Handle trial expiration
                    await self.subscription_manager.handle_trial_expiration(
                        subscription_id=subscription.id
                    )
                    processed_count += 1
                    
                except Exception as e:
                    logger.error(
                        f"Failed to process trial expiration for subscription "
                        f"{subscription.id}: {e}"
                    )
                    continue
            
            logger.info(
                f"Trial expiration check completed: {notification_count} notifications sent, "
                f"{processed_count} expired trials processed"
            )
            
        except Exception as e:
            logger.error(f"Trial expiration check job failed: {e}")
        finally:
            if db:
                db.close()
    
    async def _grace_period_expiration_job(self):
        """
        Job 3: Check for grace period expirations and cancel subscriptions
        
        This job runs hourly and cancels subscriptions whose grace period
        has expired without successful payment recovery.
        """
        logger.info("Starting grace period expiration check job")
        db = None
        
        try:
            db = self.db_session_factory()
            now = datetime.utcnow()
            
            # Find subscriptions with expired grace periods
            expired_grace_periods = db.query(Subscription).filter(
                and_(
                    Subscription.status == SubscriptionStatus.PAST_DUE,
                    Subscription.grace_period_end.isnot(None),
                    Subscription.grace_period_end <= now
                )
            ).all()
            
            processed_count = 0
            for subscription in expired_grace_periods:
                try:
                    logger.info(
                        f"Processing expired grace period for subscription {subscription.id} "
                        f"(org {subscription.org_id})"
                    )
                    
                    # Get subscription manager
                    if not self.subscription_manager:
                        if not self.payment_processor:
                            self.payment_processor = PaymentProcessor()
                        self.subscription_manager = SubscriptionManager(
                            db=db,
                            payment_processor=self.payment_processor
                        )
                    
                    # Handle grace period expiration
                    await self.subscription_manager.handle_grace_period_expiration(
                        subscription_id=subscription.id
                    )
                    processed_count += 1
                    
                    logger.info(
                        f"Grace period expired and subscription canceled for "
                        f"subscription {subscription.id}"
                    )
                    
                except Exception as e:
                    logger.error(
                        f"Failed to process grace period expiration for "
                        f"subscription {subscription.id}: {e}"
                    )
                    continue
            
            logger.info(
                f"Grace period expiration check completed: {processed_count} "
                f"subscriptions canceled"
            )
            
        except Exception as e:
            logger.error(f"Grace period expiration check job failed: {e}")
        finally:
            if db:
                db.close()
    
    async def _scheduled_downgrade_job(self):
        """
        Job 4: Execute scheduled plan downgrades at period end
        
        This job runs daily and applies scheduled plan changes that have
        reached their scheduled date.
        """
        logger.info("Starting scheduled downgrade job")
        db = None
        
        try:
            db = self.db_session_factory()
            now = datetime.utcnow()
            
            # Find subscriptions with scheduled downgrades that are due
            scheduled_downgrades = db.query(Subscription).filter(
                and_(
                    Subscription.scheduled_plan_change.isnot(None),
                    Subscription.scheduled_change_date.isnot(None),
                    Subscription.scheduled_change_date <= now
                )
            ).all()
            
            processed_count = 0
            for subscription in scheduled_downgrades:
                try:
                    logger.info(
                        f"Executing scheduled downgrade for subscription {subscription.id} "
                        f"from {subscription.plan_tier} to {subscription.scheduled_plan_change}"
                    )
                    
                    # Get subscription manager
                    if not self.subscription_manager:
                        if not self.payment_processor:
                            self.payment_processor = PaymentProcessor()
                        self.subscription_manager = SubscriptionManager(
                            db=db,
                            payment_processor=self.payment_processor
                        )
                    
                    # Execute the scheduled downgrade
                    await self.subscription_manager.execute_scheduled_downgrade(
                        subscription_id=subscription.id
                    )
                    processed_count += 1
                    
                    logger.info(
                        f"Scheduled downgrade executed successfully for "
                        f"subscription {subscription.id}"
                    )
                    
                except Exception as e:
                    logger.error(
                        f"Failed to execute scheduled downgrade for subscription "
                        f"{subscription.id}: {e}"
                    )
                    continue
            
            logger.info(
                f"Scheduled downgrade job completed: {processed_count} downgrades executed"
            )
            
        except Exception as e:
            logger.error(f"Scheduled downgrade job failed: {e}")
        finally:
            if db:
                db.close()
    
    async def _data_retention_cleanup_job(self):
        """
        Job 5: Daily data retention cleanup
        
        This job runs daily at 2 AM UTC and deletes expired analysis data
        based on each organization's plan-specific retention period.
        """
        logger.info("Starting data retention cleanup job")
        db = None
        
        try:
            db = self.db_session_factory()
            
            # Initialize data retention cleanup service
            cleanup_service = DataRetentionCleanupService(db)
            
            # Run cleanup for all organizations
            stats = await cleanup_service.cleanup_expired_data()
            
            logger.info(
                f"Data retention cleanup completed: {stats['organizations_processed']} orgs processed, "
                f"{stats['total_analyses_deleted']} analyses deleted, "
                f"{stats['total_transactions_deleted']} transactions deleted"
            )
            
        except Exception as e:
            logger.error(f"Data retention cleanup job failed: {e}")
        finally:
            if db:
                db.close()


# Singleton instance for application-wide access
_scheduler_instance: Optional[BackgroundJobScheduler] = None


def get_scheduler() -> Optional[BackgroundJobScheduler]:
    """Get the global scheduler instance"""
    return _scheduler_instance


def initialize_scheduler(
    db_session_factory,
    subscription_manager: Optional[SubscriptionManager] = None,
    payment_processor: Optional[PaymentProcessor] = None
) -> BackgroundJobScheduler:
    """
    Initialize and start the global background job scheduler
    
    Args:
        db_session_factory: Factory function that returns a new database session
        subscription_manager: Optional SubscriptionManager instance
        payment_processor: Optional PaymentProcessor instance
        
    Returns:
        BackgroundJobScheduler instance
    """
    global _scheduler_instance
    
    if _scheduler_instance is not None:
        logger.warning("Scheduler already initialized, returning existing instance")
        return _scheduler_instance
    
    _scheduler_instance = BackgroundJobScheduler(
        db_session_factory=db_session_factory,
        subscription_manager=subscription_manager,
        payment_processor=payment_processor
    )
    _scheduler_instance.start()
    
    return _scheduler_instance


def shutdown_scheduler():
    """Shutdown the global scheduler instance"""
    global _scheduler_instance
    
    if _scheduler_instance:
        _scheduler_instance.shutdown()
        _scheduler_instance = None
