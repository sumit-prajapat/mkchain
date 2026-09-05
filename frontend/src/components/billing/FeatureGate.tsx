import { ReactNode, useState } from 'react';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lock, TrendingUp } from 'lucide-react';
import { formatPlanName, type FeatureName } from '@/lib/features';
import { Link } from '@tanstack/react-router';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FeatureGateProps {
  feature: FeatureName;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgradeBadge?: boolean;
  mode?: 'hide' | 'disable' | 'prompt';
}

/**
 * FeatureGate component that wraps restricted features
 * 
 * @param feature - The feature name to check access for
 * @param children - Content to show when user has access
 * @param fallback - Optional content to show when user doesn't have access (for 'hide' mode)
 * @param showUpgradeBadge - Show an "Upgrade" badge next to the content (default: true)
 * @param mode - How to handle restricted access:
 *   - 'hide': Hide the feature entirely (show fallback if provided)
 *   - 'disable': Show but disable the feature with an upgrade badge
 *   - 'prompt': Show the feature but clicking it opens an upgrade modal (default)
 */
export function FeatureGate({
  feature,
  children,
  fallback = null,
  showUpgradeBadge = true,
  mode = 'prompt',
}: FeatureGateProps) {
  const { hasAccess, currentPlan, requiredPlan, isLoading } = useFeatureAccess(feature);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // While loading, show the content (avoid flash)
  if (isLoading) {
    return <>{children}</>;
  }

  // User has access - show the content normally
  if (hasAccess) {
    return <>{children}</>;
  }

  // User doesn't have access
  switch (mode) {
    case 'hide':
      return <>{fallback}</>;

    case 'disable':
      return (
        <div className="relative inline-block">
          <div className="pointer-events-none opacity-50">
            {children}
          </div>
          {showUpgradeBadge && (
            <Badge
              variant="secondary"
              className="absolute -top-2 -right-2 cursor-pointer"
              onClick={() => setShowUpgradeModal(true)}
            >
              <Lock className="h-3 w-3 mr-1" />
              {formatPlanName(requiredPlan)}
            </Badge>
          )}
          <UpgradeModal
            isOpen={showUpgradeModal}
            onClose={() => setShowUpgradeModal(false)}
            featureName={getFeatureDisplayName(feature)}
            currentPlan={currentPlan}
            requiredPlan={requiredPlan}
          />
        </div>
      );

    case 'prompt':
    default:
      return (
        <div className="relative inline-block">
          <div onClick={() => setShowUpgradeModal(true)} className="cursor-pointer">
            {children}
          </div>
          {showUpgradeBadge && (
            <Badge
              variant="secondary"
              className="absolute -top-2 -right-2 pointer-events-none"
            >
              <Lock className="h-3 w-3 mr-1" />
              {formatPlanName(requiredPlan)}
            </Badge>
          )}
          <UpgradeModal
            isOpen={showUpgradeModal}
            onClose={() => setShowUpgradeModal(false)}
            featureName={getFeatureDisplayName(feature)}
            currentPlan={currentPlan}
            requiredPlan={requiredPlan}
          />
        </div>
      );
  }
}

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
  currentPlan: string;
  requiredPlan: string;
}

function UpgradeModal({ isOpen, onClose, featureName, currentPlan, requiredPlan }: UpgradeModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            Upgrade Required
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold">{featureName}</span> is available on the{' '}
            <span className="font-semibold">{formatPlanName(requiredPlan)}</span> plan and above.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            You're currently on the <span className="font-medium">{formatPlanName(currentPlan)}</span> plan. 
            Upgrade to unlock this feature and get access to:
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {requiredPlan === 'pro' && (
              <>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>100 analyses per month</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>AI-powered analysis summaries</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>PDF report generation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Wallet comparison tool</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>50 GB storage</span>
                </li>
              </>
            )}
            {requiredPlan === 'enterprise' && (
              <>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Unlimited analyses</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Custom integrations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Priority support</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>500 GB storage</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>365-day data retention</span>
                </li>
              </>
            )}
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Maybe Later
          </Button>
          <Button asChild>
            <Link to="/billing">
              <TrendingUp className="h-4 w-4 mr-2" />
              View Plans
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getFeatureDisplayName(feature: FeatureName): string {
  const names: Record<FeatureName, string> = {
    basic_analysis: 'Basic Analysis',
    '2d_graph': '2D Graph Visualization',
    '3d_graph': '3D Graph Visualization',
    ai_summary: 'AI-Powered Summary',
    pdf_report: 'PDF Report Generation',
    comparison: 'Wallet Comparison',
    custom_integration: 'Custom Integrations',
  };
  return names[feature] || feature;
}
