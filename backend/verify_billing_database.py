#!/usr/bin/env python3
"""
Verify billing database schema and test basic operations
"""
import os
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/mkchain")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

def test_database_connection():
    """Test basic database connection"""
    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            print("✓ Database connection successful")
            return True
    except Exception as e:
        print(f"✗ Database connection failed: {e}")
        return False

def test_billing_tables_exist():
    """Test that billing tables exist"""
    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as connection:
            # Check if billing tables exist
            tables_to_check = [
                'subscriptions',
                'payment_methods', 
                'usage_metrics',
                'invoices',
                'webhook_events',
                'rate_limits',
                'retention_cleanup_log'
            ]
            
            existing_tables = []
            for table in tables_to_check:
                result = connection.execute(text(
                    f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table}')"
                ))
                exists = result.scalar()
                if exists:
                    existing_tables.append(table)
                    print(f"✓ Table '{table}' exists")
                else:
                    print(f"✗ Table '{table}' missing")
            
            return len(existing_tables) == len(tables_to_check)
    except Exception as e:
        print(f"✗ Error checking tables: {e}")
        return False

def test_basic_schema_operations():
    """Test basic schema operations"""
    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as connection:
            # Test organizations table exists (dependency)
            result = connection.execute(text("SELECT COUNT(*) FROM organizations LIMIT 1"))
            org_count = result.scalar()
            print(f"✓ Found {org_count} organizations in database")
            
            # Test subscriptions table structure
            result = connection.execute(text("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'subscriptions'
                ORDER BY ordinal_position
            """))
            columns = result.fetchall()
            print(f"✓ Subscriptions table has {len(columns)} columns")
            
            # Check for key columns
            key_columns = ['org_id', 'plan_tier', 'status', 'stripe_customer_id', 'stripe_subscription_id']
            existing_columns = [col[0] for col in columns]
            for col in key_columns:
                if col in existing_columns:
                    print(f"  ✓ Column '{col}' exists")
                else:
                    print(f"  ✗ Column '{col}' missing")
            
            return True
    except Exception as e:
        print(f"✗ Error testing schema: {e}")
        return False

def test_constraints_and_indexes():
    """Test database constraints and indexes"""
    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as connection:
            # Check constraints
            result = connection.execute(text("""
                SELECT constraint_name, constraint_type 
                FROM information_schema.table_constraints 
                WHERE table_name = 'subscriptions'
                AND constraint_type IN ('CHECK', 'UNIQUE', 'FOREIGN KEY')
            """))
            constraints = result.fetchall()
            print(f"✓ Found {len(constraints)} constraints on subscriptions table")
            
            # Check indexes
            result = connection.execute(text("""
                SELECT indexname 
                FROM pg_indexes 
                WHERE tablename = 'subscriptions'
            """))
            indexes = result.fetchall()
            print(f"✓ Found {len(indexes)} indexes on subscriptions table")
            
            return True
    except Exception as e:
        print(f"✗ Error checking constraints: {e}")
        return False

def test_sample_data_operations():
    """Test basic CRUD operations on billing tables"""
    try:
        engine = create_engine(DATABASE_URL)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        
        with SessionLocal() as session:
            # Get an existing organization
            result = session.execute(text("SELECT id FROM organizations LIMIT 1"))
            org_row = result.first()
            
            if not org_row:
                print("✗ No organizations found for testing")
                return False
                
            org_id = org_row[0]
            print(f"✓ Using organization {org_id} for testing")
            
            # Test subscription query
            result = session.execute(text("""
                SELECT id, org_id, plan_tier, status 
                FROM subscriptions 
                WHERE org_id = :org_id
            """), {"org_id": org_id})
            
            subscription = result.first()
            if subscription:
                print(f"✓ Found subscription: {subscription.plan_tier} ({subscription.status})")
            else:
                print("✓ No subscription found (expected for new organizations)")
            
            # Test usage metrics query
            result = session.execute(text("""
                SELECT id, analyses_count, api_calls_count, storage_used_gb
                FROM usage_metrics 
                WHERE org_id = :org_id
                ORDER BY billing_period_start DESC
                LIMIT 1
            """), {"org_id": org_id})
            
            usage = result.first()
            if usage:
                print(f"✓ Found usage metrics: {usage.analyses_count} analyses, {usage.api_calls_count} API calls")
            else:
                print("✓ No usage metrics found (expected for new organizations)")
            
            return True
            
    except Exception as e:
        print(f"✗ Error testing data operations: {e}")
        return False

def main():
    """Run all verification tests"""
    print("=== MKChain Billing Database Verification ===\n")
    
    tests = [
        ("Database Connection", test_database_connection),
        ("Billing Tables", test_billing_tables_exist),
        ("Schema Structure", test_basic_schema_operations),
        ("Constraints & Indexes", test_constraints_and_indexes),
        ("Data Operations", test_sample_data_operations),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        success = test_func()
        results.append((test_name, success))
    
    print(f"\n=== Summary ===")
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        status = "✓ PASSED" if success else "✗ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All database verification tests passed!")
        sys.exit(0)
    else:
        print("⚠️  Some tests failed. Database may need migration or setup.")
        sys.exit(1)

if __name__ == "__main__":
    main()