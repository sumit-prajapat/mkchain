"""
Tests for Invoice API Routes
Tests the three invoice management endpoints:
- GET /api/billing/invoices (list with filtering)
- GET /api/billing/invoices/{id} (details)
- GET /api/billing/invoices/{id}/pdf (PDF redirect)
"""
import pytest
from unittest.mock import Mock, patch, AsyncMock
from uuid import uuid4
from datetime import datetime
from decimal import Decimal

# Mock the database and services before importing main
import sys
sys.path.insert(0, 'backend')

@pytest.fixture
def mock_db():
    """Mock database session"""
    return Mock()

@pytest.fixture
def mock_request():
    """Mock FastAPI request with org context"""
    request = Mock()
    request.state.org_id = uuid4()
    return request

@pytest.fixture
def sample_org_id():
    """Sample organization UUID"""
    return uuid4()

@pytest.fixture
def sample_invoice_id():
    """Sample invoice ID"""
    return 1

@pytest.fixture
def sample_invoice(sample_org_id):
    """Sample invoice object"""
    from models_billing import Invoice, InvoiceStatus
    
    invoice = Mock(spec=Invoice)
    invoice.id = 1
    invoice.org_id = sample_org_id
    invoice.stripe_invoice_id = "in_1234567890"
    invoice.stripe_invoice_url = "https://invoice.stripe.com/i/1234567890"
    invoice.stripe_invoice_pdf = "https://invoice.stripe.com/i/1234567890/pdf"
    invoice.amount_due = Decimal("49.00")
    invoice.amount_paid = Decimal("49.00")
    invoice.currency = "usd"
    invoice.period_start = datetime(2024, 1, 1)
    invoice.period_end = datetime(2024, 2, 1)
    invoice.status = InvoiceStatus.PAID
    invoice.paid_at = datetime(2024, 1, 5)
    invoice.created_at = datetime(2024, 1, 1)
    
    return invoice


# ============================================================================
# Test GET /api/billing/invoices (List)
# ============================================================================

@pytest.mark.asyncio
async def test_list_invoices_success(mock_request, mock_db, sample_org_id, sample_invoice):
    """
    Test listing invoices successfully with pagination
    Requirements: 9.3, 9.4
    """
    from routes.billing import list_invoices
    
    # Setup
    mock_request.state.org_id = sample_org_id
    
    # Mock invoice generator
    with patch('routes.billing.get_invoice_generator') as mock_get_generator:
        mock_generator = AsyncMock()
        mock_generator.get_invoice_history.return_value = ([sample_invoice], 1)
        mock_get_generator.return_value = mock_generator
        
        with patch('routes.billing.get_current_user_id', return_value="user123"):
            with patch('routes.billing.require_role', return_value=AsyncMock()):
                # Execute
                result = await list_invoices(
                    request=mock_request,
                    invoice_status=None,
                    start_date=None,
                    end_date=None,
                    page=1,
                    page_size=20,
                    db=mock_db
                )
                
                # Verify
                assert result.total == 1
                assert len(result.invoices) == 1
                assert result.page == 1
                assert result.page_size == 20
                assert result.has_more == False
                
                # Verify invoice generator was called with correct parameters
                mock_generator.get_invoice_history.assert_called_once_with(
                    org_id=sample_org_id,
                    status=None,
                    start_date=None,
                    end_date=None,
                    page=1,
                    page_size=20
                )


@pytest.mark.asyncio
async def test_list_invoices_with_status_filter(mock_request, mock_db, sample_org_id, sample_invoice):
    """
    Test listing invoices filtered by status
    Requirements: 9.4
    """
    from routes.billing import list_invoices
    
    # Setup
    mock_request.state.org_id = sample_org_id
    
    # Mock invoice generator
    with patch('routes.billing.get_invoice_generator') as mock_get_generator:
        mock_generator = AsyncMock()
        mock_generator.get_invoice_history.return_value = ([sample_invoice], 1)
        mock_get_generator.return_value = mock_generator
        
        with patch('routes.billing.get_current_user_id', return_value="user123"):
            with patch('routes.billing.require_role', return_value=AsyncMock()):
                # Execute
                result = await list_invoices(
                    request=mock_request,
                    invoice_status="paid",
                    start_date=None,
                    end_date=None,
                    page=1,
                    page_size=20,
                    db=mock_db
                )
                
                # Verify status filter was passed
                mock_generator.get_invoice_history.assert_called_once()
                call_kwargs = mock_generator.get_invoice_history.call_args[1]
                assert call_kwargs['status'] == "paid"


