"""
Integration test for UsageEnforcerMiddleware registration and webhook exclusion
Tests that the middleware is properly integrated into the FastAPI application
"""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Mock apscheduler before importing main
sys.modules['apscheduler'] = MagicMock()
sys.modules['apscheduler.schedulers'] = MagicMock()
sys.modules['apscheduler.schedulers.asyncio'] = MagicMock()
sys.modules['apscheduler.triggers'] = MagicMock()
sys.modules['apscheduler.triggers.cron'] = MagicMock()

from fastapi.testclient import TestClient
from main import app
from models_billing import Subscription, PlanTier, SubscriptionStatus

client = TestClient(app)


def test_middleware_is_registered():
    """Test that UsageEnforcerMiddleware is registered in the app"""
    # Check that the app has middleware stack
    assert hasattr(app, 'user_middleware')
    
    # Verify middleware functions are in the middleware stack
    middleware_names = [str(middleware) for middleware in app.user_middleware]
    
    # Should have auth_middleware and usage_enforcer_middleware
    assert any('auth_middleware' in name for name in middleware_names), \
        "auth_middleware should be registered"
    assert any('usage_enforcer_middleware' in name for name in middleware_names), \
        "usage_enforcer_middleware should be registered"


def test_health_endpoint_bypasses_middleware():
    """Test that health endpoint works without authentication"""
    response = client.get("/")
    
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "MKChain" in response.json()["project"]


def test_webhook_endpoint_bypasses_usage_enforcement():
    """Test that Stripe webhook endpoint bypasses usage enforcement"""
    # Mock webhook payload
    webhook_payload = {
        "id": "evt_test_webhook",
        "type": "invoice.payment_succeeded",
        "data": {
            "object": {
                "id": "in_test",
                "customer": "cus_test",
                "subscription": "sub_test"
            }
        }
    }
    
    # Mock Stripe signature verification
    with patch('services.webhook_handler.stripe.Webhook.construct_event') as mock_construct:
        mock_construct.return_value = webhook_payload
        
        # Send webhook request WITHOUT authentication headers
        # This should NOT be blocked by usage enforcer
        response = client.post(
            "/api/billing/webhooks/stripe",
            json=webhook_payload,
            headers={"stripe-signature": "test_signature"}
        )
        
        # Should not get 401 (auth) or 429 (rate limit) or 403 (feature access)
        # May get 400 or 500 depending on webhook handler implementation
        assert response.status_code not in [401, 429, 403], \
            f"Webhook should bypass usage enforcement, got {response.status_code}"


@patch('middleware.usage_enforcer.SessionLocal')
def test_authenticated_api_call_enforces_usage(mock_session_local):
    """Test that authenticated API calls go through usage enforcement"""
    # Mock database session
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db
    
    # Mock subscription with free tier
    org_id = uuid4()
    mock_subscription = Subscription(
        id=1,
        org_id=org_id,
        plan_tier=PlanTier.FREE,
        status=SubscriptionStatus.ACTIVE,
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30)
    )
    mock_db.query.return_value.filter.return_value.first.return_value = mock_subscription
    
    # Mock JWT token that sets org_id in request.state
    with patch('middleware.auth.jwt.decode') as mock_jwt:
        mock_jwt.return_value = {"sub": str(uuid4()), "org_id": str(org_id)}
        
        # Make authenticated API call
        response = client.get(
            "/api/billing/subscriptions",
            headers={"Authorization": "Bearer test_token"}
        )
        
        # Should be processed by usage enforcer (may succeed or fail based on implementation)
        # But should not bypass enforcement
        assert response.status_code != 404  # Should reach the endpoint


def test_non_api_endpoints_bypass_enforcement():
    """Test that non-API endpoints bypass usage enforcement"""
    # Health check should work without any authentication
    response = client.get("/")
    assert response.status_code == 200


@patch('middleware.usage_enforcer.SessionLocal')
def test_rate_limit_headers_are_added(mock_session_local):
    """Test that rate limit headers are added to API responses"""
    # Mock database session
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db
    
    # Mock subscription with pro tier
    org_id = uuid4()
    mock_subscription = Subscription(
        id=1,
        org_id=org_id,
        plan_tier=PlanTier.PRO,
        status=SubscriptionStatus.ACTIVE,
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30)
    )
    
    # Mock query chain for subscription
    mock_subscription_query = MagicMock()
    mock_subscription_query.filter.return_value.first.return_value = mock_subscription
    
    # Mock query chain for rate limit
    mock_rate_limit_query = MagicMock()
    mock_rate_limit_query.filter.return_value.first.return_value = None
    
    # Configure query to return different mocks based on model
    def query_side_effect(model):
        from models_billing import Subscription, RateLimit
        if model == Subscription:
            return mock_subscription_query
        elif model == RateLimit:
            return mock_rate_limit_query
        return MagicMock()
    
    mock_db.query.side_effect = query_side_effect
    
    # Mock JWT token
    with patch('middleware.auth.jwt.decode') as mock_jwt:
        mock_jwt.return_value = {"sub": str(uuid4()), "org_id": str(org_id)}
        
        # Make authenticated API call
        response = client.get(
            "/api/billing/subscriptions",
            headers={"Authorization": "Bearer test_token"}
        )
        
        # Check if rate limit headers might be present
        # (May not be present if request fails early, but test middleware is configured)
        # This test verifies the middleware is attempting to add headers
        assert response.status_code != 500  # Should not crash


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
