import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { hasFeatureAccess, getRequiredPlan, type FeatureName } from '@/lib/features';
import type { PlanTier } from '@/lib/types';

interface FeatureAccessResult {
  hasAccess: boolean;
  currentPlan: PlanTier;
  requiredPlan: PlanTier;
  isLoading: boolean;
}

/**
 * Hook to check if the current organization has access to a specific feature
 */
export function useFeatureAccess(featureName: FeatureName): FeatureAccessResult {
  const { data: subscription, isLoading } = useQuery({
    queryKey: ['current-subscription'],
    queryFn: () => endpoints.getCurrentSubscription(),
    staleTime: 60_000, // Cache for 1 minute
  });

  const currentPlan = (subscription?.plan_tier || 'free') as PlanTier;
  const requiredPlan = getRequiredPlan(featureName);
  const hasAccess = hasFeatureAccess(currentPlan, featureName);

  return {
    hasAccess,
    currentPlan,
    requiredPlan,
    isLoading,
  };
}

/**
 * Hook to check quota status
 */
export function useQuotaStatus() {
  const { data: usage, isLoading } = useQuery({
    queryKey: ['quota-status'],
    queryFn: () => endpoints.getCurrentUsage(),
    refetchInterval: 60_000, // Refresh every minute
  });

  return {
    usage,
    isLoading,
    isOverLimit: usage?.analyses_count >= usage?.plan_limits?.analyses_per_month,
    analysesRemaining: usage?.plan_limits?.analyses_per_month === -1 
      ? Infinity 
      : Math.max(0, (usage?.plan_limits?.analyses_per_month || 0) - (usage?.analyses_count || 0)),
  };
}
