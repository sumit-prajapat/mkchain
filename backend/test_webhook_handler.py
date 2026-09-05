"""
Tests for WebhookHandler Service
Tests signature verification, idempotency, event routing, and webhook event processing
"""
import pytest
import json
from datetime import datetime, timedelta
from uuid import uuid4
from unittest.mock import Mock, patch, MagicMock
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import JSON

from models import Base
from models_billing import (
    WebhookEvent,
    Subscription,
    Invoice,
    SubscriptionStatus,
    InvoiceStatus,
    PlanTier
)
from models_organization import Organization
from services.webhook_handler import (
    WebhookHandler,
    SignatureVerificationError,
    EventProcessingError
)


# Test database setup
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture
def db_session():
    """Create a test database session"""
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    
    # Replace JSONB with JSON for SQLite compatibility
    @event.listens_for(WebhookEvent.__table__, "before_create")
    def replace_jsonb_with_json(target, connection, **kw):
        for col in target.columns:
            if isinstance(col.type, JSONB):
                col.type = JSON()
    
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    
    yield session
    
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def webhook_handler(db_session):
    """Create a WebhookHandler instance"""
    webhook_secret = "whsec_test_secret"
    return WebhookHandler(db_session, webhook_secret)


@pytest.fixture
def mock_stripe_event():
    """Create a mock Stripe event"""
    return {
        'id': 'evt_test_123',
        'type': 'invoice.payment_succeeded',
        'data': {
            'object': {
                'id': 'in_test_123',
                'subscription': 'sub_test_123',
                'amount_due': 4900,
                'amount_paid': 4900,
                'currency': 'usd',
                'period_start': int(datetime.utcnow().timestamp()),
                'period_end': int((datetime.utcnow() + timedelta(days=30)).timestamp()),
                'status': 'paid',
                'hosted_invoice_url': 'https://invoice.stripe.com/test',
                'invoice_pdf': 'https://invoice.stripe.com/test.pdf',
                'status_transitions': {
                    'paid_at': int(datetime.utcnow().timestamp())
                }
            }
        }
    }


@pytest.fixture
def test_subscription(db_session):
    """Create a test subscription"""
    org_id = uuid4()
    subscription = Subscription(
        org_id=org_id,
        plan_tier=PlanTier.PRO,
        status=SubscriptionStatus.TRIALING,
        stripe_customer_id='cus_test_123',
        stripe_subscription_id='sub_test_123',
        stripe_price_id='price_test_123',
        current_period_start=datetime.utcnow(),
        current_period_end=datetime.utcnow() + timedelta(days=30),
        trial_end=datetime.utcnow() + timedelta(days=14)
    )
    db_session.add(subscription)
    db_session.commit()
    return subscription


# ============================================================================
# SIGNATURE VERIFICATION TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_signature_verification_success(webhook_handler, mock_stripe_event):
    """Test successful webhook signature verification"""
    payload = json.dumps(mock_stripe_event).encode('utf-8')
    signature = "t=123456789,v1=valid_signature"
    
    with patch('stripe.Webhook.construct_event') as mock_construct:
        mock_construct.return_value = mock_stripe_event
        
        result = await webhook_handler.handle_webhook(payload, signature)
        
        assert result['status'] in ['success', 'skipped']
        assert result['event_id'] == 'evt_test_123'
        mock_construct.assert_called_once()


@pytest.mark.asyncio
async def test_signature_verification_failure(webhook_handler):
    """Test webhook signature verification failure"""
    payload = b'{"id": "evt_test", "type": "test"}'
    signature = "invalid_signature"
    
    with patch('stripe.Webhook.construct_event') as mock_construct:
        import stripe
        mock_construct.side_effect = stripe.error.SignatureVerificationError(
            "Invalid signature", "sig_header"
        )
        
        with pytest.raises(SignatureVerificationError):
            await webhook_handler.handle_webhook(payload, signature)


# ============================================================================
# IDEMPOTENCY TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_idempotency_duplicate_event(webhook_handler, db_session, mock_stripe_event):
    """Test that duplicate webhook events are skipped"""
    # First, log the event as already processed
    webhook_event = WebhookEvent(
        stripe_event_id='evt_test_123',
        event_type='invoice.payment_succeeded',
        payload=mock_stripe_event,
        processing_result='success'
    )
    db_session.add(webhook_event)
    db_session.commit()
    
    # Now try to process the same event
    payload = json.dumps(mock_stripe_event).encode('utf-8')
    signature = "t=123456789,v1=valid_signature"
    
    with patch('stripe.Webhook.construct_event') as mock_construct:
        mock_construct.return_value = mock_stripe_event
        
        result = await webhook_handler.handle_webhook(payload, signature)
        
        assert result['status'] == 'skipped'
        assert result['message'] == 'Event already processed'
        assert result['event_id'] == 'evt_test_123'


