"""
Webhook Handler Service
Processes Stripe webhook events with signature verification and idempotency
"""
import stripe
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from models_billing import (
    WebhookEvent,
    Subscription,
    Invoice,
    SubscriptionStatus,
    InvoiceStatus
)

logger = logging.getLogger(__name__)


class WebhookHandlerError(Exception):
    """Base exception for webhook handler errors"""
    pass


class SignatureVerificationError(WebhookHandlerError):
    """Webhook signature verification failed"""
    pass


class EventProcessingError(WebhookHandlerError):
    """Failed to process webhook event"""
    pass


class WebhookHandler:
    """Processes Stripe webhook events"""
    
    HANDLED_EVENTS = [
        "invoice.payment_succeeded",
        "invoice.payment_failed",
        "customer.subscription.deleted",
        "customer.subscription.trial_will_end",
        "customer.subscription.updated"
    ]
    
    def __init__(self, db: Session, webhook_secret: str):
        """
        Initialize WebhookHandler
        
        Args:
            db: SQLAlchemy database session
            webhook_secret: Stripe webhook endpoint secret
        """
        if not webhook_secret:
            raise ValueError("Webhook secret is required")
        
        self.db = db
        self.webhook_secret = webhook_secret
        logger.info("WebhookHandler initialized")
    
    async def handle_webhook(
        self,
        payload: bytes,
        signature: str
    ) -> Dict[str, Any]:
        """
        Process incoming Stripe webhook.
        
        1. Verify signature using webhook_secret
        2. Check idempotency (event already processed?)
        3. Route to appropriate handler based on event type
        4. Mark event as processed
        5. Return processing result
        
        Args:
            payload: Raw webhook payload
            signature: Stripe-Signature header
            
        Returns:
            Processing result dictionary with status and message
            
        Raises:
            SignatureVerificationError: If signature invalid
            EventProcessingError: If event processing fails
        """
        try:
            # Step 1: Verify webhook signature
            event = self._verify_signature(payload, signature)
            
            event_id = event['id']
            event_type = event['type']
            
            logger.info(f"Received webhook event {event_id} of type {event_type}")
            
            # Step 2: Check idempotency - has this event been processed?
            if self._is_event_processed(event_id):
                logger.info(f"Event {event_id} already processed, skipping")
                return {
                    'status': 'skipped',
                    'message': 'Event already processed',
                    'event_id': event_id
                }
            
            # Step 3: Route to appropriate handler
            processing_result = 'success'
            error_message = None
            
            try:
                if event_type == "invoice.payment_succeeded":
                    await self.handle_payment_succeeded(event)
                
                elif event_type == "invoice.payment_failed":
                    await self.handle_payment_failed(event)
                
                elif event_type == "customer.subscription.deleted":
                    await self.handle_subscription_deleted(event)
                
                elif event_type == "customer.subscription.trial_will_end":
                    await self.handle_trial_will_end(event)
                
                elif event_type == "customer.subscription.updated":
                    # Handle subscription updates (not explicitly in requirements but useful)
                    logger.info(f"Subscription updated: {event['data']['object']['id']}")
                
                else:
                    logger.info(f"Event type {event_type} not handled, skipping")
                    processing_result = 'skipped'
                
            except Exception as e:
                logger.error(f"Error processing event {event_id}: {e}", exc_info=True)
                processing_result = 'failure'
                error_message = str(e)
                # Don't raise - we still want to log the event
            
            # Step 4: Log the webhook event for audit trail and idempotency
            self._log_webhook_event(
                event_id=event_id,
                event_type=event_type,
                payload=event,
                processing_result=processing_result,
                error_message=error_message
            )
            
            logger.info(
                f"Webhook event {event_id} processed with result: {processing_result}"
            )
            
            return {
                'status': processing_result,
                'message': error_message or 'Event processed successfully',
                'event_id': event_id,
                'event_type': event_type
            }
            
        except SignatureVerificationError:
            logger.error("Webhook signature verification failed")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in webhook handler: {e}", exc_info=True)
            raise EventProcessingError(f"Failed to process webhook: {str(e)}")
    
    async def handle_payment_succeeded(self, event: Dict[str, Any]) -> None:
        """
        Handle successful payment (invoice.payment_succeeded).
        
        - Update subscription status to active
        - Extend current_period_end
        - Create invoice record
        - Send renewal notification (TODO: integrate with notification service)
        
        Args:
            event: Stripe event object
        """
        try:
            invoice_data = event['data']['object']
            
            subscription_id = invoice_data.get('subscription')
            if not subscription_id:
                logger.warning("No subscription ID in payment succeeded event")
                return
            
            # Find subscription by Stripe subscription ID
            subscription = self.db.query(Subscription).filter_by(
                stripe_subscription_id=subscription_id
            ).first()
            
            if not subscription:
                logger.error(f"Subscription not found for Stripe ID {subscription_id}")
                return
            
            # Update subscription status to active
            subscription.status = SubscriptionStatus.ACTIVE
            
            # Clear grace period if it was set
            subscription.grace_period_end = None
            
            # Update period dates from invoice
            period_start = datetime.fromtimestamp(invoice_data['period_start'])
            period_end = datetime.fromtimestamp(invoice_data['period_end'])
            
            subscription.current_period_start = period_start
            subscription.current_period_end = period_end
            
            # Create invoice record
            await self._create_invoice_record(
                org_id=subscription.org_id,
                invoice_data=invoice_data
            )
            
            self.db.commit()
            
            logger.info(
                f"Payment succeeded for subscription {subscription_id}, "
                f"status updated to active, period extended to {period_end}"
            )
            
            # TODO: Send renewal notification
            # await notification_service.send_renewal_notification(
            #     org_id=subscription.org_id,
            #     amount=invoice_data['amount_paid'] / 100,
            #     next_billing_date=period_end
            # )
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error handling payment succeeded: {e}", exc_info=True)
            raise EventProcessingError(f"Failed to handle payment succeeded: {str(e)}")
    
    async def handle_payment_failed(self, event: Dict[str, Any]) -> None:
        """
        Handle failed payment (invoice.payment_failed).
        
        - Update subscription status to past_due
        - Set grace_period_end to now + 7 days
        - Send payment failure notification (TODO: integrate with notification service)
        - Schedule grace period expiration job (TODO: integrate with scheduler)
        
        Args:
            event: Stripe event object
        """
        try:
            invoice_data = event['data']['object']
            
            subscription_id = invoice_data.get('subscription')
            if not subscription_id:
                logger.warning("No subscription ID in payment failed event")
                return
            
            # Find subscription by Stripe subscription ID
            subscription = self.db.query(Subscription).filter_by(
                stripe_subscription_id=subscription_id
            ).first()
            
            if not subscription:
                logger.error(f"Subscription not found for Stripe ID {subscription_id}")
                return
            
            # Update subscription status to past_due
            subscription.status = SubscriptionStatus.PAST_DUE
            
            # Set grace period end to 7 days from now
            grace_period_end = datetime.utcnow() + timedelta(days=7)
            subscription.grace_period_end = grace_period_end
            
            self.db.commit()
            
            logger.info(
                f"Payment failed for subscription {subscription_id}, "
                f"status updated to past_due with grace period until {grace_period_end}"
            )
            
            # TODO: Send payment failure notification
            # await notification_service.send_payment_failure_notification(
            #     org_id=subscription.org_id,
            #     grace_period_end=grace_period_end
            # )
            
            # TODO: Schedule grace period expiration job
            # await scheduler.schedule_grace_period_expiration(
            #     subscription_id=subscription.id,
            #     execute_at=grace_period_end
            # )
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error handling payment failed: {e}", exc_info=True)
            raise EventProcessingError(f"Failed to handle payment failed: {str(e)}")
    
    async def handle_subscription_deleted(self, event: Dict[str, Any]) -> None:
        """
        Handle subscription cancellation (customer.subscription.deleted).
        
        - Update subscription status to canceled
        - Downgrade organization to free tier
        - Send cancellation notification (TODO: integrate with notification service)
        
        Args:
            event: Stripe event object
        """
        try:
            subscription_data = event['data']['object']
            subscription_id = subscription_data['id']
            
            # Find subscription by Stripe subscription ID
            subscription = self.db.query(Subscription).filter_by(
                stripe_subscription_id=subscription_id
            ).first()
            
            if not subscription:
                logger.error(f"Subscription not found for Stripe ID {subscription_id}")
                return
            
            # Update subscription status to canceled
            subscription.status = SubscriptionStatus.CANCELED
            
            # Downgrade to free tier
            subscription.plan_tier = 'free'
            
            # Clear Stripe references (optional - could keep for history)
            # subscription.stripe_subscription_id = None
            
            self.db.commit()
            
            logger.info(
                f"Subscription {subscription_id} canceled and downgraded to free tier"
            )
            
            # TODO: Send cancellation notification
            # await notification_service.send_cancellation_notification(
            #     org_id=subscription.org_id
            # )
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error handling subscription deleted: {e}", exc_info=True)
            raise EventProcessingError(f"Failed to handle subscription deleted: {str(e)}")
    
    async def handle_trial_will_end(self, event: Dict[str, Any]) -> None:
        """
        Handle trial ending soon (customer.subscription.trial_will_end).
        
        - Send notification 3 days before trial expiration
        - Include link to add payment method (TODO: integrate with notification service)
        
        Args:
            event: Stripe event object
        """
        try:
            subscription_data = event['data']['object']
            subscription_id = subscription_data['id']
            trial_end_timestamp = subscription_data.get('trial_end')
            
            if not trial_end_timestamp:
                logger.warning("No trial_end in trial_will_end event")
                return
            
            trial_end = datetime.fromtimestamp(trial_end_timestamp)
            
            # Find subscription by Stripe subscription ID
            subscription = self.db.query(Subscription).filter_by(
                stripe_subscription_id=subscription_id
            ).first()
            
            if not subscription:
                logger.error(f"Subscription not found for Stripe ID {subscription_id}")
                return
            
            logger.info(
                f"Trial will end for subscription {subscription_id} on {trial_end}"
            )
            
            # TODO: Send trial ending notification
            # await notification_service.send_trial_ending_notification(
            #     org_id=subscription.org_id,
            #     trial_end=trial_end,
            #     days_remaining=3
            # )
            
        except Exception as e:
            logger.error(f"Error handling trial will end: {e}", exc_info=True)
            raise EventProcessingError(f"Failed to handle trial will end: {str(e)}")
    
    def _verify_signature(self, payload: bytes, signature: str) -> Dict[str, Any]:
        """
        Verify webhook signature using Stripe's library.
        
        Args:
            payload: Raw webhook payload
            signature: Stripe-Signature header value
            
        Returns:
            Parsed event object
            
        Raises:
            SignatureVerificationError: If signature verification fails
        """
        try:
            event = stripe.Webhook.construct_event(
                payload, signature, self.webhook_secret
            )
            return event
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Webhook signature verification failed: {e}")
            raise SignatureVerificationError(f"Invalid signature: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error verifying signature: {e}")
            raise SignatureVerificationError(f"Signature verification error: {str(e)}")
    
    def _is_event_processed(self, event_id: str) -> bool:
        """
        Check if webhook event has already been processed (idempotency).
        
        Args:
            event_id: Stripe event ID
            
        Returns:
            True if event already processed, False otherwise
        """
        existing_event = self.db.query(WebhookEvent).filter_by(
            stripe_event_id=event_id
        ).first()
        
        return existing_event is not None
    
    def _log_webhook_event(
        self,
        event_id: str,
        event_type: str,
        payload: Dict[str, Any],
        processing_result: str,
        error_message: Optional[str] = None
    ) -> None:
        """
        Log webhook event to database for audit trail and idempotency.
        
        Args:
            event_id: Stripe event ID
            event_type: Type of event
            payload: Full event payload
            processing_result: 'success', 'failure', or 'skipped'
            error_message: Error message if processing failed
        """
        try:
            webhook_event = WebhookEvent(
                stripe_event_id=event_id,
                event_type=event_type,
                payload=payload,
                processed_at=datetime.utcnow(),
                processing_result=processing_result,
                error_message=error_message
            )
            
            self.db.add(webhook_event)
            self.db.commit()
            
            logger.debug(f"Logged webhook event {event_id} with result {processing_result}")
            
        except IntegrityError:
            # Event already logged (race condition)
            self.db.rollback()
            logger.warning(f"Event {event_id} already logged in database")
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to log webhook event: {e}", exc_info=True)
            # Don't raise - logging failure shouldn't fail the webhook
    
    async def _create_invoice_record(
        self,
        org_id,
        invoice_data: Dict[str, Any]
    ) -> None:
        """
        Create invoice record from Stripe invoice data.
        
        Args:
            org_id: Organization UUID
            invoice_data: Stripe invoice object
        """
        try:
            # Check if invoice already exists
            existing = self.db.query(Invoice).filter_by(
                stripe_invoice_id=invoice_data['id']
            ).first()
            
            if existing:
                logger.debug(f"Invoice {invoice_data['id']} already exists")
                return
            
            invoice = Invoice(
                org_id=org_id,
                stripe_invoice_id=invoice_data['id'],
                stripe_invoice_url=invoice_data.get('hosted_invoice_url'),
                stripe_invoice_pdf=invoice_data.get('invoice_pdf'),
                amount_due=invoice_data['amount_due'] / 100,  # Convert cents to dollars
                amount_paid=invoice_data['amount_paid'] / 100 if invoice_data.get('amount_paid') else None,
                currency=invoice_data.get('currency', 'usd'),
                period_start=datetime.fromtimestamp(invoice_data['period_start']) if invoice_data.get('period_start') else None,
                period_end=datetime.fromtimestamp(invoice_data['period_end']) if invoice_data.get('period_end') else None,
                status=invoice_data.get('status', 'paid'),
                paid_at=datetime.fromtimestamp(invoice_data['status_transitions']['paid_at']) if invoice_data.get('status_transitions', {}).get('paid_at') else None,
                created_at=datetime.utcnow()
            )
            
            self.db.add(invoice)
            # Don't commit here - let the caller commit
            
            logger.info(f"Created invoice record for {invoice_data['id']}")
            
        except Exception as e:
            logger.error(f"Failed to create invoice record: {e}", exc_info=True)
            raise


def get_webhook_handler(db: Session) -> WebhookHandler:
    """
    Factory function to create WebhookHandler instance.
    
    Args:
        db: SQLAlchemy database session
        
    Returns:
        WebhookHandler instance
        
    Raises:
        ValueError: If STRIPE_WEBHOOK_SECRET not set
    """
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    
    webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')
    if not webhook_secret:
        raise ValueError(
            "STRIPE_WEBHOOK_SECRET environment variable is required. "
            "Please add your Stripe webhook secret to your .env file. "
            "Get this from your Stripe Dashboard > Developers > Webhooks."
        )
    
    return WebhookHandler(db, webhook_secret)
