-- MKChain Migration 006: Subscription & Billing System
-- Creates tables for subscription management, payment processing, usage tracking, and invoicing
-- Requirements: 1.6, 1.7, 2.1, 4.4, 8.8, 9.1

-- ============================================================================
-- SUBSCRIPTION TABLES
-- ============================================================================

-- Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
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

-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON public.subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end ON public.subscriptions(trial_end) WHERE trial_end IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_grace_period_end ON public.subscriptions(grace_period_end) WHERE grace_period_end IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_scheduled_change ON public.subscriptions(scheduled_change_date) WHERE scheduled_change_date IS NOT NULL;

-- Payment methods table
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    
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

-- Indexes for payment methods
CREATE INDEX IF NOT EXISTS idx_payment_methods_org ON public.payment_methods(org_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe ON public.payment_methods(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON public.payment_methods(org_id, is_default) WHERE is_default = TRUE;

-- Usage metrics table
CREATE TABLE IF NOT EXISTS public.usage_metrics (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Billing period
    billing_period_start    TIMESTAMPTZ NOT NULL,
    billing_period_end      TIMESTAMPTZ NOT NULL,
    
    -- Usage counters
    analyses_count          INTEGER DEFAULT 0 CHECK (analyses_count >= 0),
    api_calls_count         INTEGER DEFAULT 0 CHECK (api_calls_count >= 0),
    storage_used_gb         DECIMAL(10, 2) DEFAULT 0.00 CHECK (storage_used_gb >= 0),
    
    -- Timestamps
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_usage_org_period UNIQUE (org_id, billing_period_start)
);

-- Indexes for usage metrics
CREATE INDEX IF NOT EXISTS idx_usage_metrics_org ON public.usage_metrics(org_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_org_period ON public.usage_metrics(org_id, billing_period_start);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_period_start ON public.usage_metrics(billing_period_start);

-- Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    
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

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe ON public.invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_paid_at ON public.invoices(paid_at);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at);

-- Webhook events table (for idempotency and audit trail)
CREATE TABLE IF NOT EXISTS public.webhook_events (
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
    
    CONSTRAINT check_webhook_result CHECK (
        (processing_result = 'failure' AND error_message IS NOT NULL) OR
        (processing_result != 'failure')
    )
);

-- Indexes for webhook events
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe ON public.webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON public.webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON public.webhook_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_result ON public.webhook_events(processing_result);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Time window
    window_start            TIMESTAMPTZ NOT NULL,
    window_end              TIMESTAMPTZ NOT NULL,
    
    -- Counter
    request_count           INTEGER DEFAULT 0 CHECK (request_count >= 0),
    
    CONSTRAINT uq_rate_limit_org_window UNIQUE (org_id, window_start)
);

-- Indexes for rate limits
CREATE INDEX IF NOT EXISTS idx_rate_limits_org ON public.rate_limits(org_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_org_window ON public.rate_limits(org_id, window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_end ON public.rate_limits(window_end);

-- Data retention cleanup log
CREATE TABLE IF NOT EXISTS public.retention_cleanup_log (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Cleanup details
    analyses_deleted        INTEGER DEFAULT 0 CHECK (analyses_deleted >= 0),
    data_deleted_gb         DECIMAL(10, 2) DEFAULT 0.00 CHECK (data_deleted_gb >= 0),
    
    -- Timestamps
    cleanup_date            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for cleanup log
CREATE INDEX IF NOT EXISTS idx_cleanup_log_org ON public.retention_cleanup_log(org_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_log_date ON public.retention_cleanup_log(cleanup_date);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp for subscriptions
CREATE OR REPLACE FUNCTION public.update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trigger_update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_subscriptions_updated_at();

-- Auto-update updated_at timestamp for usage_metrics
CREATE OR REPLACE FUNCTION public.update_usage_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_usage_metrics_updated_at ON public.usage_metrics;
CREATE TRIGGER trigger_update_usage_metrics_updated_at
    BEFORE UPDATE ON public.usage_metrics
    FOR EACH ROW
    EXECUTE FUNCTION public.update_usage_metrics_updated_at();

-- ============================================================================
-- DATA BACKFILL
-- ============================================================================

-- Backfill existing organizations with free tier subscriptions
INSERT INTO public.subscriptions (org_id, plan_tier, status, current_period_start, current_period_end)
SELECT 
    id,
    'free',
    'active',
    NOW(),
    NOW() + INTERVAL '30 days'
FROM public.organizations
WHERE id NOT IN (SELECT org_id FROM public.subscriptions)
ON CONFLICT (org_id) DO NOTHING;

-- Create initial usage metrics records for all organizations
INSERT INTO public.usage_metrics (org_id, billing_period_start, billing_period_end, analyses_count, api_calls_count, storage_used_gb)
SELECT 
    s.org_id,
    s.current_period_start,
    s.current_period_end,
    0,
    0,
    0.00
FROM public.subscriptions s
WHERE NOT EXISTS (
    SELECT 1 FROM public.usage_metrics um 
    WHERE um.org_id = s.org_id 
    AND um.billing_period_start = s.current_period_start
)
ON CONFLICT (org_id, billing_period_start) DO NOTHING;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on billing tables
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_cleanup_log ENABLE ROW LEVEL SECURITY;

-- Subscriptions: Members can view their organization's subscription
CREATE POLICY "Members can view org subscription"
    ON public.subscriptions FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM public.memberships WHERE user_id = auth.uid()
        )
    );

-- Payment methods: Only owners and admins can view payment methods
CREATE POLICY "Owners and admins can view payment methods"
    ON public.payment_methods FOR SELECT
    USING (
        org_id IN (
            SELECT m.org_id FROM public.memberships m
            WHERE m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin')
        )
    );

-- Usage metrics: Members can view their organization's usage
CREATE POLICY "Members can view org usage metrics"
    ON public.usage_metrics FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM public.memberships WHERE user_id = auth.uid()
        )
    );

-- Invoices: Owners and admins can view invoices
CREATE POLICY "Owners and admins can view invoices"
    ON public.invoices FOR SELECT
    USING (
        org_id IN (
            SELECT m.org_id FROM public.memberships m
            WHERE m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin')
        )
    );

-- Rate limits: No direct user access (service only)
-- Retention cleanup log: Owners and admins can view cleanup logs
CREATE POLICY "Owners and admins can view cleanup logs"
    ON public.retention_cleanup_log FOR SELECT
    USING (
        org_id IN (
            SELECT m.org_id FROM public.memberships m
            WHERE m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.subscriptions IS 'Subscription plans and billing status for organizations';
COMMENT ON TABLE public.payment_methods IS 'Payment methods stored in Stripe (non-sensitive data only)';
COMMENT ON TABLE public.usage_metrics IS 'Resource consumption tracking per billing period';
COMMENT ON TABLE public.invoices IS 'Billing invoices and payment history';
COMMENT ON TABLE public.webhook_events IS 'Stripe webhook events for idempotency and audit trail';
COMMENT ON TABLE public.rate_limits IS 'API rate limiting counters per organization';
COMMENT ON TABLE public.retention_cleanup_log IS 'Data retention cleanup history';

COMMENT ON COLUMN public.subscriptions.plan_tier IS 'Subscription tier: free (10 analyses/month), pro (100 analyses/month), enterprise (unlimited)';
COMMENT ON COLUMN public.subscriptions.status IS 'Subscription status: active (paid and current), trialing (in trial period), past_due (payment failed, in grace period), canceled (ended), unpaid (grace period expired)';
COMMENT ON COLUMN public.subscriptions.trial_end IS 'Trial period expiration timestamp (14 days for first paid subscription)';
COMMENT ON COLUMN public.subscriptions.grace_period_end IS 'Grace period expiration after payment failure (7 days)';
COMMENT ON COLUMN public.subscriptions.has_used_trial_pro IS 'Whether organization has used pro trial (prevents repeated trials)';
COMMENT ON COLUMN public.subscriptions.has_used_trial_ent IS 'Whether organization has used enterprise trial (prevents repeated trials)';

COMMENT ON COLUMN public.usage_metrics.analyses_count IS 'Number of blockchain analyses performed in billing period';
COMMENT ON COLUMN public.usage_metrics.api_calls_count IS 'Number of authenticated API calls in billing period';
COMMENT ON COLUMN public.usage_metrics.storage_used_gb IS 'Storage consumed by analysis data in gigabytes';

COMMENT ON COLUMN public.invoices.amount_due IS 'Total invoice amount in dollars (decimal)';
COMMENT ON COLUMN public.invoices.amount_paid IS 'Amount actually paid (may differ from amount_due if partially paid)';
COMMENT ON COLUMN public.invoices.status IS 'Invoice status: draft (not finalized), open (awaiting payment), paid (payment succeeded), void (canceled), uncollectible (abandoned after retries)';