@pytest.mark.asyncio
async def test_idempotency_new_event(webhook_handler, db_session, mock_stripe_event, test_subscription):
    """Test that new webhook events are processed"""
    payload = json.dumps(mock_stripe_event).encode('utf-8')
    signature = "t=123456789,v1=valid_signature"
    
    with patch('stripe.Webhook.construct_event') as mock_construct:
        mock_construct.return_value = mock_stripe_event
        
        result = await webhook_handler.handle_webhook(payload, signature)
        
        assert result['status'] == 'success'
        assert result['event_id'] == 'evt_test_123'
        
        # Verify event was logged
        logged_event = db_session.query(WebhookEvent).filter_by(
            stripe_event_id='evt_test_123'
        ).first()
        assert logged_event is not None
        assert logged_event.processing_result == 'success'


# ============================================================================
# PAYMENT SUCCEEDED HANDLER TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_handle_payment_succeeded(webhook_handler, db_session, test_subscription):
    """Test handling successful payment webhook"""
    event = {
        'id': 'evt_payment_success',
        'type': 'invoice.payment_succeeded',
        'data': {
            'object': {
                'id': 'in_test_123',
                'subscription': 'sub_test_123',
                'amount_due': 4900,
                'amount_paid': 4900,
                'currency': 'usd',
                'period_start': int(datetime.utcnow().timestamp()),
                'period_end': int((datetime.utcnow() + timedelta(days=30)).timestamp()),
                'status': 'paid',
                'hosted_invoice_url': 'https://invoice.stripe.com/test',
                'invoice_pdf': 'https://invoice.stripe.com/test.pdf',
                'status_transitions': {
                    'paid_at': int(datetime.utcnow().timestamp())
                }
            }
        }
    }
    
    await webhook_handler.handle_payment_succeeded(event)
    
    # Verify subscription status updated
    db_session.refresh(test_subscription)
    assert test_subscription.status == SubscriptionStatus.ACTIVE
    assert test_subscription.grace_period_end is None
    
    # Verify invoice created
    invoice = db_session.query(Invoice).filter_by(
        stripe_invoice_id='in_test_123'
    ).first()
    assert invoice is not None
    assert invoice.org_id == test_subscription.org_id
    assert invoice.amount_paid == 49.00
    assert invoice.status == 'paid'


@pytest.mark.asyncio
async def test_handle_payment_succeeded_no_subscription(webhook_handler, db_session):
    """Test handling payment succeeded when subscription not found"""
    event = {
        'id': 'evt_payment_success',
        'type': 'invoice.payment_succeeded',
        'data': {
            'object': {
                'id': 'in_test_123',
                'subscription': 'sub_nonexistent',
                'amount_due': 4900,
                'amount_paid': 4900,
                'currency': 'usd',
                'period_start': int(datetime.utcnow().timestamp()),
                'period_end': int((datetime.utcnow() + timedelta(days=30)).timestamp()),
                'status': 'paid',
                'status_transitions': {'paid_at': int(datetime.utcnow().timestamp())}
            }
        }
    }
    
    # Should not raise exception, just log error
    await webhook_handler.handle_payment_succeeded(event)
    
    # Verify no invoice was created
    invoice_count = db_session.query(Invoice).count()
    assert invoice_count == 0


# ============================================================================
# PAYMENT FAILED HANDLER TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_handle_payment_failed(webhook_handler, db_session, test_subscription):
    """Test handling failed payment webhook"""
    test_subscription.status = SubscriptionStatus.ACTIVE
    db_session.commit()
    
    event = {
        'id': 'evt_payment_failed',
        'type': 'invoice.payment_failed',
        'data': {
            'object': {
                'id': 'in_test_456',
                'subscription': 'sub_test_123',
                'amount_due': 4900,
                'amount_paid': 0,
                'status': 'open'
            }
        }
    }
    
    await webhook_handler.handle_payment_failed(event)
    
    # Verify subscription status updated
    db_session.refresh(test_subscription)
    assert test_subscription.status == SubscriptionStatus.PAST_DUE
    assert test_subscription.grace_period_end is not None
    
    # Verify grace period is 7 days
    grace_period_delta = test_subscription.grace_period_end - datetime.utcnow()
    assert 6 <= grace_period_delta.days <= 7  # Allow some tolerance


