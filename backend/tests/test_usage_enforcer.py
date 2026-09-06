"""
Unit tests for UsageEnforcerMiddleware
Tests quota checking, feature access control, and rate limiting
"""
import pytest
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from decimal import Decimal
from unittest.mock import Mock, AsyncMock, patch
from fastapi import Request
from fastapi.responses import JSONResponse

from middleware.usage_enforcer import (
    UsageEnforcerMiddleware,
    QuotaExceededError,
    FeatureAccessDeniedError,
    RateLimitExceededError
)
from models_billing import (
    Subscription, UsageMetric, RateLimit,
    PlanTier, SubscriptionStatus
)


class TestUsageEnforcerMiddleware:
    """Test suite for UsageEnforcerMiddleware"""
    
    def test_plan_limits_constant_defined(self):
        """Test that PLAN_LIMITS constant is properly defined"""
        middleware = UsageEnforcerMiddleware(None)
        
        # Check all plan tiers are defined
        assert PlanTier.FREE in middleware.PLAN_LIMITS
        assert PlanTier.PRO in middleware.PLAN_LIMITS
        assert PlanTier.ENTERPRISE in middleware.PLAN_LIMITS
        
        # Check free tier limits
        free_limits = middleware.PLAN_LIMITS[PlanTier.FREE]
        assert free_limits["analyses_per_month"] == 10
        assert free_limits["api_calls_per_hour"] == 100
        assert free_limits["storage_gb"] == 1.0
        assert "basic_analysis" in free_limits["features"]
        
        # Check pro tier limits
        pro_limits = middleware.PLAN_LIMITS[PlanTier.PRO]
        assert pro_limits["analyses_per_month"] == 100
        assert pro_limits["api_calls_per_hour"] == 1000
        assert pro_limits["storage_gb"] == 50.0
        assert "ai_summary" in pro_limits["features"]
        
        # Check enterprise tier limits (unlimited analyses)
        enterprise_limits = middleware.PLAN_LIMITS[PlanTier.ENTERPRISE]
        assert enterprise_limits["analyses_per_month"] == -1  # unlimited
        assert enterprise_limits["api_calls_per_hour"] == 5000
        assert "*" in enterprise_limits["features"]
    
    @pytest.mark.asyncio
    async def test_check_analysis_quota_within_limit(self):
        """Test analysis quota check when usage is within limit"""
        middleware = UsageEnforcerMiddleware(None)
        
        # Mock database and subscription
        mock_db = Mock()
        org_id = uuid4()
        
        # Create mock subscription
        mock_subscription = Mock(spec=Subscription)
        mock_subscription.org_id = org_id
        mock_subscription.plan_tier = PlanTier.FREE
        mock_subscription.current_period_start = datetime.now(timezone.utc)
        mock_subscription.current_period_end = datetime.now(timezone.utc) + timedelta(days=30)
        
        # Create mock usage metric (5 analyses used out of 10)
        mock_usage = Mock(spec=UsageMetric)
        mock_usage.analyses_count = 5
        
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_subscription,
            mock_usage
        ]
        
        # Should pass without raising exception
        result = await middleware.check_analysis_quota(mock_db, org_id, PlanTier.FREE)
        assert result is True
    
    @pytest.mark.asyncio
    async def test_check_analysis_quota_exceeded(self):
        """Test analysis quota check when quota is exceeded"""
        middleware = UsageEnforcerMiddleware(None)
        
        # Mock database and subscription
        mock_db = Mock()
        org_id = uuid4()
        
        # Create mock subscription
        mock_subscription = Mock(spec=Subscription)
        mock_subscription.org_id = org_id
        mock_subscription.plan_tier = PlanTier.FREE
        mock_subscription.current_period_start = datetime.now(timezone.utc)
        
        # Create mock usage metric (10 analyses used - at limit)
        mock_usage = Mock(spec=UsageMetric)
        mock_usage.analyses_count = 10
        
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_subscription,
            mock_usage
        ]
        
        # Should raise QuotaExceededError
        with pytest.raises(QuotaExceededError) as excinfo:
            await middleware.check_analysis_quota(mock_db, org_id, PlanTier.FREE)
        
        assert "quota exceeded" in str(excinfo.value).lower()
    
    @pytest.mark.asyncio
    async def test_check_analysis_quota_unlimited_enterprise(self):
        """Test that enterprise plan has unlimited analysis quota"""
        middleware = UsageEnforcerMiddleware(None)
        
        mock_db = Mock()
        org_id = uuid4()
        
        # Enterprise tier should always pass regardless of usage
        result = await middleware.check_analysis_quota(mock_db, org_id, PlanTier.ENTERPRISE)
        assert result is True
    
    @pytest.mark.asyncio
    async def test_check_feature_access_allowed(self):
        """Test feature access check when feature is included in plan"""
        middleware = UsageEnforcerMiddleware(None)
        
        mock_db = Mock()
        org_id = uuid4()
        
        # Mock subscription
        mock_subscription = Mock(spec=Subscription)
        mock_subscription.status = SubscriptionStatus.ACTIVE
        mock_db.query.return_value.filter.return_value.first.return_value = mock_subscription
        
        # Pro plan should have access to ai_summary
        result = await middleware.check_feature_access(
            mock_db, org_id, PlanTier.PRO, "ai_summary"
        )
        assert result is True
    
    @pytest.mark.asyncio
    async def test_check_feature_access_denied(self):
        """Test feature access check when feature is not in plan"""
        middleware = UsageEnforcerMiddleware(None)
        
        mock_db = Mock()
        org_id = uuid4()
        
        # Mock subscription
        mock_subscription = Mock(spec=Subscription)
        mock_subscription.status = SubscriptionStatus.ACTIVE
        mock_db.query.return_value.filter.return_value.first.return_value = mock_subscription
        
        # Free plan should not have access to ai_summary
        with pytest.raises(FeatureAccessDeniedError) as excinfo:
            await middleware.check_feature_access(
                mock_db, org_id, PlanTier.FREE, "ai_summary"
            )
        
        assert "upgrade" in str(excinfo.value).lower()
    
    @pytest.mark.asyncio
    async def test_check_feature_access_during_trial(self):
        """Test that all features are accessible during trial period"""
        middleware = UsageEnforcerMiddleware(None)
        
        mock_db = Mock()
        org_id = uuid4()
        
        # Mock subscription in trial status
        mock_subscription = Mock(spec=Subscription)
        mock_subscription.status = SubscriptionStatus.TRIALING
        mock_db.query.return_value.filter.return_value.first.return_value = mock_subscription
        
        # Should allow access to premium features during trial
        result = await middleware.check_feature_access(
            mock_db, org_id, PlanTier.FREE, "ai_summary"
        )
        assert result is True
    
    @pytest.mark.asyncio
    async def test_check_rate_limit_within_limit(self):
        """Test rate limit check when within hourly limit"""
        middleware = UsageEnforcerMiddleware(None)
        
        mock_db = Mock()
        org_id = uuid4()
        
        # Mock rate limit record (50 requests out of 100)
        mock_rate_limit = Mock(spec=RateLimit)
        mock_rate_limit.request_count = 50
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_rate_limit
        mock_db.commit = Mock()
        
        # Should pass
        result = await middleware.check_rate_limit(mock_db, org_id, PlanTier.FREE)
        assert result is True
        
        # Should increment counter
        assert mock_rate_limit.request_count == 51
    
    @pytest.mark.asyncio
    async def test_check_rate_limit_exceeded(self):
        """Test rate limit check when limit is exceeded"""
        middleware = UsageEnforcerMiddleware(None)
        
        mock_db = Mock()
        org_id = uuid4()
        
        # Mock rate limit record (100 requests - at limit)
        mock_rate_limit = Mock(spec=RateLimit)
        mock_rate_limit.request_count = 100
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_rate_limit
        
        # Should raise RateLimitExceededError
        with pytest.raises(RateLimitExceededError) as excinfo:
            await middleware.check_rate_limit(mock_db, org_id, PlanTier.FREE)
        
        assert "quota exceeded" in str(excinfo.value).lower()
    
    @pytest.mark.asyncio
    async def test_check_rate_limit_creates_new_window(self):
        """Test that rate limit handles case when no existing window exists"""
        middleware = UsageEnforcerMiddleware(None)
        
        mock_db = Mock()
        org_id = uuid4()
        
        # Mock query to return None (no existing rate limit)
        mock_db.query.return_value.filter.return_value.first.return_value = None
        mock_db.add = Mock()
        mock_db.commit = Mock()
        mock_db.refresh = Mock()
        
        # Should pass without error (fail-open behavior on errors)
        result = await middleware.check_rate_limit(mock_db, org_id, PlanTier.FREE)
        assert result is True
    
    def test_is_analysis_endpoint(self):
        """Test analysis endpoint detection"""
        middleware = UsageEnforcerMiddleware(None)
        
        assert middleware._is_analysis_endpoint("/api/analyze") is True
        assert middleware._is_analysis_endpoint("/api/analysis") is True
        assert middleware._is_analysis_endpoint("/api/reports/123") is False
        assert middleware._is_analysis_endpoint("/api/compare") is False
    
    def test_get_required_feature(self):
        """Test feature requirement detection from endpoint"""
        middleware = UsageEnforcerMiddleware(None)
        
        assert middleware._get_required_feature("/api/reports/123/ai-summary") == "ai_summary"
        assert middleware._get_required_feature("/api/reports/456/pdf") == "pdf_report"
        assert middleware._get_required_feature("/api/compare") == "comparison"
        assert middleware._get_required_feature("/api/analyze") is None
    
    def test_get_required_plan_for_feature(self):
        """Test minimum plan tier determination for features"""
        middleware = UsageEnforcerMiddleware(None)
        
        # ai_summary requires pro
        assert middleware._get_required_plan_for_feature("ai_summary") == PlanTier.PRO
        
        # pdf_report requires pro
        assert middleware._get_required_plan_for_feature("pdf_report") == PlanTier.PRO
        
        # comparison requires pro
        assert middleware._get_required_plan_for_feature("comparison") == PlanTier.PRO
    
    def test_get_retry_after_seconds(self):
        """Test retry after calculation"""
        middleware = UsageEnforcerMiddleware(None)
        
        retry_after = middleware._get_retry_after_seconds()
        
        # Should be between 0 and 3600 seconds (1 hour)
        assert 0 < retry_after <= 3600
    
    @pytest.mark.asyncio
    async def test_get_rate_limit_info(self):
        """Test rate limit info for response headers"""
        middleware = UsageEnforcerMiddleware(None)
        
        mock_db = Mock()
        org_id = uuid4()
        
        # Mock rate limit record
        mock_rate_limit = Mock(spec=RateLimit)
        mock_rate_limit.request_count = 75
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_rate_limit
        
        info = await middleware._get_rate_limit_info(mock_db, org_id, PlanTier.FREE)
        
        assert info is not None
        assert info["limit"] == 100
        assert info["remaining"] == 25
        assert "reset" in info


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
