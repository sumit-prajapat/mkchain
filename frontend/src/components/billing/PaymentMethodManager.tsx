import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import type { PaymentMethod } from '@/lib/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Loader2, Trash2, CheckCircle2 } from 'lucide-react';
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

interface PaymentMethodManagerProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentMethodManager({ onClose, onSuccess }: PaymentMethodManagerProps) {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const { data: paymentMethods = [], isLoading } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods'],
    queryFn: () => endpoints.listPaymentMethods(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => endpoints.removePaymentMethod(id),
    onSuccess: () => {
      toast.success('Payment method removed');
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['billing-dashboard'] });
      setDeleteId(null);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to remove payment method');
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => endpoints.setDefaultPaymentMethod(id),
    onSuccess: () => {
      toast.success('Default payment method updated');
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['billing-dashboard'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to set default payment method');
    },
  });

  const handleAddPaymentMethod = () => {
    // In a real implementation, this would open Stripe Elements
    // For now, we'll just show a message
    toast.info('Stripe payment form integration coming soon');
    // TODO: Integrate Stripe Elements for payment method collection
  };

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Payment Methods</DialogTitle>
            <DialogDescription>
              Add or remove payment methods for your subscription
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : paymentMethods.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No payment methods on file</p>
                <Button onClick={handleAddPaymentMethod}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Add Payment Method
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {paymentMethods.map((pm) => (
                    <Card key={pm.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <CreditCard className="h-6 w-6 text-muted-foreground" />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">
                                {pm.card_brand?.toUpperCase()} •••• {pm.card_last4}
                              </p>
                              {pm.is_default && (
                                <Badge variant="secondary">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Default
                                </Badge>
                              )}
                              {pm.is_expiring_soon && (
                                <Badge variant="destructive">Expiring Soon</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Expires {pm.exp_month?.toString().padStart(2, '0')}/{pm.exp_year}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!pm.is_default && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDefaultMutation.mutate(pm.id)}
                              disabled={setDefaultMutation.isPending}
                            >
                              Set as Default
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(pm.id)}
                            disabled={pm.is_default && paymentMethods.length === 1}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                <Button onClick={handleAddPaymentMethod} className="w-full">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Add Another Payment Method
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Payment Method?</AlertDialogTitle>
            <AlertDialogDescription>
              This payment method will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
