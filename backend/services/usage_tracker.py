"""
Usage Tracker Service
Records and queries resource consumption for billing and usage enforcement
"""
import logging
from typing import Optional, List, Literal
from uuid import UUID
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

from models_billing import UsageMetric, Subscription, PLAN_LIMITS
from models_organization import Organization

logger = logging.getLogger(__name__)


class UsageTrackerError(Exception):
    """Base exception for usage tracker errors"""
    pass


class UsageMetricNotFoundError(UsageTrackerError):
    """Usage metric not found for period"""
    pass


class InvalidMetricTypeError(UsageTrackerError):
    """Invalid metric type specified"""
    pass


# Constants for warning and exceeded thresholds
WARNING_THRESHOLD = 0.80  # 80%
EXCEEDED_THRESHOLD = 1.00  # 100%


class UsageTracker:
    """Records and queries resource consumption"""
    
    def __init__(self, db: Session):
        """
        Initialize UsageTracker with database session.
        
        Args:
            db: SQLAlchemy database session
        """
        self.db = db
        logger.info("UsageTracker initialized")
    
    async def increment_usage(
        self,
        org_id: UUID,
        metric_type: Literal["analysis", "api_call", "storage_gb"],
        amount: float = 1.0
    ) -> None:
        """
        Increment usage counter for current billing period.
        
        - Updates usage_metrics table for current period
        - Emits warning event if usage reaches 80% of quota
        - Emits exceeded event if usage reaches 100% of quota
        
        Args:
            org_id: Organization UUID
            metric_type: Type of resource consumed
            amount: Amount to increment (default 1.0)
            
        Raises:
            UsageTrackerError: If usage increment fails
            InvalidMetricTypeError: If metric_type is invalid
        """
        if metric_type not in ["analysis", "api_call", "storage_gb"]:
            raise InvalidMetricTypeError(f"Invalid metric type: {metric_type}")
        
        try:
            # Get organization's current subscription to determine billing period
            subscription = self.db.query(Subscription).filter(
                Subscription.org_id == org_id
            ).first()
            
            if not subscription:
                logger.warning(f"No subscription found for org {org_id}, skipping usage increment")
                return
            
            # Determine current billing period
            current_period_start = subscription.current_period_start or datetime.now(timezone.utc)
            current_period_end = subscription.current_period_end or datetime.now(timezone.utc)
            
            # Get or create usage metric for current period
            usage_metric = self.db.query(UsageMetric).filter(
                and_(
                    UsageMetric.org_id == org_id,
                    UsageMetric.billing_period_start == current_period_start
                )
            ).first()
            
            if not usage_metric:
                # Create new usage metric for this period
                usage_metric = UsageMetric(
                    org_id=org_id,
                    billing_period_start=current_period_start,
                    billing_period_end=current_period_end,
                    analyses_count=0,
                    api_calls_count=0,
                    storage_used_gb=Decimal('0.00')
                )
                self.db.add(usage_metric)
                logger.info(f"Created new usage metric for org {org_id} period {current_period_start}")
            
            # Store previous values for threshold detection
            previous_analyses = usage_metric.analyses_count
            previous_api_calls = usage_metric.api_calls_count
            previous_storage = float(usage_metric.storage_used_gb)
            
            # Increment the appropriate counter
            if metric_type == "analysis":
                usage_metric.analyses_count += int(amount)
                logger.debug(f"Incremented analyses_count for org {org_id}: {usage_metric.analyses_count}")
            elif metric_type == "api_call":
                usage_metric.api_calls_count += int(amount)
                logger.debug(f"Incremented api_calls_count for org {org_id}: {usage_metric.api_calls_count}")
            elif metric_type == "storage_gb":
                usage_metric.storage_used_gb += Decimal(str(amount))
                logger.debug(f"Incremented storage_used_gb for org {org_id}: {usage_metric.storage_used_gb}")
            
            # Update timestamp
            usage_metric.updated_at = datetime.now(timezone.utc)
            
            # Commit the changes
            self.db.commit()
            self.db.refresh(usage_metric)
            
            # Check for threshold events
            await self._check_and_emit_threshold_events(
                org_id=org_id,
                plan_tier=subscription.plan_tier,
                metric_type=metric_type,
                previous_value=previous_analyses if metric_type == "analysis" else (
                    previous_api_calls if metric_type == "api_call" else previous_storage
                ),
                current_value=usage_metric.analyses_count if metric_type == "analysis" else (
                    usage_metric.api_calls_count if metric_type == "api_call" else float(usage_metric.storage_used_gb)
                )
            )
            
            logger.info(
                f"Successfully incremented {metric_type} usage for org {org_id} by {amount}"
            )
            
        except InvalidMetricTypeError:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to increment usage for org {org_id}: {e}")
            raise UsageTrackerError(f"Failed to increment usage: {str(e)}")
    
    async def get_current_usage(
        self,
        org_id: UUID
    ) -> Optional[UsageMetric]:
        """
        Get usage metrics for current billing period.
        
        Args:
            org_id: Organization UUID
            
        Returns:
            UsageMetric with analyses_count, api_calls_count, storage_used_gb
            or None if no usage metric found
        """
        try:
            # Get organization's current subscription
            subscription = self.db.query(Subscription).filter(
                Subscription.org_id == org_id
            ).first()
            
            if not subscription or not subscription.current_period_start:
                logger.warning(f"No active subscription found for org {org_id}")
                return None
            
            # Get usage metric for current period
            usage_metric = self.db.query(UsageMetric).filter(
                and_(
                    UsageMetric.org_id == org_id,
                    UsageMetric.billing_period_start == subscription.current_period_start
                )
            ).first()
            
            if not usage_metric:
                # Create empty usage metric if none exists
                usage_metric = UsageMetric(
                    org_id=org_id,
                    billing_period_start=subscription.current_period_start,
                    billing_period_end=subscription.current_period_end,
                    analyses_count=0,
                    api_calls_count=0,
                    storage_used_gb=Decimal('0.00')
                )
                self.db.add(usage_metric)
                self.db.commit()
                self.db.refresh(usage_metric)
                logger.info(f"Created empty usage metric for org {org_id}")
            
            return usage_metric
            
        except Exception as e:
            logger.error(f"Failed to get current usage for org {org_id}: {e}")
            raise UsageTrackerError(f"Failed to get current usage: {str(e)}")
    
    async def get_usage_history(
        self,
        org_id: UUID,
        periods: int = 12
    ) -> List[UsageMetric]:
        """
        Get historical usage across multiple billing periods.
        
        Args:
            org_id: Organization UUID
            periods: Number of periods to retrieve (default 12)
            
        Returns:
            List of UsageMetrics ordered by period_start descending
        """
        try:
            usage_history = self.db.query(UsageMetric).filter(
                UsageMetric.org_id == org_id
            ).order_by(
                UsageMetric.billing_period_start.desc()
            ).limit(periods).all()
            
            logger.info(f"Retrieved {len(usage_history)} usage periods for org {org_id}")
            return usage_history
            
        except Exception as e:
            logger.error(f"Failed to get usage history for org {org_id}: {e}")
            raise UsageTrackerError(f"Failed to get usage history: {str(e)}")
    
    async def roll_over_period(
        self,
        org_id: UUID,
        new_period_start: datetime,
        new_period_end: datetime
    ) -> None:
        """
        Create new usage record for next billing period.
        
        Called when subscription renews.
        
        Args:
            org_id: Organization UUID
            new_period_start: Start of new period
            new_period_end: End of new period
            
        Raises:
            UsageTrackerError: If rollover fails
        """
        try:
            # Check if usage metric already exists for new period
            existing_metric = self.db.query(UsageMetric).filter(
                and_(
                    UsageMetric.org_id == org_id,
                    UsageMetric.billing_period_start == new_period_start
                )
            ).first()
            
            if existing_metric:
                logger.info(f"Usage metric already exists for org {org_id} period {new_period_start}")
                return
            
            # Create new usage metric with zero counters
            new_usage_metric = UsageMetric(
                org_id=org_id,
                billing_period_start=new_period_start,
                billing_period_end=new_period_end,
                analyses_count=0,
                api_calls_count=0,
                storage_used_gb=Decimal('0.00')
            )
            
            self.db.add(new_usage_metric)
            self.db.commit()
            
            logger.info(
                f"Successfully rolled over usage period for org {org_id} "
                f"to period {new_period_start} - {new_period_end}"
            )
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to roll over usage period for org {org_id}: {e}")
            raise UsageTrackerError(f"Failed to roll over usage period: {str(e)}")
    
    async def _check_and_emit_threshold_events(
        self,
        org_id: UUID,
        plan_tier: str,
        metric_type: str,
        previous_value: float,
        current_value: float
    ) -> None:
        """
        Check if usage crossed warning or exceeded thresholds and emit events.
        
        Args:
            org_id: Organization UUID
            plan_tier: Current plan tier
            metric_type: Type of metric (analysis, api_call, storage_gb)
            previous_value: Previous usage value
            current_value: Current usage value after increment
        """
        try:
            # Get the limit for this plan tier and metric type
            limit = self._get_metric_limit(plan_tier, metric_type)
            
            # Skip threshold checks for unlimited quotas
            if limit == -1:
                return
            
            if limit <= 0:
                return
            
            # Calculate usage percentages
            previous_percentage = (previous_value / limit) if limit > 0 else 0
            current_percentage = (current_value / limit) if limit > 0 else 0
            
            # Check if we crossed the 100% threshold (exceeded)
            if previous_percentage < EXCEEDED_THRESHOLD <= current_percentage:
                await self._emit_exceeded_event(org_id, metric_type, limit)
                logger.warning(
                    f"Quota exceeded for org {org_id}: {metric_type} "
                    f"reached {current_value}/{limit} ({current_percentage:.1%})"
                )
            # Check if we crossed the 80% threshold (warning)
            elif previous_percentage < WARNING_THRESHOLD <= current_percentage < EXCEEDED_THRESHOLD:
                await self._emit_warning_event(org_id, metric_type, limit, current_percentage)
                logger.info(
                    f"Quota warning for org {org_id}: {metric_type} "
                    f"reached {current_value}/{limit} ({current_percentage:.1%})"
                )
                
        except Exception as e:
            logger.error(f"Failed to check threshold events: {e}")
            # Don't raise - threshold events are non-critical
    
    def _get_metric_limit(self, plan_tier: str, metric_type: str) -> int:
        """
        Get the limit for a specific metric type and plan tier.
        
        Args:
            plan_tier: Plan tier (free, pro, enterprise)
            metric_type: Metric type (analysis, api_call, storage_gb)
            
        Returns:
            Limit value (-1 for unlimited)
        """
        plan_config = PLAN_LIMITS.get(plan_tier, PLAN_LIMITS['free'])
        
        if metric_type == "analysis":
            return plan_config.get('analyses_per_month', 0)
        elif metric_type == "api_call":
            return plan_config.get('api_calls_per_hour', 0)
        elif metric_type == "storage_gb":
            return int(plan_config.get('storage_gb', 0))
        
        return 0
    
    async def _emit_warning_event(
        self,
        org_id: UUID,
        metric_type: str,
        limit: int,
        current_percentage: float
    ) -> None:
        """
        Emit warning event when usage reaches 80% of quota.
        
        Args:
            org_id: Organization UUID
            metric_type: Type of metric
            limit: Quota limit
            current_percentage: Current usage percentage
        """
        # TODO: Implement event emission system (e.g., publish to message queue, webhook, etc.)
        # For now, just log the warning
        logger.warning(
            f"[USAGE_WARNING] org_id={org_id} metric={metric_type} "
            f"threshold=80% current={current_percentage:.1%} limit={limit}"
        )
        
        # In a full implementation, this would:
        # 1. Create a notification record in the database
        # 2. Publish event to message queue for notification service
        # 3. Trigger email/webhook notifications
    
    async def _emit_exceeded_event(
        self,
        org_id: UUID,
        metric_type: str,
        limit: int
    ) -> None:
        """
        Emit exceeded event when usage reaches 100% of quota.
        
        Args:
            org_id: Organization UUID
            metric_type: Type of metric
            limit: Quota limit
        """
        # TODO: Implement event emission system
        # For now, just log the exceeded event
        logger.error(
            f"[USAGE_EXCEEDED] org_id={org_id} metric={metric_type} "
            f"threshold=100% limit={limit}"
        )
        
        # In a full implementation, this would:
        # 1. Create a notification record in the database
        # 2. Publish event to message queue for notification service
        # 3. Trigger email/webhook notifications
        # 4. Update UI banners/alerts


def get_usage_tracker(db: Session) -> UsageTracker:
    """
    Factory function to create UsageTracker instance.
    
    Args:
        db: SQLAlchemy database session
        
    Returns:
        UsageTracker instance
    """
    return UsageTracker(db)
