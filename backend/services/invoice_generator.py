"""
Invoice Generator Service
Handles invoice record creation and retrieval for subscription billing
"""
import logging
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc

from models_billing import Invoice, InvoiceStatus
from schemas_billing import InvoiceResponse, InvoiceFilterParams

logger = logging.getLogger(__name__)


class InvoiceGeneratorError(Exception):
    """Base exception for invoice generator errors"""
    pass


class InvoiceNotFoundError(InvoiceGeneratorError):
    """Invoice not found"""
    pass


class InvalidInvoiceDataError(InvoiceGeneratorError):
    """Invalid invoice data provided"""
    pass


class InvoiceGenerator:
    """Handles invoice record creation and retrieval"""
    
    def __init__(self, db: Session):
        """
        Initialize InvoiceGenerator with database session.
        
        Args:
            db: SQLAlchemy database session
        """
        self.db = db
        logger.info("InvoiceGenerator initialized")
    
    async def create_invoice(
        self,
        org_id: UUID,
        stripe_invoice_id: str,
        stripe_invoice_url: Optional[str] = None,
        stripe_invoice_pdf: Optional[str] = None,
        amount_due: Decimal = Decimal("0.00"),
        amount_paid: Optional[Decimal] = None,
        currency: str = "usd",
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
        status: str = InvoiceStatus.OPEN,
        paid_at: Optional[datetime] = None
    ) -> Invoice:
        """
        Create an invoice record from Stripe invoice data.
        
        This method stores invoice records when Stripe generates invoices,
        typically called by the webhook handler on invoice.payment_succeeded
        or invoice.payment_failed events.
        
        Args:
            org_id: Organization UUID
            stripe_invoice_id: Stripe invoice ID (unique)
            stripe_invoice_url: URL to Stripe-hosted invoice page
            stripe_invoice_pdf: URL to PDF version of invoice
            amount_due: Total amount due in the invoice
            amount_paid: Amount actually paid (may differ from amount_due)
            currency: Currency code (default: "usd")
            period_start: Start of billing period
            period_end: End of billing period
            status: Invoice status (draft, open, paid, void, uncollectible)
            paid_at: Timestamp when invoice was paid
            
        Returns:
            Created Invoice entity
            
        Raises:
            InvalidInvoiceDataError: If invoice data is invalid or duplicate
        """
        try:
            # Check if invoice already exists (idempotency)
            existing = self.db.query(Invoice).filter(
                Invoice.stripe_invoice_id == stripe_invoice_id
            ).first()
            
            if existing:
                logger.info(f"Invoice {stripe_invoice_id} already exists, returning existing record")
                return existing
            
            # Validate required fields
            if not stripe_invoice_id:
                raise InvalidInvoiceDataError("stripe_invoice_id is required")
            
            if not org_id:
                raise InvalidInvoiceDataError("org_id is required")
            
            # Create invoice record
            invoice = Invoice(
                org_id=org_id,
                stripe_invoice_id=stripe_invoice_id,
                stripe_invoice_url=stripe_invoice_url,
                stripe_invoice_pdf=stripe_invoice_pdf,
                amount_due=amount_due,
                amount_paid=amount_paid,
                currency=currency,
                period_start=period_start,
                period_end=period_end,
                status=status,
                paid_at=paid_at
            )
            
            self.db.add(invoice)
            self.db.commit()
            self.db.refresh(invoice)
            
            logger.info(
                f"Created invoice {invoice.id} for org {org_id}, "
                f"Stripe invoice {stripe_invoice_id}, "
                f"amount: {amount_due} {currency}, status: {status}"
            )
            
            return invoice
            
        except InvalidInvoiceDataError:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to create invoice: {e}")
            raise InvoiceGeneratorError(f"Failed to create invoice: {str(e)}")
    
    async def update_invoice_status(
        self,
        stripe_invoice_id: str,
        status: str,
        amount_paid: Optional[Decimal] = None,
        paid_at: Optional[datetime] = None
    ) -> Invoice:
        """
        Update invoice status (typically after payment).
        
        Args:
            stripe_invoice_id: Stripe invoice ID
            status: New invoice status
            amount_paid: Amount paid (optional)
            paid_at: Payment timestamp (optional)
            
        Returns:
            Updated Invoice entity
            
        Raises:
            InvoiceNotFoundError: If invoice not found
        """
        try:
            invoice = self.db.query(Invoice).filter(
                Invoice.stripe_invoice_id == stripe_invoice_id
            ).first()
            
            if not invoice:
                raise InvoiceNotFoundError(f"Invoice {stripe_invoice_id} not found")
            
            # Update fields
            invoice.status = status
            if amount_paid is not None:
                invoice.amount_paid = amount_paid
            if paid_at is not None:
                invoice.paid_at = paid_at
            
            self.db.commit()
            self.db.refresh(invoice)
            
            logger.info(f"Updated invoice {stripe_invoice_id} to status {status}")
            
            return invoice
            
        except InvoiceNotFoundError:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to update invoice status: {e}")
            raise InvoiceGeneratorError(f"Failed to update invoice status: {str(e)}")
    
    async def get_invoice_history(
        self,
        org_id: UUID,
        status: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 20
    ) -> tuple[List[Invoice], int]:
        """
        Get invoice history with filtering and pagination.
        
        Supports filtering by:
        - Status (paid, open, void, etc.)
        - Date range (created_at)
        
        Args:
            org_id: Organization UUID
            status: Filter by invoice status (optional)
            start_date: Filter invoices created after this date (optional)
            end_date: Filter invoices created before this date (optional)
            page: Page number (1-indexed)
            page_size: Number of invoices per page
            
        Returns:
            Tuple of (list of Invoice entities, total count)
            
        Raises:
            InvoiceGeneratorError: If query fails
        """
        try:
            # Build base query
            query = self.db.query(Invoice).filter(Invoice.org_id == org_id)
            
            # Apply status filter
            if status:
                query = query.filter(Invoice.status == status)
            
            # Apply date range filters
            if start_date:
                query = query.filter(Invoice.created_at >= start_date)
            
            if end_date:
                query = query.filter(Invoice.created_at <= end_date)
            
            # Get total count
            total = query.count()
            
            # Apply ordering (most recent first)
            query = query.order_by(desc(Invoice.created_at))
            
            # Apply pagination
            offset = (page - 1) * page_size
            invoices = query.offset(offset).limit(page_size).all()
            
            logger.info(
                f"Retrieved {len(invoices)} invoices for org {org_id} "
                f"(page {page}/{(total + page_size - 1) // page_size}, total: {total})"
            )
            
            return invoices, total
            
        except Exception as e:
            logger.error(f"Failed to get invoice history: {e}")
            raise InvoiceGeneratorError(f"Failed to get invoice history: {str(e)}")
    
    async def get_invoice_details(
        self,
        org_id: UUID,
        invoice_id: int
    ) -> Invoice:
        """
        Get full invoice details by invoice ID.
        
        Args:
            org_id: Organization UUID (for authorization)
            invoice_id: Invoice ID
            
        Returns:
            Invoice entity with full details
            
        Raises:
            InvoiceNotFoundError: If invoice not found or doesn't belong to org
        """
        try:
            invoice = self.db.query(Invoice).filter(
                and_(
                    Invoice.id == invoice_id,
                    Invoice.org_id == org_id
                )
            ).first()
            
            if not invoice:
                raise InvoiceNotFoundError(
                    f"Invoice {invoice_id} not found for organization {org_id}"
                )
            
            logger.info(f"Retrieved invoice details for invoice {invoice_id}")
            
            return invoice
            
        except InvoiceNotFoundError:
            raise
        except Exception as e:
            logger.error(f"Failed to get invoice details: {e}")
            raise InvoiceGeneratorError(f"Failed to get invoice details: {str(e)}")
    
    async def get_invoice_by_stripe_id(
        self,
        stripe_invoice_id: str
    ) -> Optional[Invoice]:
        """
        Get invoice by Stripe invoice ID.
        
        Useful for webhook processing to find existing invoices.
        
        Args:
            stripe_invoice_id: Stripe invoice ID
            
        Returns:
            Invoice entity if found, None otherwise
            
        Raises:
            InvoiceGeneratorError: If query fails
        """
        try:
            invoice = self.db.query(Invoice).filter(
                Invoice.stripe_invoice_id == stripe_invoice_id
            ).first()
            
            if invoice:
                logger.info(f"Found invoice with Stripe ID {stripe_invoice_id}")
            else:
                logger.info(f"No invoice found with Stripe ID {stripe_invoice_id}")
            
            return invoice
            
        except Exception as e:
            logger.error(f"Failed to get invoice by Stripe ID: {e}")
            raise InvoiceGeneratorError(f"Failed to get invoice by Stripe ID: {str(e)}")
    
    async def get_recent_invoices(
        self,
        org_id: UUID,
        limit: int = 5
    ) -> List[Invoice]:
        """
        Get most recent invoices for an organization.
        
        Used for billing dashboard display.
        
        Args:
            org_id: Organization UUID
            limit: Maximum number of invoices to return (default: 5)
            
        Returns:
            List of Invoice entities ordered by created_at descending
            
        Raises:
            InvoiceGeneratorError: If query fails
        """
        try:
            invoices = self.db.query(Invoice).filter(
                Invoice.org_id == org_id
            ).order_by(desc(Invoice.created_at)).limit(limit).all()
            
            logger.info(f"Retrieved {len(invoices)} recent invoices for org {org_id}")
            
            return invoices
            
        except Exception as e:
            logger.error(f"Failed to get recent invoices: {e}")
            raise InvoiceGeneratorError(f"Failed to get recent invoices: {str(e)}")
    
    async def get_paid_invoices_total(
        self,
        org_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Decimal:
        """
        Calculate total amount paid for a period.
        
        Used for financial reporting and analytics.
        
        Args:
            org_id: Organization UUID
            start_date: Start of date range (optional)
            end_date: End of date range (optional)
            
        Returns:
            Total amount paid as Decimal
            
        Raises:
            InvoiceGeneratorError: If query fails
        """
        try:
            query = self.db.query(Invoice).filter(
                and_(
                    Invoice.org_id == org_id,
                    Invoice.status == InvoiceStatus.PAID
                )
            )
            
            # Apply date filters
            if start_date:
                query = query.filter(Invoice.paid_at >= start_date)
            
            if end_date:
                query = query.filter(Invoice.paid_at <= end_date)
            
            invoices = query.all()
            
            # Sum the amounts paid
            total = sum(
                (invoice.amount_paid or Decimal("0.00")) for invoice in invoices
            )
            
            logger.info(
                f"Calculated paid invoices total for org {org_id}: "
                f"{total} ({len(invoices)} invoices)"
            )
            
            return total
            
        except Exception as e:
            logger.error(f"Failed to calculate paid invoices total: {e}")
            raise InvoiceGeneratorError(f"Failed to calculate paid invoices total: {str(e)}")
    
    async def create_invoice_from_stripe_object(
        self,
        org_id: UUID,
        stripe_invoice: Dict[str, Any]
    ) -> Invoice:
        """
        Create invoice record from Stripe invoice object.
        
        Convenience method for webhook handlers to easily convert
        Stripe invoice objects to database records.
        
        Args:
            org_id: Organization UUID
            stripe_invoice: Stripe invoice object (dict)
            
        Returns:
            Created Invoice entity
            
        Raises:
            InvalidInvoiceDataError: If Stripe invoice data is invalid
        """
        try:
            # Extract data from Stripe invoice object
            stripe_invoice_id = stripe_invoice.get('id')
            if not stripe_invoice_id:
                raise InvalidInvoiceDataError("Stripe invoice missing 'id' field")
            
            # Convert amounts from cents to dollars
            amount_due = Decimal(stripe_invoice.get('amount_due', 0)) / 100
            amount_paid = Decimal(stripe_invoice.get('amount_paid', 0)) / 100 if stripe_invoice.get('amount_paid') else None
            
            # Extract timestamps
            period_start = None
            period_end = None
            if 'period_start' in stripe_invoice:
                period_start = datetime.fromtimestamp(stripe_invoice['period_start'])
            if 'period_end' in stripe_invoice:
                period_end = datetime.fromtimestamp(stripe_invoice['period_end'])
            
            paid_at = None
            if stripe_invoice.get('status_transitions', {}).get('paid_at'):
                paid_at = datetime.fromtimestamp(stripe_invoice['status_transitions']['paid_at'])
            
            # Create invoice
            invoice = await self.create_invoice(
                org_id=org_id,
                stripe_invoice_id=stripe_invoice_id,
                stripe_invoice_url=stripe_invoice.get('hosted_invoice_url'),
                stripe_invoice_pdf=stripe_invoice.get('invoice_pdf'),
                amount_due=amount_due,
                amount_paid=amount_paid,
                currency=stripe_invoice.get('currency', 'usd'),
                period_start=period_start,
                period_end=period_end,
                status=stripe_invoice.get('status', InvoiceStatus.OPEN),
                paid_at=paid_at
            )
            
            logger.info(f"Created invoice from Stripe object for org {org_id}")
            
            return invoice
            
        except InvalidInvoiceDataError:
            raise
        except Exception as e:
            logger.error(f"Failed to create invoice from Stripe object: {e}")
            raise InvoiceGeneratorError(f"Failed to create invoice from Stripe object: {str(e)}")


def get_invoice_generator(db: Session) -> InvoiceGenerator:
    """
    Factory function to create InvoiceGenerator instance.
    
    Args:
        db: SQLAlchemy database session
        
    Returns:
        InvoiceGenerator instance
    """
    return InvoiceGenerator(db)
