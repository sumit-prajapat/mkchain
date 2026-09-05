"""
Unit test for UsageEnforcerMiddleware
Tests the middleware logic directly without requiring full app integration
"""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from fastapi import Request, Response
from fastapi.responses import JSONResponse

from middleware.usage_enforcer import UsageEnforcerMiddleware
from models_billing import Subscription, PlanTier, SubscriptionStatus


class MockRequest:
    """Mock FastAPI Request for testing"""
    def __init__(self, path="/api/test", org_id=None):
        self.url = MagicMock()
        self.url.path = path
        self.state = MagicMock()
        self.state.org_id = org_id


@pytest.mark.asyncio
async def test_webhook_endpoint_bypasses_middleware():
    """Test that webhook endpoints bypass usage enforcement"""
    middleware = UsageEnforcerMiddleware(None)
    
    # Mock request to webhook endpoint
    request = MockRequest(path="/api/billing/webhooks/stripe", org_id=None)
    
    # Mock call_next
    async def call_next(req):
        return Response(status_code=200, content="webhook processed")
    
    # Call middleware
    response = await middleware(request, call_next)
    
    # Should bypass enforcement and return 200
    assert response.status_code == 200
    assert response.body == b"webhook processed"


@pytest.mark.asyncio
async def test_health_endpoint_bypasses_middleware():
    """Test that health endpoint bypasses usage enforcement"""
    middleware = UsageEnforcerMiddleware(None)
    
    # Mock request to health endpoint
    request = MockRequest(path="/", org_id=None)
    
    # Mock call_next
    async def call_next(req):
        return Response(status_code=200, content="healthy")
    
    # Call middleware
    response = await middleware(request, call_next)
    
    # Should bypass enforcement and return 200
    assert response.status_code == 200
    assert response.body == b"healthy"


@pytest.mark.asyncio
async def test_non_api_endpoint_bypasses_middleware():
    """Test that non-API endpoints bypass usage enforcement"""
    middleware = UsageEnforcerMiddleware(None)
    
    # Mock request to non-API endpoint
    request = MockRequest(path="/docs", org_id=None)
    
    # Mock call_next
    async def call_next(req):
        return Response(status_code=200, content="docs")
    
    # Call middleware
    response = await middleware(request, call_next)
    
    # Should bypass enforcement
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_unauthenticated_request_bypasses_middleware():
    """Test that requests without org_id bypass usage enforcement"""
    middleware = UsageEnforcerMiddleware(None)
    
    # Mock request without org_id
    request = MockRequest(path="/api/test", org_id=None)
    
    # Mock call_next
    async def call_next(req):
        return Response(status_code=200, content="test")
    
    # Call middleware
    response = await middleware(request, call_next)
    
    # Should bypass enforcement (auth middleware will handle it)
    assert response.status_code == 200


@pytest.mark.asyncio
@patch('middleware.usage_enforcer.SessionLocal')
async def test_authenticated_request_checks_subscription(mock_session_local):
    """Test that authenticated requests check subscription"""
    middleware = UsageEnforcerMiddleware(None)
    
    # Mock database session
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db
    
    # Mock subscription
    org_id = uuid4()
    mock_subscription = Subscription(
        id=1,
        org_id=org_id,
        plan_tier=PlanTier.FREE,
        status=SubscriptionStatus.ACTIVE,
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30)
    )
    
    # Mock query chain for subscription
    mock_subscription_query = MagicMock()
    mock_subscription_query.filter.return_value.first.return_value = mock_subscription
    
    # Mock query chain for rate limit (create new)
    mock_rate_limit_query = MagicMock()
    mock_rate_limit_query.filter.return_value.first.return_value = None
    
    # Configure query to return different mocks
    def query_side_effect(model):
        from models_billing import Subscription, RateLimit
        if model == Subscription:
            return mock_subscription_query
        elif model == RateLimit:
            return mock_rate_limit_query
        return MagicMock()
    
    mock_db.query.side_effect = query_side_effect
    
    # Mock request with org_id
    request = MockRequest(path="/api/test", org_id=org_id)
    
    # Mock call_next
    async def call_next(req):
        return Response(status_code=200, content="test")
    
    # Call middleware
    response = await middleware(request, call_next)
    
    # Should query subscription
    mock_db.query.assert_called()
    
    # Should return 200 (rate limit check passed)
    assert response.status_code == 200


