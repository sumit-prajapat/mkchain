#!/usr/bin/env python3
"""
Verify billing models and validate their structure and business logic
"""
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from models_organization import Organization
from models_billing import (
    Subscription, PaymentMethod, UsageMetric, Invoice, 
    WebhookEvent, RateLimit, RetentionCleanupLog,
    PlanTier, SubscriptionStatus, InvoiceStatus, PLAN_LIMITS,
    get_plan_limit, has_feature_access
)

def test_model_structure():
    """Test that all required models are properly defined"""
    print("\n=== Model Structure Validation ===")
    
    models = [
        ('Subscription', Subscription),
        ('PaymentMethod', PaymentMethod), 
        ('UsageMetric', UsageMetric),
        ('Invoice', Invoice),
        ('WebhookEvent', WebhookEvent),
        ('RateLimit', RateLimit),
        ('RetentionCleanupLog', RetentionCleanupLog)
    ]
    
    for model_name, model_class in models:
        if hasattr(model_class, '__tablename__'):
            print(f"✓ {model_name} properly defined with table '{model_class.__tablename__}'")
        else:
            print(f"✗ {model_name} missing __tablename__")
            return False
    
    return True

def test_model_relationships():
    """Verify model relationships are properly configured"""
    print("\n=== Model Relationships Validation ===")
    
    # Check Organization -> Subscription relationship
    if not hasattr(Organization, 'subscription'):
        print("✗ Organization missing 'subscription' relationship")
        return False
    print("✓ Organization has 'subscription' relationship")
    
    # Check Organization -> PaymentMethod relationship
    if not hasattr(Organization, 'payment_methods'):
        print("✗ Organization missing 'payment_methods' relationship")
        return False
    print("✓ Organization has 'payment_methods' relationship")
    
    return True

def test_business_logic():
    """Test business logic and helper methods"""
    print("\n=== Business Logic Validation ===")
    
    # Test plan limits configuration
    free_analyses = get_plan_limit(PlanTier.FREE, "analyses_per_month")
    pro_analyses = get_plan_limit(PlanTier.PRO, "analyses_per_month") 
    enterprise_analyses = get_plan_limit(PlanTier.ENTERPRISE, "analyses_per_month")
    
    if free_analyses != 10:
        print(f"✗ Free plan should have 10 analyses, got {free_analyses}")
        return False
    if pro_analyses != 100:
        print(f"✗ Pro plan should have 100 analyses, got {pro_analyses}")
        return False
    if enterprise_analyses != -1:
        print(f"✗ Enterprise plan should have unlimited analyses (-1), got {enterprise_analyses}")
        return False
    print("✓ Plan analysis limits are correctly configured")
    
    # Test feature access
    if not has_feature_access(PlanTier.FREE, "basic_analysis"):
        print("✗ Free plan should have basic_analysis access")
        return False
    if has_feature_access(PlanTier.FREE, "ai_summary"):
        print("✗ Free plan should NOT have ai_summary access")
        return False
    if not has_feature_access(PlanTier.PRO, "ai_summary"):
        print("✗ Pro plan should have ai_summary access")
        return False
    if not has_feature_access(PlanTier.ENTERPRISE, "custom_integration"):
        print("✗ Enterprise plan should have custom_integration access")
        return False
    print("✓ Feature access controls are correctly configured")
    
    # Test subscription helper methods
    subscription = Subscription(
        org_id=uuid4(),
        plan_tier=PlanTier.PRO,
        status=SubscriptionStatus.TRIALING,
        has_used_trial_pro=False,
        has_used_trial_ent=True
    )
    
    if not subscription.is_active():
        print("✗ Trialing subscription should be considered active")
        return False
    if not subscription.is_trial_eligible("pro"):
        print("✗ Should be eligible for pro trial")
        return False
    if subscription.is_trial_eligible("enterprise"):
        print("✗ Should NOT be eligible for enterprise trial")
        return False
    print("✓ Subscription helper methods work correctly")
    
    # Test usage metric calculations
    usage = UsageMetric(
        org_id=uuid4(),
        billing_period_start=datetime.utcnow(),
        billing_period_end=datetime.utcnow() + timedelta(days=30),
        analyses_count=50,
        api_calls_count=2500,
        storage_used_gb=Decimal("25.00")
    )
    
    # 50/100 = 50%
    if usage.get_usage_percentage(100, 'analyses') != 50.0:
        print("✗ Usage percentage calculation incorrect")
        return False
    # Unlimited should return 0%
    if usage.get_usage_percentage(-1, 'analyses') != 0.0:
        print("✗ Unlimited usage percentage should be 0%")
        return False
    print("✓ Usage metric calculations work correctly")
    
    return True

def test_constants_and_enums():
    """Test that constants and enums are properly defined"""
    print("\n=== Constants and Enums Validation ===")
    
    # Test plan tier constants
    if not hasattr(PlanTier, 'FREE') or PlanTier.FREE != "free":
        print("✗ PlanTier.FREE not properly defined")
        return False
    if not hasattr(PlanTier, 'PRO') or PlanTier.PRO != "pro":
        print("✗ PlanTier.PRO not properly defined")
        return False
    if not hasattr(PlanTier, 'ENTERPRISE') or PlanTier.ENTERPRISE != "enterprise":
        print("✗ PlanTier.ENTERPRISE not properly defined")
        return False
    print("✓ Plan tier constants are properly defined")
    
    # Test subscription status constants
    expected_statuses = ['active', 'trialing', 'past_due', 'canceled', 'unpaid']
    if not hasattr(SubscriptionStatus, 'ALL_STATUSES'):
        print("✗ SubscriptionStatus.ALL_STATUSES not defined")
        return False
    if set(SubscriptionStatus.ALL_STATUSES) != set(expected_statuses):
        print("✗ SubscriptionStatus.ALL_STATUSES has incorrect values")
        return False
    print("✓ Subscription status constants are properly defined")
    
    # Test PLAN_LIMITS structure
    if not isinstance(PLAN_LIMITS, dict):
        print("✗ PLAN_LIMITS should be a dictionary")
        return False
    
    required_keys = ['analyses_per_month', 'api_calls_per_hour', 'storage_gb', 'price_monthly', 'features']
    for tier in [PlanTier.FREE, PlanTier.PRO, PlanTier.ENTERPRISE]:
        if tier not in PLAN_LIMITS:
            print(f"✗ PLAN_LIMITS missing tier '{tier}'")
            return False
        
        for key in required_keys:
            if key not in PLAN_LIMITS[tier]:
                print(f"✗ PLAN_LIMITS[{tier}] missing key '{key}'")
                return False
    print("✓ PLAN_LIMITS structure is properly defined")
    
    return True

def main():
    """Run all model validation tests"""
    print("=== MKChain Billing Models Validation ===")
    
    tests = [
        ("Model Structure", test_model_structure),
        ("Model Relationships", test_model_relationships),
        ("Business Logic", test_business_logic),
        ("Constants and Enums", test_constants_and_enums),
    ]
    
    results = []
    for test_name, test_func in tests:
        success = test_func()
        results.append((test_name, success))
        if not success:
            break  # Stop on first failure for cleaner output
    
    print(f"\n=== Validation Summary ===")
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        status = "✓ PASSED" if success else "✗ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nOverall: {passed}/{total} validation tests passed")
    
    if passed == total:
        print("\n🎉 All model validation tests passed!")
        print("The billing models foundation is solid and ready for service layer implementation.")
        return True
    else:
        print("\n⚠️  Some validation tests failed. Models need fixing before proceeding.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)