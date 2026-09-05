import { PlanTier } from './types';

export const PLAN_FEATURES = {
  free: {
    analyses_per_month: 10,
    api_calls_per_hour: 100,
    storage_gb: 1,
    data_retention_days: 7,
    support: 'Community',
    price_monthly: 0,
    features: ['basic_analysis', '2d_graph'],
  },
  pro: {
    analyses_per_month: 100,
    api_calls_per_hour: 1000,
    storage_gb: 50,
    data_retention_days: 30,
    support: 'Email',
    price_monthly: 49,
    features: ['basic_analysis', '2d_graph', '3d_graph', 'ai_summary', 'pdf_report', 'comparison'],
  },
  enterprise: {
    analyses_per_month: -1, // unlimited
    api_calls_per_hour: 5000,
    storage_gb: 500,
    data_retention_days: 365,
    support: 'Priority',
    price_monthly: 299,
    features: ['*'], // all features
  },
} as const;

export type FeatureName = 
  | 'basic_analysis'
  | '2d_graph'
  | '3d_graph'
  | 'ai_summary'
  | 'pdf_report'
  | 'comparison'
  | 'custom_integration';

/**
 * Check if a plan tier includes access to a specific feature
 */
export function hasFeatureAccess(planTier: PlanTier, feature: FeatureName): boolean {
  const planFeatures = PLAN_FEATURES[planTier].features;
  
  // Enterprise has access to all features
  if (planFeatures.includes('*')) {
    return true;
  }
  
  return planFeatures.includes(feature);
}

/**
 * Get the minimum plan tier required for a feature
 */
export function getRequiredPlan(feature: FeatureName): PlanTier {
  if (hasFeatureAccess('free', feature)) return 'free';
  if (hasFeatureAccess('pro', feature)) return 'pro';
  return 'enterprise';
}

/**
 * Format plan name for display
 */
export function formatPlanName(planTier: PlanTier): string {
  return planTier.charAt(0).toUpperCase() + planTier.slice(1);
}

/**
 * Calculate usage percentage
 */
export function calculateUsagePercentage(current: number, limit: number): number {
  if (limit === -1) return 0; // unlimited
  if (limit === 0) return 100;
  return Math.min(Math.round((current / limit) * 100), 100);
}

/**
 * Get usage status color based on percentage
 */
export function getUsageStatusColor(percentage: number): 'default' | 'warning' | 'danger' {
  if (percentage >= 100) return 'danger';
  if (percentage >= 80) return 'warning';
  return 'default';
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}
