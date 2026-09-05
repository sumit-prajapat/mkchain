"""
Usage Enforcer Middleware
Real-time quota and feature access control for subscription-based billing
"""
import logging
from typing import Callable, Optional
from uuid import UUID
from datetime import datetime, timezone, timedelta
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models_billing import (
    Subscription, UsageMetric, RateLimit, PLAN_LIMITS,
    PlanTier, SubscriptionStatus, has_feature_access
)
from database import SessionLocal

logger = logging.getLogger(__name__)


class UsageEnforcerError(Exception):
    """Base exception for usage enforcer errors"""
    pass


class QuotaExceededError(UsageEnforcerError):
    """Usage quota exceeded"""
    pass


class FeatureAccessDeniedError(UsageEnforcerError):
    """Feature not available in current plan"""
    pass


class RateLimitExceededError(UsageEnforcerError):
    """API rate limit exceeded"""
    pass


class UsageEnforcerMiddleware:
    """Middleware for quota and feature access enforcement"""
    
    # Plan limits configuration
    PLAN_LIMITS = {
        PlanTier.FREE: {
            "analyses_per_month": 10,
            "api_calls_per_hour": 100,
            "storage_gb": 1.0,
            "features": ["basic_analysis", "2d_graph"]
        },
        PlanTier.PRO: {
            "analyses_per_month": 100,
            "api_calls_per_hour": 1000,
            "storage_gb": 50.0,
            "features": ["basic_analysis", "2d_graph", "3d_graph", 
                        "ai_summary", "pdf_report", "comparison"]
        },
        PlanTier.ENTERPRISE: {
            "analyses_per_month": -1,  # unlimited
            "api_calls_per_hour": 5000,
            "storage_gb": 500.0,
            "features": ["*"]  # all features
        }
    }
    
    # Feature to endpoint mapping
    FEATURE_ENDPOINTS = {
        "ai_summary": ["/ai-summary"],
        "pdf_report": ["/pdf"],
        "comparison": ["/api/compare"],
        "custom_integration": ["/api/v1/integrations"]
    }
    
    # Analysis endpoints that consume quota
    ANALYSIS_ENDPOINTS = ["/api/analyze", "/api/analysis"]
    
    # Webhook endpoints (excluded from usage enforcement)
    WEBHOOK_ENDPOINTS = ["/api/billing/webhooks/stripe"]
    
    def __init__(self, app):
        self.app = app
        logger.info("UsageEnforcerMiddleware initialized")
    
    async def __call__(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """
        Enforce usage limits before request processing.
        
        1. Extract org_id from request context (set by auth middleware)
        2. Get organization's current plan tier
        3. Check endpoint-specific quota:
           - /api/analyze: check analyses_per_month
           - /api/reports/{id}/ai-summary: check feature access
           - All endpoints: check api_calls_per_hour rate limit
        4. If quota exceeded or feature restricted: raise HTTPException
        5. If allowed: pass request through and increment usage after
        
        Raises:
            HTTPException: 429 for quota exceeded, 403 for feature access denied
        """
        # Skip enforcement for non-API endpoints and health checks
        if not request.url.path.startswith("/api") or request.url.path == "/":
            return await call_next(request)
        
        # Skip enforcement for webhook endpoints (Stripe webhooks don't have org context)
        if any(request.url.path.startswith(webhook) for webhook in self.WEBHOOK_ENDPOINTS):
            return await call_next(request)
        
        # Extract org_id from request state (set by auth middleware)
        org_id = getattr(request.state, "org_id", None)
        
        # Skip enforcement if no org_id (unauthenticated requests handled by auth middleware)
        if not org_id:
            return await call_next(request)
        
        # Get database session
        db = SessionLocal()
        try:
            # Get organization's subscription and plan tier
            subscription = db.query(Subscription).filter(
                Subscription.org_id == org_id
            ).first()
            
            if not subscription:
                logger.warning(f"No subscription found for org {org_id}")
                # Default to free tier if no subscription
                plan_tier = PlanTier.FREE
                status = SubscriptionStatus.ACTIVE
            else:
                plan_tier = subscription.plan_tier
                status = subscription.status
            
            # Check if subscription is active (including trialing and grace period)
            if status not in [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]:
                if subscription and subscription.is_in_grace_period():
                    # Allow access during grace period
                    pass
                elif status == SubscriptionStatus.PAST_DUE:
                    return JSONResponse(
                        status_code=402,
                        content={
                            "error": "Payment required",
                            "message": "Your subscription payment is overdue. Please update your payment method.",
                            "status": status
                        }
                    )
                elif status in [SubscriptionStatus.CANCELED, SubscriptionStatus.UNPAID]:
                    # Downgrade to free tier
                    plan_tier = PlanTier.FREE
            
            # Check rate limit for all API calls
            try:
                await self.check_rate_limit(db, org_id, plan_tier)
            except RateLimitExceededError as e:
                limit = self.PLAN_LIMITS[plan_tier]["api_calls_per_hour"]
                retry_after = self._get_retry_after_seconds()
                
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "Rate limit exceeded",
                        "message": str(e),
                        "limit": limit,
                        "retry_after": retry_after
                    },
                    headers={
                        "Retry-After": str(retry_after),
                        "X-RateLimit-Limit": str(limit),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(int((datetime.now(timezone.utc) + timedelta(seconds=retry_after)).timestamp()))
                    }
                )
            
            # Check analysis quota for analysis endpoints
            if self._is_analysis_endpoint(request.url.path):
                try:
                    await self.check_analysis_quota(db, org_id, plan_tier)
                except QuotaExceededError as e:
                    limit = self.PLAN_LIMITS[plan_tier]["analyses_per_month"]
                    
                    return JSONResponse(
                        status_code=429,
                        content={
                            "error": "Quota exceeded",
                            "message": str(e),
                            "quota_type": "analyses_per_month",
                            "limit": limit,
                            "upgrade_url": "/billing/plans"
                        }
                    )
            
            # Check feature access for premium features
            feature = self._get_required_feature(request.url.path)
            if feature:
                try:
                    await self.check_feature_access(db, org_id, plan_tier, feature)
                except FeatureAccessDeniedError as e:
                    required_plan = self._get_required_plan_for_feature(feature)
                    
                    return JSONResponse(
                        status_code=403,
                        content={
                            "error": "Feature access denied",
                            "message": str(e),
                            "feature": feature,
                            "current_plan": plan_tier,
                            "required_plan": required_plan,
                            "upgrade_url": "/billing/plans"
                        }
                    )
            
            # Get rate limit info for headers
            rate_limit_info = await self._get_rate_limit_info(db, org_id, plan_tier)
            
            # Process the request
            response = await call_next(request)
            
            # Add rate limit headers to response
            if rate_limit_info:
                response.headers["X-RateLimit-Limit"] = str(rate_limit_info["limit"])
                response.headers["X-RateLimit-Remaining"] = str(rate_limit_info["remaining"])
                response.headers["X-RateLimit-Reset"] = str(rate_limit_info["reset"])
            
            # Increment usage after successful request (status code < 400)
            if response.status_code < 400:
                # Usage increment is handled by individual services
                # Rate limit counter is already incremented in check_rate_limit
                pass
            
            return response
            
        except (QuotaExceededError, FeatureAccessDeniedError, RateLimitExceededError):
            # These are already handled above
            raise
        except Exception as e:
            logger.error(f"Error in UsageEnforcerMiddleware: {e}", exc_info=True)
            # Don't block requests on middleware errors
            return await call_next(request)
        finally:
            db.close()
    
    async def check_analysis_quota(
        self,
        db: Session,
        org_id: UUID,
        plan_tier: str
    ) -> bool:
        """
        Check if organization can create another analysis.
        
        Args:
            db: Database session
            org_id: Organization UUID
            plan_tier: Current plan tier
            
        Returns:
            True if quota available
            
        Raises:
            QuotaExceededError: If analysis quota exceeded
        """
        try:
            # Get plan limit
            limit = self.PLAN_LIMITS[plan_tier]["analyses_per_month"]
            
            # Unlimited quota for enterprise
            if limit == -1:
                return True
            
            # Get current usage
            subscription = db.query(Subscription).filter(
                Subscription.org_id == org_id
            ).first()
            
            if not subscription or not subscription.current_period_start:
                logger.warning(f"No active subscription found for org {org_id}")
                # Default to free tier limits
                limit = self.PLAN_LIMITS[PlanTier.FREE]["analyses_per_month"]
            
            current_period_start = subscription.current_period_start if subscription else datetime.now(timezone.utc)
            
            # Get usage metric for current period
            usage_metric = db.query(UsageMetric).filter(
                and_(
                    UsageMetric.org_id == org_id,
                    UsageMetric.billing_period_start == current_period_start
                )
            ).first()
            
            current_usage = usage_metric.analyses_count if usage_metric else 0
            
            # Check if quota exceeded
            if current_usage >= limit:
                logger.warning(
                    f"Analysis quota exceeded for org {org_id}: {current_usage}/{limit}"
                )
                raise QuotaExceededError(
                    f"Monthly analysis quota exceeded. Please upgrade your plan."
                )
            
            logger.debug(
                f"Analysis quota check passed for org {org_id}: {current_usage}/{limit}"
            )
            return True
            
        except QuotaExceededError:
            raise
        except Exception as e:
            logger.error(f"Error checking analysis quota: {e}")
            # On error, allow the request (fail open)
            return True
    
    async def check_feature_access(
        self,
        db: Session,
        org_id: UUID,
        plan_tier: str,
        feature: str
    ) -> bool:
        """
        Check if plan tier includes feature access.
        
        Args:
            db: Database session
            org_id: Organization UUID
            plan_tier: Current plan tier
            feature: Feature name to check
            
        Returns:
            True if feature access allowed
            
        Raises:
            FeatureAccessDeniedError: If feature not available in plan
        """
        try:
            # Check if organization is in trial period (allow all features)
            subscription = db.query(Subscription).filter(
                Subscription.org_id == org_id
            ).first()
            
            if subscription and subscription.status == SubscriptionStatus.TRIALING:
                logger.debug(f"Feature access allowed during trial for org {org_id}")
                return True
            
            # Get plan features
            plan_features = self.PLAN_LIMITS[plan_tier].get("features", [])
            
            # Enterprise has all features (*)
            if "*" in plan_features:
                return True
            
            # Check if feature is in plan
            if feature not in plan_features:
                logger.warning(
                    f"Feature access denied for org {org_id}: {feature} not in {plan_tier} plan"
                )
                required_plan = self._get_required_plan_for_feature(feature)
                raise FeatureAccessDeniedError(
                    f"This feature requires {required_plan} plan. Please upgrade."
                )
            
            logger.debug(
                f"Feature access granted for org {org_id}: {feature} in {plan_tier} plan"
            )
            return True
            
        except FeatureAccessDeniedError:
            raise
        except Exception as e:
            logger.error(f"Error checking feature access: {e}")
            # On error, allow the request (fail open)
            return True
    
    async def check_rate_limit(
        self,
        db: Session,
        org_id: UUID,
        plan_tier: str
    ) -> bool:
        """
        Check hourly API call rate limit.
        
        Args:
            db: Database session
            org_id: Organization UUID
            plan_tier: Current plan tier
            
        Returns:
            True if rate limit not exceeded
            
        Raises:
            RateLimitExceededError: If rate limit exceeded
        """
        try:
            # Get plan rate limit
            limit = self.PLAN_LIMITS[plan_tier]["api_calls_per_hour"]
            
            # Get current hour window
            now = datetime.now(timezone.utc)
            window_start = now.replace(minute=0, second=0, microsecond=0)
            window_end = window_start + timedelta(hours=1)
            
            # Get or create rate limit record
            rate_limit = db.query(RateLimit).filter(
                and_(
                    RateLimit.org_id == org_id,
                    RateLimit.window_start == window_start
                )
            ).first()
            
            if not rate_limit:
                # Create new rate limit record for this window
                rate_limit = RateLimit(
                    org_id=org_id,
                    window_start=window_start,
                    window_end=window_end,
                    request_count=0
                )
                db.add(rate_limit)
                db.commit()
                db.refresh(rate_limit)
            
            # Check if limit exceeded
            if rate_limit.request_count >= limit:
                logger.warning(
                    f"Rate limit exceeded for org {org_id}: {rate_limit.request_count}/{limit}"
                )
                raise RateLimitExceededError(
                    f"Hourly API quota exceeded. Please upgrade your plan or wait for limit reset."
                )
            
            # Increment counter
            rate_limit.request_count += 1
            db.commit()
            
            logger.debug(
                f"Rate limit check passed for org {org_id}: {rate_limit.request_count}/{limit}"
            )
            return True
            
        except RateLimitExceededError:
            raise
        except Exception as e:
            logger.error(f"Error checking rate limit: {e}")
            db.rollback()
            # On error, allow the request (fail open)
            return True
    
    def _is_analysis_endpoint(self, path: str) -> bool:
        """Check if endpoint is an analysis creation endpoint"""
        return any(path.startswith(endpoint) for endpoint in self.ANALYSIS_ENDPOINTS)
    
    def _get_required_feature(self, path: str) -> Optional[str]:
        """
        Determine which premium feature is required for this endpoint.
        
        Returns:
            Feature name or None if no premium feature required
        """
        for feature, endpoint_patterns in self.FEATURE_ENDPOINTS.items():
            for pattern in endpoint_patterns:
                if pattern in path:
                    return feature
        return None
    
    def _get_required_plan_for_feature(self, feature: str) -> str:
        """
        Determine minimum plan tier required for a feature.
        
        Args:
            feature: Feature name
            
        Returns:
            Plan tier name (pro or enterprise)
        """
        # Check which plans have this feature
        for plan_tier in [PlanTier.PRO, PlanTier.ENTERPRISE]:
            plan_features = self.PLAN_LIMITS[plan_tier].get("features", [])
            if "*" in plan_features or feature in plan_features:
                return plan_tier
        
        return PlanTier.PRO  # Default to pro
    
    def _get_retry_after_seconds(self) -> int:
        """
        Calculate seconds until next hour (rate limit reset).
        
        Returns:
            Seconds until next hour
        """
        now = datetime.now(timezone.utc)
        next_hour = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        return int((next_hour - now).total_seconds())
    
    async def _get_rate_limit_info(
        self,
        db: Session,
        org_id: UUID,
        plan_tier: str
    ) -> Optional[dict]:
        """
        Get rate limit information for response headers.
        
        Args:
            db: Database session
            org_id: Organization UUID
            plan_tier: Current plan tier
            
        Returns:
            Dictionary with limit, remaining, and reset timestamp
        """
        try:
            limit = self.PLAN_LIMITS[plan_tier]["api_calls_per_hour"]
            
            # Get current hour window
            now = datetime.now(timezone.utc)
            window_start = now.replace(minute=0, second=0, microsecond=0)
            
            # Get rate limit record
            rate_limit = db.query(RateLimit).filter(
                and_(
                    RateLimit.org_id == org_id,
                    RateLimit.window_start == window_start
                )
            ).first()
            
            current_count = rate_limit.request_count if rate_limit else 0
            remaining = max(0, limit - current_count)
            
            # Calculate reset timestamp
            window_end = window_start + timedelta(hours=1)
            reset_timestamp = int(window_end.timestamp())
            
            return {
                "limit": limit,
                "remaining": remaining,
                "reset": reset_timestamp
            }
            
        except Exception as e:
            logger.error(f"Error getting rate limit info: {e}")
            return None


async def usage_enforcer_middleware(request: Request, call_next: Callable) -> Response:
    """
    Standalone middleware function for usage enforcement.
    Can be added to FastAPI app with: app.middleware('http')(usage_enforcer_middleware)
    """
    enforcer = UsageEnforcerMiddleware(None)
    return await enforcer(request, call_next)
