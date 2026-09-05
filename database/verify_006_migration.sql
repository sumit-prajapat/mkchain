-- Verification Script for Migration 006: Subscription & Billing System
-- Run this after applying the migration to verify everything is created correctly

\echo '=== Verifying Migration 006: Subscription & Billing System ==='
\echo ''

-- 1. Check tables exist
\echo '1. Checking tables...'
SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('subscriptions', 'payment_methods', 'usage_metrics', 
                           'invoices', 'webhook_events', 'rate_limits', 
                           'retention_cleanup_log') THEN '✓'
        ELSE '✗'
    END AS status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('subscriptions', 'payment_methods', 'usage_metrics', 
                   'invoices', 'webhook_events', 'rate_limits', 
                   'retention_cleanup_log')
ORDER BY table_name;

\echo ''
\echo '2. Checking subscription backfill...'
SELECT 
    'Organizations' AS entity,
    COUNT(*) AS count
FROM organizations
UNION ALL
SELECT 
    'Subscriptions' AS entity,
    COUNT(*) AS count
FROM subscriptions
UNION ALL
SELECT 
    'Usage Metrics' AS entity,
    COUNT(*) AS count
FROM usage_metrics;

\echo ''
\echo '3. Checking indexes...'
SELECT 
    schemaname,
    tablename,
    indexname
FROM pg_indexes 
WHERE schemaname = 'public'
AND tablename IN ('subscriptions', 'payment_methods', 'usage_metrics', 
                  'invoices', 'webhook_events', 'rate_limits', 
                  'retention_cleanup_log')
ORDER BY tablename, indexname;

\echo ''
\echo '4. Checking triggers...'
SELECT 
    trigger_name,
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE event_object_schema = 'public'
AND event_object_table IN ('subscriptions', 'usage_metrics')
ORDER BY event_object_table, trigger_name;

\echo ''
\echo '5. Checking RLS policies...'
SELECT 
    schemaname,
    tablename,
    policyname,
    CASE 
        WHEN cmd = 'r' THEN 'SELECT'
        WHEN cmd = 'a' THEN 'INSERT'
        WHEN cmd = 'w' THEN 'UPDATE'
        WHEN cmd = 'd' THEN 'DELETE'
        ELSE cmd
    END AS operation
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('subscriptions', 'payment_methods', 'usage_metrics', 
                  'invoices', 'retention_cleanup_log')
ORDER BY tablename, policyname;

\echo ''
\echo '6. Checking foreign key constraints...'
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
AND tc.table_name IN ('subscriptions', 'payment_methods', 'usage_metrics', 
                      'invoices', 'rate_limits', 'retention_cleanup_log')
ORDER BY tc.table_name, kcu.column_name;

\echo ''
\echo '7. Checking check constraints...'
SELECT
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints AS tc
JOIN information_schema.check_constraints AS cc
    ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
AND tc.table_schema = 'public'
AND tc.table_name IN ('subscriptions', 'payment_methods', 'usage_metrics', 
                      'invoices', 'webhook_events', 'rate_limits', 
                      'retention_cleanup_log')
ORDER BY tc.table_name, tc.constraint_name;

\echo ''
\echo '8. Sample data check...'
SELECT 
    s.org_id,
    o.name AS org_name,
    s.plan_tier,
    s.status,
    s.current_period_start,
    s.current_period_end,
    um.analyses_count,
    um.api_calls_count,
    um.storage_used_gb
FROM subscriptions s
JOIN organizations o ON s.org_id = o.id
LEFT JOIN usage_metrics um ON s.org_id = um.org_id 
    AND um.billing_period_start = s.current_period_start
LIMIT 5;

\echo ''
\echo '=== Verification Complete ==='
