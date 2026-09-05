# Migration 006: Subscription & Billing System

## Overview

This migration creates the complete database schema for the subscription and billing system, including:

- **Subscriptions**: Plan tiers, billing status, trial periods, and grace periods
- **Payment Methods**: Stripe payment method references (non-sensitive data only)
- **Usage Metrics**: Resource consumption tracking per billing period
- **Invoices**: Billing history and invoice records
- **Webhook Events**: Stripe webhook processing with idempotency
- **Rate Limits**: API rate limiting counters
- **Retention Cleanup Log**: Data retention enforcement history

## Requirements Addressed

- **1.6**: Store subscription state in database with all required fields
- **1.7**: Support subscription statuses (active, trialing, past_due, canceled, unpaid)
- **2.1**: Create Stripe customer for paid plan subscriptions
- **4.4**: Store usage metrics with all required fields
- **8.8**: Log webhook events for idempotency and audit trail
- **9.1**: Create invoice records with all required fields

## Tables Created

### 1. subscriptions
Stores subscription plan and billing status for each organization.

**Key Fields:**
- `org_id` - Organization reference (unique, one subscription per org)
- `plan_tier` - free, pro, or enterprise
- `status` - active, trialing, past_due, canceled, unpaid
- `stripe_customer_id` - Stripe customer reference
- `stripe_subscription_id` - Stripe subscription reference
- `trial_end` - Trial period expiration (14 days)
- `grace_period_end` - Payment failure grace period (7 days)
- `scheduled_plan_change` - Scheduled downgrade plan
- `has_used_trial_pro/ent` - Trial eligibility tracking

**Indexes:**
- org_id, stripe_customer_id, stripe_subscription_id (unique lookups)
- status, trial_end, grace_period_end, scheduled_change_date (scheduled job queries)

### 2. payment_methods
Stores non-sensitive payment method information from Stripe.

**Key Fields:**
- `org_id` - Organization reference
- `stripe_payment_method_id` - Stripe payment method reference
- `card_brand`, `card_last4`, `exp_month`, `exp_year` - Display info only
- `is_default` - Default payment method flag

**Security:** No raw card data stored (PCI compliance)

### 3. usage_metrics
Tracks resource consumption per billing period.

**Key Fields:**
- `org_id` - Organization reference
- `billing_period_start/end` - Billing cycle dates
- `analyses_count` - Number of analyses performed
- `api_calls_count` - Number of API calls made
- `storage_used_gb` - Storage consumed in GB

**Constraints:** Unique per (org_id, billing_period_start)

### 4. invoices
Stores billing invoices and payment history.

**Key Fields:**
- `org_id` - Organization reference
- `stripe_invoice_id` - Stripe invoice reference
- `stripe_invoice_url/pdf` - Hosted invoice URLs
- `amount_due`, `amount_paid` - Invoice amounts
- `status` - draft, open, paid, void, uncollectible
- `period_start/end` - Billing period covered

### 5. webhook_events
Logs Stripe webhook events for idempotency and audit trail.

**Key Fields:**
- `stripe_event_id` - Stripe event ID (unique)
- `event_type` - Webhook event type
- `payload` - Full event data (JSONB)
- `processing_result` - success, failure, skipped
- `error_message` - Error details for failures

**Purpose:** Prevents duplicate webhook processing

### 6. rate_limits
Tracks API rate limiting per organization.

**Key Fields:**
- `org_id` - Organization reference
- `window_start/end` - Rate limit time window
- `request_count` - Number of requests in window

**Constraints:** Unique per (org_id, window_start)

### 7. retention_cleanup_log
Logs data retention cleanup operations.

**Key Fields:**
- `org_id` - Organization reference
- `analyses_deleted` - Number of analyses deleted
- `data_deleted_gb` - Storage freed in GB
- `cleanup_date` - Timestamp of cleanup

## Triggers

### update_subscriptions_updated_at
Automatically updates `updated_at` timestamp on subscription modifications.

### update_usage_metrics_updated_at
Automatically updates `updated_at` timestamp on usage metric modifications.