@pytest.mark.asyncio
async def test_list_invoices_with_date_range(mock_request, mock_db, sample_org_id, sample_invoice):
    """
    Test listing invoices filtered by date range
    Requirements: 9.4
    """
    from routes.billing import list_invoices
    
    # Setup
    mock_request.state.org_id = sample_org_id
    start_date = datetime(2024, 1, 1)
    end_date = datetime(2024, 12, 31)
    
    # Mock invoice generator
    with patch('routes.billing.get_invoice_generator') as mock_get_generator:
        mock_generator = AsyncMock()
        mock_generator.get_invoice_history.return_value = ([sample_invoice], 1)
        mock_get_generator.return_value = mock_generator
        
        with patch('routes.billing.get_current_user_id', return_value="user123"):
            with patch('routes.billing.require_role', return_value=AsyncMock()):
                # Execute
                result = await list_invoices(
                    request=mock_request,
                    invoice_status=None,
                    start_date=start_date,
                    end_date=end_date,
                    page=1,
                    page_size=20,
                    db=mock_db
                )
                
                # Verify date filters were passed
                mock_generator.get_invoice_history.assert_called_once()
                call_kwargs = mock_generator.get_invoice_history.call_args[1]
                assert call_kwargs['start_date'] == start_date
                assert call_kwargs['end_date'] == end_date


@pytest.mark.asyncio
async def test_list_invoices_pagination(mock_request, mock_db, sample_org_id, sample_invoice):
    """
    Test invoice list pagination with has_more flag
    Requirements: 9.3
    """
    from routes.billing import list_invoices
    
    # Setup - simulate 50 total invoices with page_size=20
    mock_request.state.org_id = sample_org_id
    
    # Mock invoice generator
    with patch('routes.billing.get_invoice_generator') as mock_get_generator:
        mock_generator = AsyncMock()
        # Return 20 invoices with total of 50
        mock_generator.get_invoice_history.return_value = ([sample_invoice] * 20, 50)
        mock_get_generator.return_value = mock_generator
        
        with patch('routes.billing.get_current_user_id', return_value="user123"):
            with patch('routes.billing.require_role', return_value=AsyncMock()):
                # Execute
                result = await list_invoices(
                    request=mock_request,
                    invoice_status=None,
                    start_date=None,
                    end_date=None,
                    page=1,
                    page_size=20,
                    db=mock_db
                )
                
                # Verify pagination
                assert result.total == 50
                assert len(result.invoices) == 20
                assert result.page == 1
                assert result.has_more == True  # More pages available


@pytest.mark.asyncio
async def test_list_invoices_no_org_context(mock_request, mock_db):
    """
    Test listing invoices without organization context should fail
    """
    from routes.billing import list_invoices
    from fastapi import HTTPException
    
    # Setup - no org_id in request.state
    mock_request.state.org_id = None
    
    with patch('routes.billing.get_current_user_id', return_value="user123"):
        with patch('routes.billing.require_role', return_value=AsyncMock()):
            # Execute and verify exception
            with pytest.raises(HTTPException) as exc_info:
                await list_invoices(
                    request=mock_request,
                    invoice_status=None,
                    start_date=None,
                    end_date=None,
                    page=1,
                    page_size=20,
                    db=mock_db
                )
            
            assert exc_info.value.status_code == 400
            assert "Organization context not found" in str(exc_info.value.detail)


# ============================================================================
# Test GET /api/billing/invoices/{id} (Details)
# ============================================================================