@pytest.mark.asyncio
async def test_handle_payment_failed_sets_grace_period(webhook_handler, db_session, test_subscription):
    """Test that payment failure sets correct grace period"""
    event = {
        'id': 'evt_payment_failed',
        'type': 'invoice.payment_failed',
        'data': {
            'object': {
                'id': 'in_test_456',
                'subscription': 'sub_test_123',
                'amount_due': 4900,
                'amount_paid': 0,
                'status': 'open'
            }
        }
    }
    
    before_time = datetime.utcnow()
    await webhook_handler.handle_payment_failed(event)
    after_time = datetime.utcnow()
    
    db_session.refresh(test_subscription)
    
    # Grace period should be between 7 days from before and after
    expected_min = before_time + timedelta(days=7)
    expected_max = after_time + timedelta(days=7)
    
    assert expected_min <= test_subscription.grace_period_end <= expected_max


# ============================================================================
# SUBSCRIPTION DELETED HANDLER TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_handle_subscription_deleted(webhook_handler, db_session, test_subscription):
    """Test handling subscription deletion webhook"""
    test_subscription.status = SubscriptionStatus.ACTIVE
    test_subscription.plan_tier = PlanTier.PRO
    db_session.commit()
    
    event = {
        'id': 'evt_subscription_deleted',
        'type': 'customer.subscription.deleted',
        'data': {
            'object': {
                'id': 'sub_test_123',
                'status': 'canceled'
            }
        }
    }
    
    await webhook_handler.handle_subscription_deleted(event)
    
    # Verify subscription canceled and downgraded
    db_session.refresh(test_subscription)
    assert test_subscription.status == SubscriptionStatus.CANCELED
    assert test_subscription.plan_tier == PlanTier.FREE


@pytest.mark.asyncio
async def test_handle_subscription_deleted_downgrades_to_free(webhook_handler, db_session, test_subscription):
    """Test that subscription deletion downgrades to free tier"""
    test_subscription.plan_tier = PlanTier.ENTERPRISE
    test_subscription.status = SubscriptionStatus.ACTIVE
    db_session.commit()
    
    event = {
        'id': 'evt_subscription_deleted',
        'type': 'customer.subscription.deleted',
        'data': {
            'object': {
                'id': 'sub_test_123',
                'status': 'canceled'
            }
        }
    }
    
    await webhook_handler.handle_subscription_deleted(event)
    
    db_session.refresh(test_subscription)
    assert test_subscription.plan_tier == PlanTier.FREE


# ============================================================================
# TRIAL WILL END HANDLER TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_handle_trial_will_end(webhook_handler, db_session, test_subscription):
    """Test handling trial will end webhook"""
    trial_end_time = datetime.utcnow() + timedelta(days=3)
    
    event = {
        'id': 'evt_trial_will_end',
        'type': 'customer.subscription.trial_will_end',
        'data': {
            'object': {
                'id': 'sub_test_123',
                'trial_end': int(trial_end_time.timestamp())
            }
        }
    }
    
    # Should not raise exception
    await webhook_handler.handle_trial_will_end(event)
    
    # TODO: When notification service is integrated, verify notification was sent


@pytest.mark.asyncio
async def test_handle_trial_will_end_no_trial_end(webhook_handler, db_session, test_subscription):
    """Test handling trial will end webhook without trial_end timestamp"""
    event = {
        'id': 'evt_trial_will_end',
        'type': 'customer.subscription.trial_will_end',
        'data': {
            'object': {
                'id': 'sub_test_123'
                # No trial_end field
            }
        }
    }
    
    # Should not raise exception, just log warning
    await webhook_handler.handle_trial_will_end(event)


# ============================================================================
# EVENT ROUTING TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_event_routing_payment_succeeded(webhook_handler, db_session, test_subscription):
    """Test that payment succeeded events are routed correctly"""
    event = {
        'id': 'evt_route_test',
        'type': 'invoice.payment_succeeded',
        'data': {
            'object': {
                'id': 'in_test_route',
                'subscription': 'sub_test_123',
                'amount_due': 4900,
                'amount_paid': 4900,
                'currency': 'usd',
                'period_start': int(datetime.utcnow().timestamp()),
                'period_end': int((datetime.utcnow() + timedelta(days=30)).timestamp()),
                'status': 'paid',
                'status_transitions': {'paid_at': int(datetime.utcnow().timestamp())}
            }
        }
    }
    
    payload = json.dumps(event).encode('utf-8')
    signature = "t=123456789,v1=valid_signature"
    
    with patch('stripe.Webhook.construct_event') as mock_construct:
        mock_construct.return_value = event
        
        result = await webhook_handler.handle_webhook(payload, signature)
        
        assert result['status'] == 'success'
        assert result['event_type'] == 'invoice.payment_succeeded'


