import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import type { Invoice } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/features';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface InvoiceHistoryProps {
  invoices?: Invoice[];
  compact?: boolean;
  limit?: number;
}

export function InvoiceHistory({ invoices: providedInvoices, compact = false, limit }: InvoiceHistoryProps) {
  const [downloading, setDownloading] = useState<number | null>(null);

  const { data: fetchedInvoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', limit],
    queryFn: () => endpoints.listInvoices(limit),
    enabled: !providedInvoices,
  });

  const invoices = providedInvoices || fetchedInvoices || [];

  const handleDownloadPDF = async (invoiceId: number, pdfUrl?: string) => {
    if (!pdfUrl) {
      toast.error('PDF not available for this invoice');
      return;
    }

    setDownloading(invoiceId);
    try {
      // Open in new tab or download
      window.open(pdfUrl, '_blank');
    } catch (error) {
      toast.error('Failed to download invoice');
    } finally {
      setDownloading(null);
    }
  };

  const getStatusVariant = (status?: string) => {
    switch (status) {
      case 'paid':
        return 'default';
      case 'open':
        return 'secondary';
      case 'void':
      case 'uncollectible':
        return 'outline';
      default:
        return 'secondary';
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No invoices found
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {invoices.slice(0, limit || 5).map((invoice) => (
          <div
            key={invoice.id}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">
                  {formatCurrency(invoice.amount_due / 100, invoice.currency.toUpperCase())}
                </p>
                <Badge variant={getStatusVariant(invoice.status)}>
                  {invoice.status || 'pending'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {invoice.stripe_invoice_url && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.open(invoice.stripe_invoice_url, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              {invoice.stripe_invoice_pdf && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDownloadPDF(invoice.id, invoice.stripe_invoice_pdf)}
                  disabled={downloading === invoice.id}
                >
                  {downloading === invoice.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell>{formatDate(invoice.created_at)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
              </TableCell>
              <TableCell className="font-medium">
                {formatCurrency(invoice.amount_due / 100, invoice.currency.toUpperCase())}
              </TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(invoice.status)}>
                  {invoice.status || 'pending'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {invoice.stripe_invoice_url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(invoice.stripe_invoice_url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  )}
                  {invoice.stripe_invoice_pdf && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadPDF(invoice.id, invoice.stripe_invoice_pdf)}
                      disabled={downloading === invoice.id}
                    >
                      {downloading === invoice.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Download className="h-4 w-4 mr-1" />
                      )}
                      PDF
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
