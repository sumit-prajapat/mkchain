"""
Unit Tests for InvoiceGenerator Service
Tests invoice creation, retrieval, filtering, and error handling
"""
import pytest
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base
from models_organization import Organization
from models_billing import Invoice, InvoiceStatus
from services.invoice_generator import (
    InvoiceGenerator,
    InvoiceGeneratorError,
    InvoiceNotFoundError,
    InvalidInvoiceDataError,
    get_invoice_generator
)

# Test database setup
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture
def db_engine():
    """Create test database engine"""
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    
    # Create only the tables we need for testing
    # (excluding webhook_events which has JSONB not supported by SQLite)
    Organization.__table__.create(bind=engine, checkfirst=True)
    Invoice.__table__.create(bind=engine, checkfirst=True)
    
    yield engine
    
    # Drop tables
    Invoice.__table__.drop(bind=engine, checkfirst=True)
    Organization.__table__.drop(bind=engine, checkfirst=True)


@pytest.fixture
def db_session(db_engine):
    """Create test database session"""
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def test_org(db_session):
    """Create test organization"""
    org = Organization(
        id=uuid4(),
        name="Test Organization",
        slug="test-organization",
        owner_id=uuid4()
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def invoice_generator(db_session):
    """Create InvoiceGenerator instance"""
    return InvoiceGenerator(db_session)


class TestInvoiceGeneratorInit:
    """Test InvoiceGenerator initialization"""
    
    def test_init_with_session(self, db_session):
        """Test initialization with valid session"""
        generator = InvoiceGenerator(db_session)
        assert generator.db == db_session
    
    def test_factory_function(self, db_session):
        """Test factory function"""
        generator = get_invoice_generator(db_session)
        assert isinstance(generator, InvoiceGenerator)
        assert generator.db == db_session


class TestCreateInvoice:
    """Test invoice creation"""
    
    @pytest.mark.asyncio
    async def test_create_basic_invoice(self, invoice_generator, test_org):
        """Test creating a basic invoice"""
        stripe_invoice_id = "in_test123"
        amount_due = Decimal("49.00")
        
        invoice = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id=stripe_invoice_id,
            amount_due=amount_due,
            status=InvoiceStatus.PAID
        )
        
        assert invoice.id is not None
        assert invoice.org_id == test_org.id
        assert invoice.stripe_invoice_id == stripe_invoice_id
        assert invoice.amount_due == amount_due
        assert invoice.status == InvoiceStatus.PAID
        assert invoice.currency == "usd"
    
    @pytest.mark.asyncio
    async def test_create_invoice_with_all_fields(self, invoice_generator, test_org):
        """Test creating invoice with all optional fields"""
        now = datetime.utcnow()
        period_start = now - timedelta(days=30)
        period_end = now
        
        invoice = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_complete123",
            stripe_invoice_url="https://invoice.stripe.com/test",
            stripe_invoice_pdf="https://invoice.stripe.com/test.pdf",
            amount_due=Decimal("299.00"),
            amount_paid=Decimal("299.00"),
            currency="usd",
            period_start=period_start,
            period_end=period_end,
            status=InvoiceStatus.PAID,
            paid_at=now
        )
        
        assert invoice.stripe_invoice_url == "https://invoice.stripe.com/test"
        assert invoice.stripe_invoice_pdf == "https://invoice.stripe.com/test.pdf"
        assert invoice.amount_paid == Decimal("299.00")
        assert invoice.period_start == period_start
        assert invoice.period_end == period_end
        assert invoice.paid_at == now
    
    @pytest.mark.asyncio
    async def test_create_invoice_idempotency(self, invoice_generator, test_org):
        """Test that creating duplicate invoice returns existing record"""
        stripe_invoice_id = "in_duplicate123"
        
        # Create first invoice
        invoice1 = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id=stripe_invoice_id,
            amount_due=Decimal("49.00")
        )
        
        # Attempt to create duplicate
        invoice2 = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id=stripe_invoice_id,
            amount_due=Decimal("99.00")  # Different amount
        )
        
        # Should return the same invoice
        assert invoice1.id == invoice2.id
        assert invoice1.amount_due == invoice2.amount_due  # Original amount preserved
    
    @pytest.mark.asyncio
    async def test_create_invoice_missing_stripe_id(self, invoice_generator, test_org):
        """Test that missing stripe_invoice_id raises error"""
        with pytest.raises(InvalidInvoiceDataError, match="stripe_invoice_id is required"):
            await invoice_generator.create_invoice(
                org_id=test_org.id,
                stripe_invoice_id="",
                amount_due=Decimal("49.00")
            )
    
    @pytest.mark.asyncio
    async def test_create_invoice_missing_org_id(self, invoice_generator):
        """Test that missing org_id raises error"""
        with pytest.raises(InvalidInvoiceDataError, match="org_id is required"):
            await invoice_generator.create_invoice(
                org_id=None,
                stripe_invoice_id="in_test123",
                amount_due=Decimal("49.00")
            )