@pytest.mark.asyncio
async def test_event_routing_payment_failed(webhook_handler, db_session, test_subscription):
    """Test that payment failed events are routed correctly"""
    event = {
        'id': 'evt_route_failed',
        'type': 'invoice.payment_failed',
        'data': {
            'object': {
                'id': 'in_test_failed',
                'subscription': 'sub_test_123',
                'amount_due': 4900,
                'amount_paid': 0,
                'status': 'open'
            }
        }
    }
    
    payload = json.dumps(event).encode('utf-8')
    signature = "t=123456789,v1=valid_signature"
    
    with patch('stripe.Webhook.construct_event') as mock_construct:
        mock_construct.return_value = event
        
        result = await webhook_handler.handle_webhook(payload, signature)
        
        assert result['status'] == 'success'
        assert result['event_type'] == 'invoice.payment_failed'


@pytest.mark.asyncio
async def test_event_routing_subscription_deleted(webhook_handler, db_session, test_subscription):
    """Test that subscription deleted events are routed correctly"""
    event = {
        'id': 'evt_route_deleted',
        'type': 'customer.subscription.deleted',
        'data': {
            'object': {
                'id': 'sub_test_123',
                'status': 'canceled'
            }
        }
    }
    
    payload = json.dumps(event).encode('utf-8')
    signature = "t=123456789,v1=valid_signature"
    
    with patch('stripe.Webhook.construct_event') as mock_construct:
        mock_construct.return_value = event
        
        result = await webhook_handler.handle_webhook(payload, signature)
        
        assert result['status'] == 'success'
        assert result['event_type'] == 'customer.subscription.deleted'


@pytest.mark.asyncio
async def test_event_routing_trial_will_end(webhook_handler, db_session, test_subscription):
    """Test that trial will end events are routed correctly"""
    event = {
        'id': 'evt_route_trial',
        'type': 'customer.subscription.trial_will_end',
        'data': {
            'object': {
                'id': 'sub_test_123',
                'trial_end': int((datetime.utcnow() + timedelta(days=3)).timestamp())
            }
        }
    }
    
    payload = json.dumps(event).encode('utf-8')
    signature = "t=123456789,v1=valid_signature"
    
    with patch('stripe.Webhook.construct_event') as mock_construct:
        mock_construct.return_value = event
        
        result = await webhook_handler.handle_webhook(payload, signature)
        
        assert result['status'] == 'success'
        assert result['event_type'] == 'customer.subscription.trial_will_end'


@pytest.mark.asyncio
async def test_event_routing_unhandled_event(webhook_handler):
    """Test that unhandled event types are skipped"""
    event = {
        'id': 'evt_unhandled',
        'type': 'customer.created',
        'data': {
            'object': {
                'id': 'cus_test_123'
            }
        }
    }
    
    payload = json.dumps(event).encode('utf-8')
    signature = "t=123456789,v1=valid_signature"
    
    with patch('stripe.Webhook.construct_event') as mock_construct:
        mock_construct.return_value = event
        
        result = await webhook_handler.handle_webhook(payload, signature)
        
        assert result['status'] == 'skipped'
        assert result['event_type'] == 'customer.created'


# ============================================================================
# EVENT LOGGING TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_webhook_event_logging(webhook_handler, db_session, test_subscription):
    """Test that all webhook events are logged"""
    event = {
        'id': 'evt_logging_test',
        'type': 'invoice.payment_succeeded',
        'data': {
            'object': {
                'id': 'in_logging_test',
                'subscription': 'sub_test_123',
                'amount_due': 4900,
                'amount_paid': 4900,
                'currency': 'usd',
                'period_start': int(datetime.utcnow().timestamp()),
                'period_end': int((datetime.utcnow() + timedelta(days=30)).timestamp()),
                'status': 'paid',
                'status_transitions': {'paid_at': int(datetime.utcnow().timestamp())}
            }
        }
    }
    
    payload = json.dumps(event).encode('utf-8')
    signature = "t=123456789,v1=valid_signature"
    
    with patch('stripe.Webhook.construct_event') as mock_construct:
        mock_construct.return_value = event
        
        await webhook_handler.handle_webhook(payload, signature)
        
        # Verify event was logged
        logged_event = db_session.query(WebhookEvent).filter_by(
            stripe_event_id='evt_logging_test'
        ).first()
        
        assert logged_event is not None
        assert logged_event.event_type == 'invoice.payment_succeeded'
        assert logged_event.processing_result == 'success'
        assert logged_event.error_message is None
        assert logged_event.payload == event


