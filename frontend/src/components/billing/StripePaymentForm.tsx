/**
 * Stripe Payment Form Component
 * 
 * This component integrates Stripe Elements for secure credit card input.
 * 
 * SETUP REQUIRED:
 * 1. Install Stripe packages:
 *    npm install @stripe/stripe-js @stripe/react-stripe-js
 * 
 * 2. Add Stripe publishable key to environment:
 *    VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
 * 
 * 3. Wrap your app with StripeProvider in App.tsx or root component
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
// Uncomment after installing @stripe/react-stripe-js
// import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { endpoints } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, CreditCard } from 'lucide-react';

interface StripePaymentFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function StripePaymentForm({ onSuccess, onCancel }: StripePaymentFormProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const queryClient = useQueryClient();
  
  // Uncomment after installing @stripe/react-stripe-js
  // const stripe = useStripe();
  // const elements = useElements();

  const addPaymentMethod = useMutation({
    mutationFn: (paymentMethodId: string) => endpoints.addPaymentMethod(paymentMethodId),
    onSuccess: () => {
      toast.success('Payment method added successfully');
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['billing-dashboard'] });
      onSuccess();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to add payment method');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    /* STRIPE INTEGRATION CODE (uncomment after installing packages):
    
    if (!stripe || !elements) {
      toast.error('Stripe has not loaded yet');
      return;
    }

    setIsProcessing(true);

    try {
      // Get card element
      const cardElement = elements.getElement(CardElement);
      
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      // Create payment method with Stripe
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!paymentMethod) {
        throw new Error('No payment method created');
      }

      // Send payment method ID to backend
      await addPaymentMethod.mutateAsync(paymentMethod.id);
      
    } catch (error: any) {
      toast.error(error.message || 'Payment method creation failed');
    } finally {
      setIsProcessing(false);
    }
    */

    // Temporary placeholder until Stripe is integrated
    toast.info('Stripe Elements integration pending. Install @stripe/react-stripe-js to enable.');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Card Information</label>
        
        {/* Placeholder for Stripe CardElement */}
        <div className="border border-border rounded-lg p-3 bg-muted-surface/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CreditCard className="h-4 w-4" />
            <span>Stripe Elements will appear here after setup</span>
          </div>
        </div>

        {/* 
        ACTUAL STRIPE INTEGRATION (uncomment after setup):
        
        <div className="border border-border rounded-lg p-3 bg-muted-surface/60">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: 'hsl(var(--foreground))',
                  '::placeholder': {
                    color: 'hsl(var(--muted-foreground))',
                  },
                },
                invalid: {
                  color: 'hsl(var(--destructive))',
                },
              },
            }}
          />
        </div>
        */}
      </div>

      <div className="text-xs text-muted-foreground">
        Your payment information is securely processed by Stripe. We never store your card details.
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={isProcessing}
          className="flex-1"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Processing...
            </>
          ) : (
            'Add Payment Method'
          )}
        </Button>
      </div>
    </form>
  );
}

/**
 * Setup Instructions for Stripe Integration:
 * 
 * 1. Install packages:
 *    `ash
 *    npm install @stripe/stripe-js @stripe/react-stripe-js
 *    `
 * 
 * 2. Create Stripe provider wrapper (src/lib/stripe.ts):
 *    `	ypescript
 *    import { loadStripe } from '@stripe/stripe-js';
 *    
 *    export const stripePromise = loadStripe(
 *      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
 *    );
 *    `
 * 
 * 3. Wrap your app with Elements provider (in root component or App.tsx):
 *    `	ypescript
 *    import { Elements } from '@stripe/react-stripe-js';
 *    import { stripePromise } from '@/lib/stripe';
 *    
 *    <Elements stripe={stripePromise}>
 *      {/* Your app components *\/}
 *    </Elements>
 *    `
 * 
 * 4. Add environment variable (.env.local):
 *    `
 *    VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
 *    `
 * 
 * 5. Uncomment the Stripe-related code in this file
 */