class TestUpdateInvoiceStatus:
    """Test invoice status updates"""
    
    @pytest.mark.asyncio
    async def test_update_status(self, invoice_generator, test_org):
        """Test updating invoice status"""
        # Create invoice
        invoice = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_update123",
            amount_due=Decimal("49.00"),
            status=InvoiceStatus.OPEN
        )
        
        # Update status
        paid_at = datetime.utcnow()
        updated = await invoice_generator.update_invoice_status(
            stripe_invoice_id="in_update123",
            status=InvoiceStatus.PAID,
            amount_paid=Decimal("49.00"),
            paid_at=paid_at
        )
        
        assert updated.id == invoice.id
        assert updated.status == InvoiceStatus.PAID
        assert updated.amount_paid == Decimal("49.00")
        assert updated.paid_at == paid_at
    
    @pytest.mark.asyncio
    async def test_update_status_not_found(self, invoice_generator):
        """Test updating non-existent invoice raises error"""
        with pytest.raises(InvoiceNotFoundError, match="not found"):
            await invoice_generator.update_invoice_status(
                stripe_invoice_id="in_nonexistent",
                status=InvoiceStatus.PAID
            )


class TestGetInvoiceHistory:
    """Test invoice history retrieval with filtering"""
    
    @pytest.mark.asyncio
    async def test_get_all_invoices(self, invoice_generator, test_org):
        """Test retrieving all invoices for organization"""
        # Create multiple invoices
        for i in range(5):
            await invoice_generator.create_invoice(
                org_id=test_org.id,
                stripe_invoice_id=f"in_test{i}",
                amount_due=Decimal("49.00"),
                status=InvoiceStatus.PAID
            )
        
        invoices, total = await invoice_generator.get_invoice_history(
            org_id=test_org.id
        )
        
        assert len(invoices) == 5
        assert total == 5
    
    @pytest.mark.asyncio
    async def test_filter_by_status(self, invoice_generator, test_org):
        """Test filtering invoices by status"""
        # Create invoices with different statuses
        await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_paid1",
            amount_due=Decimal("49.00"),
            status=InvoiceStatus.PAID
        )
        await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_paid2",
            amount_due=Decimal("49.00"),
            status=InvoiceStatus.PAID
        )
        await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_open1",
            amount_due=Decimal("49.00"),
            status=InvoiceStatus.OPEN
        )
        
        # Filter for paid invoices only
        paid_invoices, total = await invoice_generator.get_invoice_history(
            org_id=test_org.id,
            status=InvoiceStatus.PAID
        )
        
        assert len(paid_invoices) == 2
        assert total == 2
        assert all(inv.status == InvoiceStatus.PAID for inv in paid_invoices)
    
    @pytest.mark.asyncio
    async def test_filter_by_date_range(self, invoice_generator, test_org, db_session):
        """Test filtering invoices by date range"""
        now = datetime.utcnow()
        
        # Create invoices at different times
        old_invoice = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_old",
            amount_due=Decimal("49.00")
        )
        # Manually set created_at to past
        old_invoice.created_at = now - timedelta(days=60)
        db_session.commit()
        
        recent_invoice = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_recent",
            amount_due=Decimal("49.00")
        )
        
        # Filter for last 30 days
        start_date = now - timedelta(days=30)
        invoices, total = await invoice_generator.get_invoice_history(
            org_id=test_org.id,
            start_date=start_date
        )
        
        assert len(invoices) == 1
        assert invoices[0].stripe_invoice_id == "in_recent"
    
    @pytest.mark.asyncio
    async def test_pagination(self, invoice_generator, test_org):
        """Test invoice pagination"""
        # Create 25 invoices
        for i in range(25):
            await invoice_generator.create_invoice(
                org_id=test_org.id,
                stripe_invoice_id=f"in_page{i}",
                amount_due=Decimal("49.00")
            )
        
        # Get first page (20 items)
        page1, total = await invoice_generator.get_invoice_history(
            org_id=test_org.id,
            page=1,
            page_size=20
        )
        
        assert len(page1) == 20
        assert total == 25
        
        # Get second page (5 items)
        page2, total = await invoice_generator.get_invoice_history(
            org_id=test_org.id,
            page=2,
            page_size=20
        )
        
        assert len(page2) == 5
        assert total == 25
    
    @pytest.mark.asyncio
    async def test_ordering(self, invoice_generator, test_org, db_session):
        """Test that invoices are ordered by created_at descending"""
        now = datetime.utcnow()
        
        # Create invoices in specific order
        for i in range(3):
            invoice = await invoice_generator.create_invoice(
                org_id=test_org.id,
                stripe_invoice_id=f"in_order{i}",
                amount_due=Decimal("49.00")
            )
            # Set created_at explicitly
            invoice.created_at = now - timedelta(days=i)
            db_session.commit()
        
        invoices, _ = await invoice_generator.get_invoice_history(
            org_id=test_org.id
        )
        
        # Should be ordered from newest to oldest
        assert invoices[0].stripe_invoice_id == "in_order0"
        assert invoices[1].stripe_invoice_id == "in_order1"
        assert invoices[2].stripe_invoice_id == "in_order2"


