-- ============================================================================
-- Migration: 003_subscription_billing_system.sql
-- Description: Create subscription and billing tables for MKChain SaaS platform
-- Requirements: 1.6, 2.1, 4.4
-- ============================================================================

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    plan_tier               VARCHAR(20) NOT NULL CHECK (plan_tier IN ('free', 'pro', 'enterprise')),
    
    -- Stripe references
    stripe_customer_id      VARCHAR(255) UNIQUE,
    stripe_subscription_id  VARCHAR(255) UNIQUE,
    stripe_price_id         VARCHAR(255),
    
    -- Subscription state
    status                  VARCHAR(20) NOT NULL CHECK (status IN (
                                'active', 'trialing', 'past_due', 'canceled', 'unpaid'
                            )),
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    trial_end               TIMESTAMPTZ,
    grace_period_end        TIMESTAMPTZ,
    
    -- Scheduled changes
    scheduled_plan_change   VARCHAR(20),
    scheduled_change_date   TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN DEFAULT FALSE,
    
    -- Trial eligibility tracking
    has_used_trial_pro      BOOLEAN DEFAULT FALSE,
    has_used_trial_ent      BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end ON subscriptions(trial_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_grace_period_end ON subscriptions(grace_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_scheduled_change_date ON subscriptions(scheduled_change_date);

-- Create payment_methods table
CREATE TABLE IF NOT EXISTS payment_methods (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Stripe reference
    stripe_payment_method_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- Non-sensitive card info only
    card_brand              VARCHAR(50),
    card_last4              VARCHAR(4),
    exp_month               INTEGER,
    exp_year                INTEGER,
    
    is_default              BOOLEAN DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for payment_methods
CREATE INDEX IF NOT EXISTS idx_payment_methods_org ON payment_methods(org_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe ON payment_methods(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods(org_id, is_default) WHERE is_default = TRUE;

-- Create usage_metrics table
CREATE TABLE IF NOT EXISTS usage_metrics (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Billing period
    billing_period_start    TIMESTAMPTZ NOT NULL,
    billing_period_end      TIMESTAMPTZ NOT NULL,
    
    -- Usage counters
    analyses_count          INTEGER DEFAULT 0 CHECK (analyses_count >= 0),
    api_calls_count         INTEGER DEFAULT 0 CHECK (api_calls_count >= 0),
    storage_used_gb         DECIMAL(10, 2) DEFAULT 0.00 CHECK (storage_used_gb >= 0),
    
    -- Timestamps
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (org_id, billing_period_start)
);

-- Create indexes for usage_metrics
CREATE INDEX IF NOT EXISTS idx_usage_metrics_org ON usage_metrics(org_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_org_period ON usage_metrics(org_id, billing_period_start);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_period_start ON usage_metrics(billing_period_start);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Stripe reference
    stripe_invoice_id       VARCHAR(255) NOT NULL UNIQUE,
    stripe_invoice_url      TEXT,
    stripe_invoice_pdf      TEXT,
    
    -- Invoice details
    amount_due              DECIMAL(10, 2) NOT NULL,
    amount_paid             DECIMAL(10, 2),
    currency                VARCHAR(3) DEFAULT 'usd',
    
    -- Billing period
    period_start            TIMESTAMPTZ,
    period_end              TIMESTAMPTZ,
    
    -- Status
    status                  VARCHAR(20) CHECK (status IN (
                                'draft', 'open', 'paid', 'void', 'uncollectible'
                            )),
    
    -- Timestamps
    paid_at                 TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe ON invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_paid_at ON invoices(paid_at);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);

-- Create webhook_events table (for idempotency and audit trail)
CREATE TABLE IF NOT EXISTS webhook_events (
    id                      SERIAL PRIMARY KEY,
    stripe_event_id         VARCHAR(255) NOT NULL UNIQUE,
    event_type              VARCHAR(100) NOT NULL,
    
    -- Event data
    payload                 JSONB NOT NULL,
    
    -- Processing state
    processed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_result       VARCHAR(20) CHECK (processing_result IN (
                                'success', 'failure', 'skipped'
                            )),
    error_message           TEXT,
    
    CHECK (
        (processing_result = 'failure' AND error_message IS NOT NULL) OR 
        (processing_result != 'failure')
    )
);

-- Create indexes for webhook_events
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe ON webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_result ON webhook_events(processing_result);

-- Create rate_limits table (in-memory alternative: Redis)
CREATE TABLE IF NOT EXISTS rate_limits (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Time window
    window_start            TIMESTAMPTZ NOT NULL,
    window_end              TIMESTAMPTZ NOT NULL,
    
    -- Counter
    request_count           INTEGER DEFAULT 0 CHECK (request_count >= 0),
    
    UNIQUE (org_id, window_start)
);

-- Create indexes for rate_limits
CREATE INDEX IF NOT EXISTS idx_rate_limits_org ON rate_limits(org_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_org_window ON rate_limits(org_id, window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_end ON rate_limits(window_end);

-- Create retention_cleanup_log table
CREATE TABLE IF NOT EXISTS retention_cleanup_log (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Cleanup details
    analyses_deleted        INTEGER DEFAULT 0 CHECK (analyses_deleted >= 0),
    data_deleted_gb         DECIMAL(10, 2) DEFAULT 0.00 CHECK (data_deleted_gb >= 0),
    
    -- Timestamps
    cleanup_date            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for retention_cleanup_log
CREATE INDEX IF NOT EXISTS idx_cleanup_log_org ON retention_cleanup_log(org_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_log_date ON retention_cleanup_log(cleanup_date);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp for subscriptions
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trigger_update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscriptions_updated_at();

-- Auto-update updated_at timestamp for usage_metrics
CREATE OR REPLACE FUNCTION update_usage_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_usage_metrics_updated_at ON usage_metrics;
CREATE TRIGGER trigger_update_usage_metrics_updated_at
    BEFORE UPDATE ON usage_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_usage_metrics_updated_at();

-- ============================================================================
-- BACKFILL EXISTING ORGANIZATIONS WITH FREE SUBSCRIPTIONS
-- ============================================================================

-- Insert free subscriptions for all existing organizations that don't have one
INSERT INTO subscriptions (org_id, plan_tier, status, current_period_start, current_period_end)
SELECT 
    id,
    'free',
    'active',
    NOW(),
    NOW() + INTERVAL '30 days'
FROM organizations
WHERE id NOT IN (SELECT org_id FROM subscriptions)
ON CONFLICT (org_id) DO NOTHING;

-- Create initial usage records for all subscriptions
INSERT INTO usage_metrics (org_id, billing_period_start, billing_period_end)
SELECT 
    org_id,
    current_period_start,
    current_period_end
FROM subscriptions
WHERE org_id NOT IN (
    SELECT org_id FROM usage_metrics 
    WHERE billing_period_start = (SELECT current_period_start FROM subscriptions WHERE subscriptions.org_id = usage_metrics.org_id)
)
ON CONFLICT (org_id, billing_period_start) DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify all tables were created
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN (
        'subscriptions', 'payment_methods', 'usage_metrics', 
        'invoices', 'webhook_events', 'rate_limits', 'retention_cleanup_log'
    );
    
    IF table_count = 7 THEN
        RAISE NOTICE '✓ All 7 billing tables created successfully';
    ELSE
        RAISE EXCEPTION '✗ Expected 7 billing tables, found %', table_count;
    END IF;
END $$;

-- Verify all organizations have subscriptions
DO $$
DECLARE
    org_count INTEGER;
    sub_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO org_count FROM organizations;
    SELECT COUNT(*) INTO sub_count FROM subscriptions;
    
    IF org_count = sub_count THEN
        RAISE NOTICE '✓ All % organizations have subscriptions', org_count;
    ELSE
        RAISE EXCEPTION '✗ Organizations: %, Subscriptions: %', org_count, sub_count;
    END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Display summary
SELECT 
    'Migration Complete' as status,
    COUNT(*) as total_organizations,
    COUNT(*) FILTER (WHERE plan_tier = 'free') as free_tier,
    COUNT(*) FILTER (WHERE plan_tier = 'pro') as pro_tier,
    COUNT(*) FILTER (WHERE plan_tier = 'enterprise') as enterprise_tier
FROM subscriptions;