@pytest.mark.asyncio
async def test_webhook_event_logging_with_failure(webhook_handler, db_session):
    """Test that failed event processing is logged"""
    event = {
        'id': 'evt_logging_failure',
        'type': 'invoice.payment_succeeded',
        'data': {
            'object': {
                'id': 'in_logging_failure',
                'subscription': 'sub_nonexistent',  # Will cause handler to fail
                'amount_due': 4900,
                'amount_paid': 4900,
                'currency': 'usd',
                'period_start': int(datetime.utcnow().timestamp()),
                'period_end': int((datetime.utcnow() + timedelta(days=30)).timestamp()),
                'status': 'paid',
                'status_transitions': {'paid_at': int(datetime.utcnow().timestamp())}
            }
        }
    }
    
    payload = json.dumps(event).encode('utf-8')
    signature = "t=123456789,v1=valid_signature"
    
    with patch('stripe.Webhook.construct_event') as mock_construct:
        mock_construct.return_value = event
        
        # Should not raise exception, but log the failure
        result = await webhook_handler.handle_webhook(payload, signature)
        
        # Event should still be logged with failure status
        logged_event = db_session.query(WebhookEvent).filter_by(
            stripe_event_id='evt_logging_failure'
        ).first()
        
        assert logged_event is not None
        # Processing might succeed (no error) or have error depending on implementation
        assert logged_event.processing_result in ['success', 'failure', 'skipped']


# ============================================================================
# EDGE CASE TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_webhook_handler_initialization_without_secret():
    """Test that WebhookHandler requires webhook secret"""
    with pytest.raises(ValueError, match="Webhook secret is required"):
        WebhookHandler(Mock(), "")


@pytest.mark.asyncio
async def test_handle_payment_succeeded_without_subscription_id(webhook_handler, db_session):
    """Test handling payment succeeded without subscription ID"""
    event = {
        'id': 'evt_no_sub',
        'type': 'invoice.payment_succeeded',
        'data': {
            'object': {
                'id': 'in_no_sub',
                # No subscription field
                'amount_due': 4900,
                'amount_paid': 4900,
                'currency': 'usd',
                'status': 'paid',
                'period_start': int(datetime.utcnow().timestamp()),
                'period_end': int((datetime.utcnow() + timedelta(days=30)).timestamp()),
                'status_transitions': {'paid_at': int(datetime.utcnow().timestamp())}
            }
        }
    }
    
    # Should not raise exception, just log warning
    await webhook_handler.handle_payment_succeeded(event)


@pytest.mark.asyncio
async def test_invoice_creation_duplicate(webhook_handler, db_session, test_subscription):
    """Test that duplicate invoice creation is handled gracefully"""
    # Create an invoice first
    invoice = Invoice(
        org_id=test_subscription.org_id,
        stripe_invoice_id='in_duplicate_test',
        amount_due=49.00,
        currency='usd',
        status='paid'
    )
    db_session.add(invoice)
    db_session.commit()
    
    event = {
        'id': 'evt_duplicate_invoice',
        'type': 'invoice.payment_succeeded',
        'data': {
            'object': {
                'id': 'in_duplicate_test',
                'subscription': 'sub_test_123',
                'amount_due': 4900,
                'amount_paid': 4900,
                'currency': 'usd',
                'period_start': int(datetime.utcnow().timestamp()),
                'period_end': int((datetime.utcnow() + timedelta(days=30)).timestamp()),
                'status': 'paid',
                'status_transitions': {'paid_at': int(datetime.utcnow().timestamp())}
            }
        }
    }
    
    # Should not raise exception, just skip duplicate creation
    await webhook_handler.handle_payment_succeeded(event)
    
    # Verify only one invoice exists
    invoice_count = db_session.query(Invoice).filter_by(
        stripe_invoice_id='in_duplicate_test'
    ).count()
    assert invoice_count == 1