class TestGetInvoiceDetails:
    """Test individual invoice retrieval"""
    
    @pytest.mark.asyncio
    async def test_get_existing_invoice(self, invoice_generator, test_org):
        """Test retrieving existing invoice by ID"""
        # Create invoice
        invoice = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_details123",
            amount_due=Decimal("49.00")
        )
        
        # Retrieve by ID
        retrieved = await invoice_generator.get_invoice_details(
            org_id=test_org.id,
            invoice_id=invoice.id
        )
        
        assert retrieved.id == invoice.id
        assert retrieved.stripe_invoice_id == invoice.stripe_invoice_id
    
    @pytest.mark.asyncio
    async def test_get_invoice_wrong_org(self, invoice_generator, test_org):
        """Test that retrieving invoice with wrong org_id fails"""
        # Create invoice
        invoice = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_wrong_org",
            amount_due=Decimal("49.00")
        )
        
        # Try to retrieve with different org_id
        wrong_org_id = uuid4()
        with pytest.raises(InvoiceNotFoundError):
            await invoice_generator.get_invoice_details(
                org_id=wrong_org_id,
                invoice_id=invoice.id
            )
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_invoice(self, invoice_generator, test_org):
        """Test retrieving non-existent invoice raises error"""
        with pytest.raises(InvoiceNotFoundError):
            await invoice_generator.get_invoice_details(
                org_id=test_org.id,
                invoice_id=99999
            )


class TestGetInvoiceByStripeId:
    """Test invoice retrieval by Stripe ID"""
    
    @pytest.mark.asyncio
    async def test_get_by_stripe_id(self, invoice_generator, test_org):
        """Test retrieving invoice by Stripe ID"""
        stripe_id = "in_stripe_lookup"
        
        # Create invoice
        invoice = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id=stripe_id,
            amount_due=Decimal("49.00")
        )
        
        # Retrieve by Stripe ID
        retrieved = await invoice_generator.get_invoice_by_stripe_id(stripe_id)
        
        assert retrieved is not None
        assert retrieved.id == invoice.id
        assert retrieved.stripe_invoice_id == stripe_id
    
    @pytest.mark.asyncio
    async def test_get_by_nonexistent_stripe_id(self, invoice_generator):
        """Test retrieving non-existent Stripe ID returns None"""
        result = await invoice_generator.get_invoice_by_stripe_id("in_nonexistent")
        assert result is None


class TestGetRecentInvoices:
    """Test recent invoices retrieval"""
    
    @pytest.mark.asyncio
    async def test_get_recent_invoices(self, invoice_generator, test_org):
        """Test retrieving recent invoices with limit"""
        # Create 10 invoices
        for i in range(10):
            await invoice_generator.create_invoice(
                org_id=test_org.id,
                stripe_invoice_id=f"in_recent{i}",
                amount_due=Decimal("49.00")
            )
        
        # Get 5 most recent
        recent = await invoice_generator.get_recent_invoices(
            org_id=test_org.id,
            limit=5
        )
        
        assert len(recent) == 5
    
    @pytest.mark.asyncio
    async def test_get_recent_when_fewer_exist(self, invoice_generator, test_org):
        """Test getting recent invoices when fewer than limit exist"""
        # Create only 3 invoices
        for i in range(3):
            await invoice_generator.create_invoice(
                org_id=test_org.id,
                stripe_invoice_id=f"in_few{i}",
                amount_due=Decimal("49.00")
            )
        
        # Request 5
        recent = await invoice_generator.get_recent_invoices(
            org_id=test_org.id,
            limit=5
        )
        
        assert len(recent) == 3


