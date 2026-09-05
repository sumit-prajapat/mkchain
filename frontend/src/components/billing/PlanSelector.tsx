import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import type { PlanTier, ProrationPreview } from '@/lib/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, X } from 'lucide-react';
import { PLAN_FEATURES, formatCurrency, formatPlanName } from '@/lib/features';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PlanSelectorProps {
  currentPlan: PlanTier;
  onClose: () => void;
  onSuccess: () => void;
}

export function PlanSelector({ currentPlan, onClose, onSuccess }: PlanSelectorProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanTier | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const { data: proration, isLoading: isLoadingProration } = useQuery<ProrationPreview>({
    queryKey: ['proration-preview', selectedPlan],
    queryFn: () => endpoints.previewProration(selectedPlan!),
    enabled: selectedPlan !== null && selectedPlan !== currentPlan,
  });

  const updateSubscription = useMutation({
    mutationFn: (plan: PlanTier) => endpoints.updateSubscription({ new_plan_tier: plan }),
    onSuccess: () => {
      toast.success('Subscription updated successfully');
      onSuccess();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to update subscription');
    },
  });

  const handleSelectPlan = (plan: PlanTier) => {
    if (plan === currentPlan) return;
    setSelectedPlan(plan);
    setShowConfirmation(true);
  };

  const handleConfirm = () => {
    if (selectedPlan) {
      updateSubscription.mutate(selectedPlan);
    }
  };

  const isUpgrade = (plan: PlanTier): boolean => {
    const order: Record<PlanTier, number> = { free: 0, pro: 1, enterprise: 2 };
    return order[plan] > order[currentPlan];
  };

  const plans: Array<{ tier: PlanTier; popular?: boolean }> = [
    { tier: 'free' },
    { tier: 'pro', popular: true },
    { tier: 'enterprise' },
  ];

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose Your Plan</DialogTitle>
            <DialogDescription>
              Select the plan that best fits your needs
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-3 mt-4">
            {plans.map(({ tier, popular }) => {
              const features = PLAN_FEATURES[tier];
              const isCurrent = tier === currentPlan;
              const upgrade = isUpgrade(tier);

              return (
                <Card 
                  key={tier} 
                  className={`relative ${popular ? 'border-primary shadow-lg' : ''} ${isCurrent ? 'bg-muted/50' : ''}`}
                >
                  {popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge>Most Popular</Badge>
                    </div>
                  )}
                  
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {formatPlanName(tier)}
                      {isCurrent && <Badge variant="secondary">Current</Badge>}
                    </CardTitle>
                    <CardDescription>
                      {tier === 'free' && 'Perfect for getting started'}
                      {tier === 'pro' && 'For professional investigators'}
                      {tier === 'enterprise' && 'For large organizations'}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div>
                      <span className="text-4xl font-bold">
                        {features.price_monthly === 0 ? 'Free' : formatCurrency(features.price_monthly!)}
                      </span>
                      {features.price_monthly > 0 && (
                        <span className="text-muted-foreground">/month</span>
                      )}
                    </div>

                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">
                          {features.analyses_per_month === -1 ? 'Unlimited' : features.analyses_per_month} analyses/month
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">
                          {features.storage_gb} GB storage
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">
                          {features.data_retention_days} day data retention
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">
                          {features.support} support
                        </span>
                      </li>
                      
                      {tier === 'pro' && (
                        <>
                          <li className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">AI-powered summaries</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">PDF report generation</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">Wallet comparison</span>
                          </li>
                        </>
                      )}
                      
                      {tier === 'enterprise' && (
                        <>
                          <li className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">All Pro features</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">Custom integrations</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">Priority support</span>
                          </li>
                        </>
                      )}

                      {tier === 'free' && (
                        <>
                          <li className="flex items-start gap-2 text-muted-foreground">
                            <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">AI summaries</span>
                          </li>
                          <li className="flex items-start gap-2 text-muted-foreground">
                            <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">PDF reports</span>
                          </li>
                        </>
                      )}
                    </ul>
                  </CardContent>

                  <CardFooter>
                    <Button
                      className="w-full"
                      variant={isCurrent ? 'outline' : popular ? 'default' : 'outline'}
                      disabled={isCurrent || updateSubscription.isPending}
                      onClick={() => handleSelectPlan(tier)}
                    >
                      {isCurrent ? 'Current Plan' : upgrade ? 'Upgrade' : 'Downgrade'}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedPlan && isUpgrade(selectedPlan) ? 'Upgrade' : 'Downgrade'} to{' '}
              {selectedPlan && formatPlanName(selectedPlan)}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {isLoadingProration ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Calculating proration...</span>
                </div>
              ) : proration ? (
                <>
                  {isUpgrade(selectedPlan!) ? (
                    <>
                      <p>Your plan will be upgraded immediately.</p>
                      {proration.prorated_amount > 0 && (
                        <p className="font-medium">
                          You will be charged {formatCurrency(proration.prorated_amount)} for the prorated amount.
                        </p>
                      )}
                      <p className="text-sm">
                        Next billing date: {new Date(proration.next_payment_date).toLocaleDateString()}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>Your plan will be downgraded at the end of your current billing period.</p>
                      {proration.prorated_amount < 0 && (
                        <p className="font-medium">
                          You will receive a credit of {formatCurrency(Math.abs(proration.prorated_amount))} on your next invoice.
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        You'll continue to have access to your current plan features until{' '}
                        {new Date(proration.next_payment_date).toLocaleDateString()}
                      </p>
                    </>
                  )}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirm}
              disabled={updateSubscription.isPending}
            >
              {updateSubscription.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                'Confirm'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
