import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import type { BillingDashboard as BillingDashboardData } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, CreditCard, FileText, TrendingUp, Calendar } from 'lucide-react';
import { formatCurrency, getUsageStatusColor, PLAN_FEATURES, formatPlanName } from '@/lib/features';
import { format } from 'date-fns';
import { useState } from 'react';
import { PlanSelector } from './PlanSelector';
import { PaymentMethodManager } from './PaymentMethodManager';
import { InvoiceHistory } from './InvoiceHistory';

interface BillingDashboardProps {
  userRole?: 'owner' | 'admin' | 'member';
}

export function BillingDashboard({ userRole = 'member' }: BillingDashboardProps) {
  const [showPlanSelector, setShowPlanSelector] = useState(false);
  const [showPaymentManager, setShowPaymentManager] = useState(false);

  const { data: dashboard, isLoading, error, refetch } = useQuery<BillingDashboardData>({
    queryKey: ['billing-dashboard'],
    queryFn: () => endpoints.getBillingDashboard(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Failed to load billing information</p>
        <Button onClick={() => refetch()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  if (!dashboard) return null;

  const { subscription, usage, payment_methods, recent_invoices, plan_limits } = dashboard;
  const isOwner = userRole === 'owner';
  const canManageBilling = isOwner || userRole === 'admin';

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'trialing': return 'secondary';
      case 'past_due': return 'destructive';
      case 'canceled': return 'outline';
      default: return 'outline';
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return 'N/A';
    try {
      return format(new Date(date), 'MMM d, yyyy');
    } catch {
      return date;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">Manage your subscription and billing settings</p>
        </div>
      </div>

      {/* Subscription Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your subscription details and billing cycle</CardDescription>
            </div>
            {isOwner && (
              <Button onClick={() => setShowPlanSelector(true)}>
                Change Plan
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Plan</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold">{formatPlanName(subscription.plan_tier)}</p>
                <Badge variant={getStatusBadgeVariant(subscription.status)}>
                  {subscription.status}
                </Badge>
              </div>
            </div>
            
            {subscription.plan_tier !== 'free' && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="text-2xl font-bold mt-1">
                    {formatCurrency(plan_limits.price_monthly || 0)}/mo
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Billing Period</p>
                  <p className="text-lg font-medium mt-1">
                    {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    {subscription.status === 'trialing' ? 'Trial Ends' : 'Next Payment'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <p className="text-lg font-medium">
                      {formatDate(subscription.trial_end || subscription.current_period_end)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {subscription.cancel_at_period_end && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <p className="text-sm font-medium">
                Your subscription will be canceled on {formatDate(subscription.current_period_end)}
              </p>
            </div>
          )}

          {subscription.scheduled_plan_change && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <p className="text-sm font-medium">
                Your plan will change to {formatPlanName(subscription.scheduled_plan_change)} on{' '}
                {formatDate(subscription.scheduled_change_date)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Current Usage
          </CardTitle>
          <CardDescription>
            Usage for the current billing period (
            {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Analyses */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Analyses</span>
              <span className="text-muted-foreground">
                {usage.analyses_count} / {plan_limits.analyses_per_month === -1 ? '∞' : plan_limits.analyses_per_month}
              </span>
            </div>
            <Progress 
              value={usage.analyses_percentage} 
              className={getUsageStatusColor(usage.analyses_percentage) === 'danger' ? 'bg-red-500/20' : 
                         getUsageStatusColor(usage.analyses_percentage) === 'warning' ? 'bg-yellow-500/20' : ''}
            />
            {usage.analyses_percentage >= 80 && (
              <p className="text-xs text-muted-foreground">
                {usage.analyses_percentage >= 100 ? 
                  'You have reached your analysis limit. Upgrade to continue.' :
                  `You've used ${usage.analyses_percentage}% of your analysis quota.`
                }
              </p>
            )}
          </div>

          {/* Storage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Storage</span>
              <span className="text-muted-foreground">
                {usage.storage_used_gb.toFixed(2)} GB / {plan_limits.storage_gb} GB
              </span>
            </div>
            <Progress 
              value={usage.storage_percentage}
              className={getUsageStatusColor(usage.storage_percentage) === 'danger' ? 'bg-red-500/20' : 
                         getUsageStatusColor(usage.storage_percentage) === 'warning' ? 'bg-yellow-500/20' : ''}
            />
          </div>

          {/* API Calls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">API Calls (this hour)</span>
              <span className="text-muted-foreground">
                {usage.api_calls_count} / {plan_limits.api_calls_per_hour}
              </span>
            </div>
            <Progress 
              value={usage.api_calls_percentage}
              className={getUsageStatusColor(usage.api_calls_percentage) === 'danger' ? 'bg-red-500/20' : 
                         getUsageStatusColor(usage.api_calls_percentage) === 'warning' ? 'bg-yellow-500/20' : ''}
            />
          </div>
        </CardContent>
      </Card>

      {/* Payment Methods */}
      {canManageBilling && subscription.plan_tier !== 'free' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Methods
                </CardTitle>
                <CardDescription>Manage your payment methods</CardDescription>
              </div>
              {isOwner && (
                <Button onClick={() => setShowPaymentManager(true)} variant="outline">
                  Manage
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {payment_methods.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment methods on file</p>
            ) : (
              <div className="space-y-2">
                {payment_methods.map((pm) => (
                  <div key={pm.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {pm.card_brand?.toUpperCase()} •••• {pm.card_last4}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Expires {pm.exp_month}/{pm.exp_year}
                        </p>
                      </div>
                    </div>
                    {pm.is_default && <Badge>Default</Badge>}
                    {pm.is_expiring_soon && <Badge variant="destructive">Expiring Soon</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Invoices */}
      {canManageBilling && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Invoices
            </CardTitle>
            <CardDescription>Your billing history</CardDescription>
          </CardHeader>
          <CardContent>
            {recent_invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet</p>
            ) : (
              <InvoiceHistory invoices={recent_invoices} compact />
            )}
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      {showPlanSelector && (
        <PlanSelector
          currentPlan={subscription.plan_tier}
          onClose={() => setShowPlanSelector(false)}
          onSuccess={() => {
            setShowPlanSelector(false);
            refetch();
          }}
        />
      )}

      {showPaymentManager && (
        <PaymentMethodManager
          onClose={() => setShowPaymentManager(false)}
          onSuccess={() => {
            setShowPaymentManager(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
