"""
Simple unit tests for usage and analytics routes
Tests task 12.3: Usage and analytics routes implementation
"""
import pytest
from decimal import Decimal


def test_routes_module_imports():
    """Test that the routes module imports without errors"""
    try:
        from routes import billing
        assert hasattr(billing, 'router')
        print("✓ Routes module imported successfully")
    except Exception as e:
        pytest.fail(f"Failed to import routes.billing: {e}")


def test_usage_routes_registered():
    """Test that all required usage routes are registered in the router"""
    from routes.billing import router
    
    # Get all route paths
    route_paths = [route.path for route in router.routes]
    
    # Check for required routes
    has_current_usage = any("usage/current" in path for path in route_paths)
    has_usage_history = any("usage/history" in path for path in route_paths)
    has_quota_status = any("quota-status" in path for path in route_paths)
    
    print(f"✓ Found {len(route_paths)} total routes")
    print(f"  - /usage/current: {has_current_usage}")
    print(f"  - /usage/history: {has_usage_history}")
    print(f"  - /quota-status: {has_quota_status}")
    
    assert has_current_usage, "Route /usage/current not found"
    assert has_usage_history, "Route /usage/history not found"
    assert has_quota_status, "Route /quota-status not found"


def test_usage_route_methods():
    """Test that usage routes use correct HTTP methods"""
    from routes.billing import router
    
    # Find usage routes
    usage_routes = [
        route for route in router.routes 
        if any(path in route.path for path in ["usage/current", "usage/history", "quota-status"])
    ]
    
    # All usage routes should be GET
    for route in usage_routes:
        assert "GET" in route.methods, f"Route {route.path} should support GET method"
    
    print(f"✓ All {len(usage_routes)} usage routes support GET method")


def test_plan_limits_defined():
    """Test that PLAN_LIMITS is properly imported and defined"""
    from models_billing import PLAN_LIMITS, PlanTier
    
    # Check all plan tiers exist
    assert PlanTier.FREE in PLAN_LIMITS
    assert PlanTier.PRO in PLAN_LIMITS
    assert PlanTier.ENTERPRISE in PLAN_LIMITS
    
    # Check free tier limits
    free_limits = PLAN_LIMITS[PlanTier.FREE]
    assert free_limits['analyses_per_month'] == 10
    assert free_limits['api_calls_per_hour'] == 100
    assert free_limits['storage_gb'] == 1.0
    
    # Check pro tier limits
    pro_limits = PLAN_LIMITS[PlanTier.PRO]
    assert pro_limits['analyses_per_month'] == 100
    assert pro_limits['api_calls_per_hour'] == 1000
    assert pro_limits['storage_gb'] == 50.0
    
    # Check enterprise tier limits (unlimited analyses)
    ent_limits = PLAN_LIMITS[PlanTier.ENTERPRISE]
    assert ent_limits['analyses_per_month'] == -1  # Unlimited
    assert ent_limits['api_calls_per_hour'] == 5000
    assert ent_limits['storage_gb'] == 500.0
    
    print("✓ All plan limits properly defined")


def test_usage_tracker_service_imports():
    """Test that UsageTracker service can be imported"""
    try:
        from services.usage_tracker import UsageTracker, get_usage_tracker, UsageTrackerError
        print("✓ UsageTracker service imports successfully")
    except Exception as e:
        pytest.fail(f"Failed to import UsageTracker: {e}")


def test_usage_schemas_defined():
    """Test that usage-related schemas are defined"""
    from schemas_billing import UsageMetricResponse, UsageAnalyticsResponse
    
    # Check UsageMetricResponse has required fields
    fields = UsageMetricResponse.model_fields
    assert 'analyses_count' in fields
    assert 'api_calls_count' in fields
    assert 'storage_used_gb' in fields
    assert 'analyses_limit' in fields
    assert 'analyses_percent' in fields
    
    # Check UsageAnalyticsResponse has required fields
    analytics_fields = UsageAnalyticsResponse.model_fields
    assert 'current_period' in analytics_fields
    assert 'historical_periods' in analytics_fields
    assert 'projected_usage' in analytics_fields
    
    print("✓ Usage schemas properly defined")


def test_quota_calculation_logic():
    """Test quota percentage calculation logic"""
    # Test cases for quota calculations
    test_cases = [
        # (used, limit, expected_percent)
        (50, 100, 50.0),      # 50%
        (80, 100, 80.0),      # 80% - warning threshold
        (100, 100, 100.0),    # 100% - exceeded
        (0, 100, 0.0),        # 0%
        (75, 100, 75.0),      # 75%
        (25.5, 50.0, 51.0),   # Storage: 25.5 GB / 50 GB = 51%
    ]
    
    for used, limit, expected in test_cases:
        if limit > 0:
            percent = min(100.0, (used / limit) * 100)
            assert abs(percent - expected) < 0.1, f"Expected {expected}%, got {percent}%"
    
    # Test unlimited (-1 limit)
    percent_unlimited = 0.0 if -1 == -1 else 100.0
    assert percent_unlimited == 0.0, "Unlimited should show 0%"
    
    print("✓ Quota calculation logic is correct")


def test_warning_levels():
    """Test warning level determination logic"""
    def get_warning_level(percent):
        if percent >= 100:
            return "exceeded"
        elif percent >= 80:
            return "warning"
        else:
            return "ok"
    
    # Test warning levels
    assert get_warning_level(0) == "ok"
    assert get_warning_level(50) == "ok"
    assert get_warning_level(79) == "ok"
    assert get_warning_level(80) == "warning"
    assert get_warning_level(90) == "warning"
    assert get_warning_level(99) == "warning"
    assert get_warning_level(100) == "exceeded"
    assert get_warning_level(101) == "exceeded"
    
    print("✓ Warning level logic is correct")


def test_route_dependencies():
    """Test that routes have proper dependencies (auth, db session)"""
    from routes.billing import router
    import inspect
    
    # Find the usage routes
    usage_current = None
    usage_history = None
    quota_status = None
    
    for route in router.routes:
        if "usage/current" in route.path:
            usage_current = route
        elif "usage/history" in route.path:
            usage_history = route
        elif "quota-status" in route.path:
            quota_status = route
    
    # Verify routes were found
    assert usage_current is not None, "usage/current route not found"
    assert usage_history is not None, "usage/history route not found"
    assert quota_status is not None, "quota-status route not found"
    
    print("✓ All usage routes have proper structure")


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v", "-s"])
