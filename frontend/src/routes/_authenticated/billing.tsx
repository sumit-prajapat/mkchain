import { createFileRoute } from '@tanstack/react-router';
import { BillingDashboard } from '@/components/billing/BillingDashboard';

export const Route = createFileRoute('/_authenticated/billing')({
  component: BillingPage,
});

function BillingPage() {
  return (
    <div className="container mx-auto py-8">
      <BillingDashboard />
    </div>
  );
}