## Data Backfill

### Subscriptions Backfill
Creates free tier subscriptions for all existing organizations:
- Plan: free
- Status: active
- Period: NOW to NOW + 30 days

### Usage Metrics Backfill
Creates initial usage metric records for all organizations:
- Period: matches subscription period
- All counters: 0

## Row Level Security (RLS)

RLS policies ensure organizations can only access their own billing data:

- **subscriptions**: Members can view their org's subscription
- **payment_methods**: Only owners and admins can view payment methods
- **usage_metrics**: Members can view their org's usage
- **invoices**: Only owners and admins can view invoices
- **retention_cleanup_log**: Only owners and admins can view logs
- **rate_limits**: No direct user access (service only)

## Running the Migration

### Using Supabase CLI
```bash
supabase db push --file database/supabase/006_subscription_billing.sql
```

### Using psql
```bash
psql $DATABASE_URL -f database/supabase/006_subscription_billing.sql
```

### Using Python (Alembic)
If using Alembic migrations:
```bash
alembic upgrade head
```

## Verification

After running the migration, verify:

1. **Tables created:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('subscriptions', 'payment_methods', 'usage_metrics', 
                      'invoices', 'webhook_events', 'rate_limits', 
                      'retention_cleanup_log');
   ```

2. **Backfill completed:**
   ```sql
   -- All orgs should have subscriptions
   SELECT COUNT(*) FROM organizations;
   SELECT COUNT(*) FROM subscriptions;
   -- Counts should match
   
   -- All subscriptions should have usage metrics
   SELECT COUNT(*) FROM subscriptions;
   SELECT COUNT(*) FROM usage_metrics;
   -- Counts should match
   ```

3. **Indexes created:**
   ```sql
   SELECT indexname FROM pg_indexes 
   WHERE tablename IN ('subscriptions', 'payment_methods', 'usage_metrics', 
                       'invoices', 'webhook_events', 'rate_limits');
   ```

4. **Triggers created:**
   ```sql
   SELECT trigger_name, event_object_table 
   FROM information_schema.triggers 
   WHERE event_object_table IN ('subscriptions', 'usage_metrics');
   ```

5. **RLS enabled:**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' 
   AND tablename IN ('subscriptions', 'payment_methods', 'usage_metrics', 
                     'invoices', 'retention_cleanup_log');
   ```

## Rollback

To rollback this migration:

```sql
-- Drop RLS policies
DROP POLICY IF EXISTS "Members can view org subscription" ON subscriptions;
DROP POLICY IF EXISTS "Owners and admins can view payment methods" ON payment_methods;
DROP POLICY IF EXISTS "Members can view org usage metrics" ON usage_metrics;
DROP POLICY IF EXISTS "Owners and admins can view invoices" ON invoices;
DROP POLICY IF EXISTS "Owners and admins can view cleanup logs" ON retention_cleanup_log;

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_update_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS trigger_update_usage_metrics_updated_at ON usage_metrics;
DROP FUNCTION IF EXISTS update_subscriptions_updated_at();
DROP FUNCTION IF EXISTS update_usage_metrics_updated_at();

-- Drop tables (cascade to remove foreign key constraints)
DROP TABLE IF EXISTS retention_cleanup_log CASCADE;
DROP TABLE IF EXISTS rate_limits CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS usage_metrics CASCADE;
DROP TABLE IF EXISTS payment_methods CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
```

## Next Steps

After running this migration:

1. Update backend models to import billing models
2. Configure Stripe API keys in environment variables
3. Create subscription management service
4. Implement usage tracking middleware
5. Set up webhook endpoint and handler
6. Create billing UI components

## Notes

- **PCI Compliance**: No sensitive payment data is stored in the database. All payment data is stored in Stripe.
- **Idempotency**: The backfill uses `ON CONFLICT DO NOTHING` to safely re-run if needed.
- **Performance**: Indexes are optimized for common queries (org lookups, scheduled job queries).
- **Security**: RLS policies restrict access to billing data based on organization membership.