@pytest.mark.asyncio
async def test_get_invoice_details_success(mock_request, mock_db, sample_org_id, sample_invoice_id, sample_invoice):
    """
    Test getting invoice details successfully
    Requirements: 9.5
    """
    from routes.billing import get_invoice_details
    
    # Setup
    mock_request.state.org_id = sample_org_id
    
    # Mock invoice generator
    with patch('routes.billing.get_invoice_generator') as mock_get_generator:
        mock_generator = AsyncMock()
        mock_generator.get_invoice_details.return_value = sample_invoice
        mock_get_generator.return_value = mock_generator
        
        with patch('routes.billing.get_current_user_id', return_value="user123"):
            with patch('routes.billing.require_role', return_value=AsyncMock()):
                # Execute
                result = await get_invoice_details(
                    invoice_id=sample_invoice_id,
                    request=mock_request,
                    db=mock_db
                )
                
                # Verify
                assert result.id == sample_invoice.id
                assert result.stripe_invoice_id == sample_invoice.stripe_invoice_id
                assert result.amount_due == sample_invoice.amount_due
                assert result.status == sample_invoice.status
                
                # Verify invoice generator was called correctly
                mock_generator.get_invoice_details.assert_called_once_with(
                    org_id=sample_org_id,
                    invoice_id=sample_invoice_id
                )


@pytest.mark.asyncio
async def test_get_invoice_details_not_found(mock_request, mock_db, sample_org_id, sample_invoice_id):
    """
    Test getting invoice details for non-existent invoice
    """
    from routes.billing import get_invoice_details
    from services.invoice_generator import InvoiceNotFoundError
    from fastapi import HTTPException
    
    # Setup
    mock_request.state.org_id = sample_org_id
    
    # Mock invoice generator to raise not found error
    with patch('routes.billing.get_invoice_generator') as mock_get_generator:
        mock_generator = AsyncMock()
        mock_generator.get_invoice_details.side_effect = InvoiceNotFoundError("Invoice not found")
        mock_get_generator.return_value = mock_generator
        
        with patch('routes.billing.get_current_user_id', return_value="user123"):
            with patch('routes.billing.require_role', return_value=AsyncMock()):
                # Execute and verify exception
                with pytest.raises(HTTPException) as exc_info:
                    await get_invoice_details(
                        invoice_id=sample_invoice_id,
                        request=mock_request,
                        db=mock_db
                    )
                
                assert exc_info.value.status_code == 404
                assert "not found" in str(exc_info.value.detail).lower()


@pytest.mark.asyncio
async def test_get_invoice_details_no_org_context(mock_request, mock_db, sample_invoice_id):
    """
    Test getting invoice details without organization context should fail
    """
    from routes.billing import get_invoice_details
    from fastapi import HTTPException
    
    # Setup - no org_id in request.state
    mock_request.state.org_id = None
    
    with patch('routes.billing.get_current_user_id', return_value="user123"):
        with patch('routes.billing.require_role', return_value=AsyncMock()):
            # Execute and verify exception
            with pytest.raises(HTTPException) as exc_info:
                await get_invoice_details(
                    invoice_id=sample_invoice_id,
                    request=mock_request,
                    db=mock_db
                )
            
            assert exc_info.value.status_code == 400
            assert "Organization context not found" in str(exc_info.value.detail)


# ============================================================================
# Test GET /api/billing/invoices/{id}/pdf (PDF Redirect)
# ============================================================================

@pytest.mark.asyncio
async def test_get_invoice_pdf_success(mock_request, mock_db, sample_org_id, sample_invoice_id, sample_invoice):
    """
    Test getting invoice PDF URL and redirecting
    Requirements: 9.6
    """
    from routes.billing import get_invoice_pdf
    from fastapi.responses import RedirectResponse
    
    # Setup
    mock_request.state.org_id = sample_org_id
    
    # Mock invoice generator
    with patch('routes.billing.get_invoice_generator') as mock_get_generator:
        mock_generator = AsyncMock()
        mock_generator.get_invoice_details.return_value = sample_invoice
        mock_get_generator.return_value = mock_generator
        
        with patch('routes.billing.get_current_user_id', return_value="user123"):
            with patch('routes.billing.require_role', return_value=AsyncMock()):
                # Execute
                result = await get_invoice_pdf(
                    invoice_id=sample_invoice_id,
                    request=mock_request,
                    db=mock_db
                )
                
                # Verify redirect response
                assert isinstance(result, RedirectResponse)
                assert result.headers['location'] == sample_invoice.stripe_invoice_pdf


