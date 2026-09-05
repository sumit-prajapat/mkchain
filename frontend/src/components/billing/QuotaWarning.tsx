import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, XCircle, TrendingUp } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { calculateUsagePercentage, formatPlanName } from '@/lib/features';
import { PLAN_FEATURES } from '@/lib/features';

interface QuotaStatus {
  plan_tier: string;
  analyses_used: number;
  analyses_limit: number;
  analyses_percentage: number;
  storage_used_gb: number;
  storage_limit_gb: number;
  storage_percentage: number;
  is_over_limit: boolean;
}

export function QuotaWarning() {
  const { data: quotaStatus, isLoading } = useQuery<QuotaStatus>({
    queryKey: ['quota-status'],
    queryFn: () => endpoints.getCurrentUsage().then(usage => {
      const limits = PLAN_FEATURES[usage.plan_tier as keyof typeof PLAN_FEATURES];
      return {
        plan_tier: usage.plan_tier,
        analyses_used: usage.analyses_count,
        analyses_limit: limits.analyses_per_month,
        analyses_percentage: calculateUsagePercentage(usage.analyses_count, limits.analyses_per_month),
        storage_used_gb: usage.storage_used_gb,
        storage_limit_gb: limits.storage_gb,
        storage_percentage: calculateUsagePercentage(usage.storage_used_gb, limits.storage_gb),
        is_over_limit: usage.analyses_count >= limits.analyses_per_month || usage.storage_used_gb >= limits.storage_gb,
      };
    }),
    enabled: true,
    refetchInterval: 60_000, // Refresh every minute
  });

  if (isLoading || !quotaStatus) return null;

  const { analyses_percentage, storage_percentage, is_over_limit, analyses_used, analyses_limit } = quotaStatus;
  const maxPercentage = Math.max(analyses_percentage, storage_percentage);

  // Only show warning if usage is >= 80%
  if (maxPercentage < 80) return null;

  const isBlocked = is_over_limit;
  const isWarning = maxPercentage >= 80 && !isBlocked;

  return (
    <Alert variant={isBlocked ? 'destructive' : 'default'} className="mb-4">
      <div className="flex items-start gap-3">
        {isBlocked ? (
          <XCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
        ) : (
          <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0 text-yellow-600" />
        )}
        <div className="flex-1">
          <AlertDescription>
            {isBlocked ? (
              <div>
                <p className="font-semibold mb-1">Quota Limit Reached</p>
                <p className="text-sm">
                  You've reached your {formatPlanName(quotaStatus.plan_tier)} plan limit 
                  ({analyses_used}/{analyses_limit === -1 ? '∞' : analyses_limit} analyses).
                  Upgrade your plan to continue using MKChain.
                </p>
              </div>
            ) : (
              <div>
                <p className="font-semibold mb-1">Approaching Quota Limit</p>
                <p className="text-sm">
                  You've used {maxPercentage}% of your {formatPlanName(quotaStatus.plan_tier)} plan quota.
                  Consider upgrading to avoid service interruption.
                </p>
              </div>
            )}
            <Button asChild size="sm" variant={isBlocked ? 'secondary' : 'default'} className="mt-3">
              <Link to="/billing">
                <TrendingUp className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Link>
            </Button>
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}

export function QuotaBadge() {
  const { data: quotaStatus } = useQuery<QuotaStatus>({
    queryKey: ['quota-status'],
    queryFn: () => endpoints.getCurrentUsage().then(usage => {
      const limits = PLAN_FEATURES[usage.plan_tier as keyof typeof PLAN_FEATURES];
      return {
        plan_tier: usage.plan_tier,
        analyses_used: usage.analyses_count,
        analyses_limit: limits.analyses_per_month,
        analyses_percentage: calculateUsagePercentage(usage.analyses_count, limits.analyses_per_month),
        storage_used_gb: usage.storage_used_gb,
        storage_limit_gb: limits.storage_gb,
        storage_percentage: calculateUsagePercentage(usage.storage_used_gb, limits.storage_gb),
        is_over_limit: usage.analyses_count >= limits.analyses_per_month,
      };
    }),
    enabled: true,
    refetchInterval: 60_000,
  });

  if (!quotaStatus) return null;

  const { analyses_percentage, is_over_limit } = quotaStatus;

  // Only show badge if usage is >= 80%
  if (analyses_percentage < 80) return null;

  return (
    <Link to="/billing">
      <Badge variant={is_over_limit ? 'destructive' : 'secondary'} className="cursor-pointer hover:opacity-80">
        {analyses_percentage}% used
      </Badge>
    </Link>
  );
}
