// Response shapes for the MKChain FastAPI backend.
// Every field is optional-tolerant: the UI must degrade gracefully.

export type Chain = "eth" | "btc" | "polygon";

export type RiskLabel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;

export interface RiskFactor {
  type?: string | undefined;
  name?: string | undefined;
  severity?: string | undefined;
  description?: string | undefined;
  score?: number | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface GraphNode {
  id: string;
  address?: string | undefined;
  label?: string | undefined;
  type?: string; // root | mixer | darkweb | exchange | clean
  risk_score?: number | undefined;
  value?: number | undefined;
}

export interface GraphEdge {
  source: string;
  target: string;
  value?: number | undefined;
  tx_hash?: string | undefined;
  timestamp?: string | undefined;
}

export interface TxRow {
  hash?: string | undefined;
  tx_hash?: string | undefined;
  from_address?: string | undefined;
  to_address?: string | undefined;
  value?: number | string | undefined;
  timestamp?: string | undefined;
  block_number?: number | undefined;
  flags?: string[] | undefined;
  is_mixer?: boolean | undefined;
  is_darkweb?: boolean | undefined;
  is_high_value?: boolean | undefined;
}

export interface DarkwebMatch {
  id?: string | number | undefined;
  entity_name?: string | undefined;
  name?: string | undefined;
  category?: string | undefined;
  source?: string | undefined;
  address?: string | undefined;
  chain?: string | undefined;
  description?: string | undefined;
}

export interface Analysis {
  id: string;
  address: string;
  chain: Chain | string;
  hops?: number | undefined;
  risk_score?: number | undefined;
  risk_label?: RiskLabel | undefined;
  ofac_boost?: boolean | undefined;
  score_floor_reason?: string | undefined;
  created_at?: string | undefined;
  analyzed_at?: string | undefined;
  risk_factors?: RiskFactor[] | undefined;
  flags?: RiskFactor[] | undefined;
  transactions?: TxRow[] | undefined;
  graph_nodes?: GraphNode[] | undefined;
  graph_edges?: GraphEdge[] | undefined;
  nodes?: GraphNode[] | undefined;
  edges?: GraphEdge[] | undefined;
  darkweb_matches?: DarkwebMatch[] | undefined;
  ai_summary?: string | undefined;
  summary?: string | undefined;
  transaction_count?: number | undefined;
  total_value?: number | undefined;
}

export interface DarkwebStats {
  total_addresses?: number | undefined;
  total_entities?: number | undefined;
  total_categories?: number | undefined;
  categories?: Record<string, number> | string[] | undefined;
  chains?: Record<string, number> | undefined;
}

export interface DarkwebEntity {
  id?: string | number | undefined;
  entity_id?: string | undefined;
  label?: string | undefined;
  name?: string | undefined;
  entity_name?: string | undefined;
  category?: string | undefined;
  source?: string | undefined;
  description?: string | undefined;
  chain?: string | undefined;
  chains?: string[] | undefined;
  address_count?: number | undefined;
  addresses?: Array<{ address: string; chain?: string } | string>;
}

export interface CompareResult {
  relationship?: string; // DIRECTLY LINKED | N SHARED COUNTERPARTIES | NO DIRECT LINK
  shared_counterparties?: string[] | undefined;
  shared_flags?: string[] | undefined;
  analysis_a?: Analysis | undefined;
  analysis_b?: Analysis | undefined;
  wallet_a?: Analysis | undefined;
  wallet_b?: Analysis | undefined;
}

export interface WatchedAddress {
  id: string;
  address: string;
  chain?: string | undefined;
  label?: string | undefined;
  threshold?: number | undefined;
  last_checked?: string | undefined;
  unread_count?: number | undefined;
  created_at?: string | undefined;
}

export interface AlertItem {
  id: string;
  type?: string; // new_tx | high_risk | mixer | darkweb
  alert_type?: string | undefined;
  address?: string | undefined;
  chain?: string | undefined;
  message?: string | undefined;
  value?: number | string | undefined;
  is_read?: boolean | undefined;
  read?: boolean | undefined;
  created_at?: string | undefined;
  timestamp?: string | undefined;
}

export interface BtcDeep {
  address?: string | undefined;
  utxo_count?: number | undefined;
  total_received?: number | undefined;
  total_sent?: number | undefined;
  balance?: number | undefined;
  script_type?: string | undefined;
  privacy_level?: string | undefined;
  coinjoin_confidence?: number | undefined;
  coin_age_days?: number | undefined;
  first_seen?: string | undefined;
  last_seen?: string | undefined;
}

// ============================================================================
// BILLING & SUBSCRIPTION TYPES
// ============================================================================

export type PlanTier = "free" | "pro" | "enterprise";

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid";

export interface Subscription {
  id: number;
  org_id: string;
  plan_tier: PlanTier;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  stripe_price_id?: string;
  status: SubscriptionStatus;
  current_period_start?: string;
  current_period_end?: string;
  trial_end?: string;
  grace_period_end?: string;
  scheduled_plan_change?: PlanTier;
  scheduled_change_date?: string;
  cancel_at_period_end?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: number;
  org_id: string;
  stripe_payment_method_id: string;
  card_brand?: string;
  card_last4?: string;
  exp_month?: number;
  exp_year?: number;
  is_default?: boolean;
  is_expiring_soon?: boolean;
  created_at: string;
}

export interface UsageMetrics {
  id: number;
  org_id: string;
  billing_period_start: string;
  billing_period_end: string;
  analyses_count: number;
  api_calls_count: number;
  storage_used_gb: number;
  updated_at: string;
}

export interface Invoice {
  id: number;
  org_id: string;
  stripe_invoice_id: string;
  stripe_invoice_url?: string;
  stripe_invoice_pdf?: string;
  amount_due: number;
  amount_paid?: number;
  currency: string;
  period_start?: string;
  period_end?: string;
  status?: string;
  paid_at?: string;
  created_at: string;
}

export interface PlanFeatures {
  analyses_per_month: number;
  api_calls_per_hour: number;
  storage_gb: number;
  data_retention_days: number;
  features: string[];
  support: string;
  price_monthly?: number;
}

export interface BillingDashboard {
  subscription: Subscription;
  usage: UsageMetrics & {
    analyses_percentage: number;
    api_calls_percentage: number;
    storage_percentage: number;
  };
  payment_methods: PaymentMethod[];
  recent_invoices: Invoice[];
  plan_limits: PlanFeatures;
}

export interface ProrationPreview {
  current_plan: PlanTier;
  new_plan: PlanTier;
  prorated_amount: number;
  next_payment_date: string;
  currency: string;
}