@pytest.mark.asyncio
async def test_get_invoice_pdf_fallback_to_hosted_url(mock_request, mock_db, sample_org_id, sample_invoice_id, sample_invoice):
    """
    Test PDF fallback to hosted invoice URL when PDF not available
    Requirements: 9.6
    """
    from routes.billing import get_invoice_pdf
    from fastapi.responses import RedirectResponse
    
    # Setup - invoice without PDF URL
    mock_request.state.org_id = sample_org_id
    sample_invoice.stripe_invoice_pdf = None  # No PDF URL
    
    # Mock invoice generator
    with patch('routes.billing.get_invoice_generator') as mock_get_generator:
        mock_generator = AsyncMock()
        mock_generator.get_invoice_details.return_value = sample_invoice
        mock_get_generator.return_value = mock_generator
        
        with patch('routes.billing.get_current_user_id', return_value="user123"):
            with patch('routes.billing.require_role', return_value=AsyncMock()):
                # Execute
                result = await get_invoice_pdf(
                    invoice_id=sample_invoice_id,
                    request=mock_request,
                    db=mock_db
                )
                
                # Verify redirect to hosted URL instead
                assert isinstance(result, RedirectResponse)
                assert result.headers['location'] == sample_invoice.stripe_invoice_url


@pytest.mark.asyncio
async def test_get_invoice_pdf_no_urls_available(mock_request, mock_db, sample_org_id, sample_invoice_id, sample_invoice):
    """
    Test PDF endpoint when neither PDF nor hosted URL available
    Should return 404
    """
    from routes.billing import get_invoice_pdf
    from fastapi import HTTPException
    
    # Setup - invoice without any URLs
    mock_request.state.org_id = sample_org_id
    sample_invoice.stripe_invoice_pdf = None
    sample_invoice.stripe_invoice_url = None
    
    # Mock invoice generator
    with patch('routes.billing.get_invoice_generator') as mock_get_generator:
        mock_generator = AsyncMock()
        mock_generator.get_invoice_details.return_value = sample_invoice
        mock_get_generator.return_value = mock_generator
        
        with patch('routes.billing.get_current_user_id', return_value="user123"):
            with patch('routes.billing.require_role', return_value=AsyncMock()):
                # Execute and verify exception
                with pytest.raises(HTTPException) as exc_info:
                    await get_invoice_pdf(
                        invoice_id=sample_invoice_id,
                        request=mock_request,
                        db=mock_db
                    )
                
                assert exc_info.value.status_code == 404
                assert "not available" in str(exc_info.value.detail).lower()


@pytest.mark.asyncio
async def test_get_invoice_pdf_not_found(mock_request, mock_db, sample_org_id, sample_invoice_id):
    """
    Test getting PDF for non-existent invoice
    """
    from routes.billing import get_invoice_pdf
    from services.invoice_generator import InvoiceNotFoundError
    from fastapi import HTTPException
    
    # Setup
    mock_request.state.org_id = sample_org_id
    
    # Mock invoice generator to raise not found error
    with patch('routes.billing.get_invoice_generator') as mock_get_generator:
        mock_generator = AsyncMock()
        mock_generator.get_invoice_details.side_effect = InvoiceNotFoundError("Invoice not found")
        mock_get_generator.return_value = mock_generator
        
        with patch('routes.billing.get_current_user_id', return_value="user123"):
            with patch('routes.billing.require_role', return_value=AsyncMock()):
                # Execute and verify exception
                with pytest.raises(HTTPException) as exc_info:
                    await get_invoice_pdf(
                        invoice_id=sample_invoice_id,
                        request=mock_request,
                        db=mock_db
                    )
                
                assert exc_info.value.status_code == 404


# ============================================================================
# Run Tests
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