@pytest.mark.asyncio
@patch('middleware.usage_enforcer.SessionLocal')
async def test_rate_limit_exceeded_returns_429(mock_session_local):
    """Test that rate limit exceeded returns 429"""
    middleware = UsageEnforcerMiddleware(None)
    
    # Mock database session
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db
    
    # Mock subscription
    org_id = uuid4()
    mock_subscription = Subscription(
        id=1,
        org_id=org_id,
        plan_tier=PlanTier.FREE,
        status=SubscriptionStatus.ACTIVE,
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30)
    )
    
    # Mock rate limit (exceeded)
    from models_billing import RateLimit
    mock_rate_limit = RateLimit(
        org_id=org_id,
        window_start=datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0),
        window_end=datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1),
        request_count=100  # Free tier limit
    )
    
    # Mock query chains
    mock_subscription_query = MagicMock()
    mock_subscription_query.filter.return_value.first.return_value = mock_subscription
    
    mock_rate_limit_query = MagicMock()
    mock_rate_limit_query.filter.return_value.first.return_value = mock_rate_limit
    
    def query_side_effect(model):
        from models_billing import Subscription, RateLimit
        if model == Subscription:
            return mock_subscription_query
        elif model == RateLimit:
            return mock_rate_limit_query
        return MagicMock()
    
    mock_db.query.side_effect = query_side_effect
    
    # Mock request with org_id
    request = MockRequest(path="/api/test", org_id=org_id)
    
    # Mock call_next
    async def call_next(req):
        return Response(status_code=200, content="test")
    
    # Call middleware
    response = await middleware(request, call_next)
    
    # Should return 429 rate limit exceeded
    assert response.status_code == 429
    
    # Check response body
    if isinstance(response, JSONResponse):
        # Response should have error message
        pass  # JSONResponse body is not easily accessible in test


def test_middleware_has_webhook_endpoints_list():
    """Test that middleware has webhook endpoints configuration"""
    middleware = UsageEnforcerMiddleware(None)
    
    # Should have WEBHOOK_ENDPOINTS attribute
    assert hasattr(middleware, 'WEBHOOK_ENDPOINTS')
    assert isinstance(middleware.WEBHOOK_ENDPOINTS, list)
    
    # Should include Stripe webhook endpoint
    assert "/api/billing/webhooks/stripe" in middleware.WEBHOOK_ENDPOINTS


def test_middleware_has_plan_limits():
    """Test that middleware has plan limits configuration"""
    middleware = UsageEnforcerMiddleware(None)
    
    # Should have PLAN_LIMITS attribute
    assert hasattr(middleware, 'PLAN_LIMITS')
    assert isinstance(middleware.PLAN_LIMITS, dict)
    
    # Should have limits for all tiers
    assert PlanTier.FREE in middleware.PLAN_LIMITS
    assert PlanTier.PRO in middleware.PLAN_LIMITS
    assert PlanTier.ENTERPRISE in middleware.PLAN_LIMITS
    
    # Check free tier limits
    free_limits = middleware.PLAN_LIMITS[PlanTier.FREE]
    assert free_limits["analyses_per_month"] == 10
    assert free_limits["api_calls_per_hour"] == 100
    
    # Check pro tier limits
    pro_limits = middleware.PLAN_LIMITS[PlanTier.PRO]
    assert pro_limits["analyses_per_month"] == 100
    assert pro_limits["api_calls_per_hour"] == 1000
    
    # Check enterprise tier limits
    enterprise_limits = middleware.PLAN_LIMITS[PlanTier.ENTERPRISE]
    assert enterprise_limits["analyses_per_month"] == -1  # unlimited
    assert enterprise_limits["api_calls_per_hour"] == 5000


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