class TestGetPaidInvoicesTotal:
    """Test calculating total paid amounts"""
    
    @pytest.mark.asyncio
    async def test_calculate_total_paid(self, invoice_generator, test_org):
        """Test calculating total amount paid"""
        # Create paid invoices
        await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_total1",
            amount_due=Decimal("49.00"),
            amount_paid=Decimal("49.00"),
            status=InvoiceStatus.PAID
        )
        await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_total2",
            amount_due=Decimal("299.00"),
            amount_paid=Decimal("299.00"),
            status=InvoiceStatus.PAID
        )
        
        total = await invoice_generator.get_paid_invoices_total(org_id=test_org.id)
        
        assert total == Decimal("348.00")
    
    @pytest.mark.asyncio
    async def test_exclude_unpaid_invoices(self, invoice_generator, test_org):
        """Test that unpaid invoices are not included in total"""
        # Create mix of paid and unpaid
        await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_paid",
            amount_due=Decimal("49.00"),
            amount_paid=Decimal("49.00"),
            status=InvoiceStatus.PAID
        )
        await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_open",
            amount_due=Decimal("299.00"),
            status=InvoiceStatus.OPEN
        )
        
        total = await invoice_generator.get_paid_invoices_total(org_id=test_org.id)
        
        # Only the paid invoice should count
        assert total == Decimal("49.00")
    
    @pytest.mark.asyncio
    async def test_total_with_date_range(self, invoice_generator, test_org, db_session):
        """Test calculating total within date range"""
        now = datetime.utcnow()
        
        # Create old paid invoice
        old_invoice = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_old_paid",
            amount_due=Decimal("100.00"),
            amount_paid=Decimal("100.00"),
            status=InvoiceStatus.PAID,
            paid_at=now - timedelta(days=60)
        )
        
        # Create recent paid invoice
        recent_invoice = await invoice_generator.create_invoice(
            org_id=test_org.id,
            stripe_invoice_id="in_recent_paid",
            amount_due=Decimal("50.00"),
            amount_paid=Decimal("50.00"),
            status=InvoiceStatus.PAID,
            paid_at=now
        )
        
        # Calculate total for last 30 days
        start_date = now - timedelta(days=30)
        total = await invoice_generator.get_paid_invoices_total(
            org_id=test_org.id,
            start_date=start_date
        )
        
        # Only recent invoice should count
        assert total == Decimal("50.00")


class TestCreateInvoiceFromStripeObject:
    """Test creating invoice from Stripe object"""
    
    @pytest.mark.asyncio
    async def test_create_from_stripe_object(self, invoice_generator, test_org):
        """Test creating invoice from Stripe invoice object"""
        now = datetime.utcnow()
        period_start = now - timedelta(days=30)
        
        stripe_invoice = {
            'id': 'in_stripe_obj123',
            'amount_due': 4900,  # Cents
            'amount_paid': 4900,
            'currency': 'usd',
            'period_start': int(period_start.timestamp()),
            'period_end': int(now.timestamp()),
            'status': 'paid',
            'hosted_invoice_url': 'https://invoice.stripe.com/test',
            'invoice_pdf': 'https://invoice.stripe.com/test.pdf',
            'status_transitions': {
                'paid_at': int(now.timestamp())
            }
        }
        
        invoice = await invoice_generator.create_invoice_from_stripe_object(
            org_id=test_org.id,
            stripe_invoice=stripe_invoice
        )
        
        assert invoice.stripe_invoice_id == 'in_stripe_obj123'
        assert invoice.amount_due == Decimal("49.00")  # Converted from cents
        assert invoice.amount_paid == Decimal("49.00")
        assert invoice.status == 'paid'
        assert invoice.stripe_invoice_url == 'https://invoice.stripe.com/test'
        assert invoice.stripe_invoice_pdf == 'https://invoice.stripe.com/test.pdf'
    
    @pytest.mark.asyncio
    async def test_create_from_stripe_object_missing_id(self, invoice_generator, test_org):
        """Test that missing ID in Stripe object raises error"""
        stripe_invoice = {
            'amount_due': 4900,
            'status': 'paid'
        }
        
        with pytest.raises(InvalidInvoiceDataError, match="missing 'id' field"):
            await invoice_generator.create_invoice_from_stripe_object(
                org_id=test_org.id,
                stripe_invoice=stripe_invoice
            )
    
    @pytest.mark.asyncio
    async def test_create_from_stripe_object_minimal(self, invoice_generator, test_org):
        """Test creating invoice from minimal Stripe object"""
        stripe_invoice = {
            'id': 'in_minimal',
            'amount_due': 0,
            'status': 'draft'
        }
        
        invoice = await invoice_generator.create_invoice_from_stripe_object(
            org_id=test_org.id,
            stripe_invoice=stripe_invoice
        )
        
        assert invoice.stripe_invoice_id == 'in_minimal'
        assert invoice.amount_due == Decimal("0.00")
        assert invoice.status == 'draft'
        assert invoice.currency == 'usd'  # Default


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
