"""
Payment Processor Service
Handles all Stripe payment operations for subscription billing
"""
import stripe
import logging
from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timedelta
from decimal import Decimal

logger = logging.getLogger(__name__)


class PaymentProcessorError(Exception):
    """Base exception for payment processor errors"""
    pass


class StripeAPIError(PaymentProcessorError):
    """Stripe API error wrapper"""
    pass


class PaymentMethodRequiredError(PaymentProcessorError):
    """Payment method required for operation"""
    pass


class InvalidProrationError(PaymentProcessorError):
    """Invalid proration calculation"""
    pass


class PaymentProcessor:
    """Handles all Stripe payment operations"""
    
    def __init__(self, stripe_api_key: str):
        """Initialize PaymentProcessor with Stripe API key"""
        if not stripe_api_key:
            raise ValueError("Stripe API key is required")
        
        stripe.api_key = stripe_api_key
        self.stripe = stripe
        logger.info("PaymentProcessor initialized with Stripe API key")
    
    async def create_customer(
        self,
        org_id: UUID,
        email: str,
        org_name: str
    ) -> str:
        """
        Create Stripe customer for organization.
        
        Args:
            org_id: Organization UUID
            email: Organization owner email
            org_name: Organization name
            
        Returns:
            Stripe customer ID
            
        Raises:
            StripeAPIError: If Stripe API call fails
        """
        try:
            customer_data = {
                'email': email,
                'name': org_name,
                'metadata': {
                    'org_id': str(org_id),
                    'mkchain_customer': 'true'
                }
            }
            
            customer = self.stripe.Customer.create(**customer_data)
            
            logger.info(f"Created Stripe customer {customer.id} for org {org_id}")
            return customer.id
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to create Stripe customer: {e}")
            raise StripeAPIError(f"Failed to create customer: {str(e)}")
    
    async def create_subscription(
        self,
        customer_id: str,
        price_id: str,
        trial_days: Optional[int] = None,
        payment_method_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create Stripe subscription.
        
        Args:
            customer_id: Stripe customer ID
            price_id: Stripe price ID for plan tier
            trial_days: Number of trial days (14 for first paid subscription)
            payment_method_id: Payment method to attach
            
        Returns:
            Stripe subscription object with id, status, current_period_end
            
        Raises:
            StripeAPIError: If Stripe API call fails
            PaymentMethodRequiredError: If payment method needed but not provided
        """
        try:
            subscription_data = {
                'customer': customer_id,
                'items': [{'price': price_id}],
                'expand': ['latest_invoice.payment_intent']
            }
            
            # Add trial period if specified
            if trial_days:
                trial_end = datetime.utcnow() + timedelta(days=trial_days)
                subscription_data['trial_end'] = int(trial_end.timestamp())
                logger.info(f"Setting trial period of {trial_days} days ending {trial_end}")
            
            # Add payment method if provided
            if payment_method_id:
                # First attach the payment method to customer
                await self.add_payment_method(customer_id, payment_method_id, set_default=True)
                subscription_data['default_payment_method'] = payment_method_id
            elif not trial_days:
                # Payment method required for non-trial subscriptions
                raise PaymentMethodRequiredError("Payment method required for non-trial subscription")
            
            subscription = self.stripe.Subscription.create(**subscription_data)
            
            result = {
                'id': subscription.id,
                'status': subscription.status,
                'current_period_start': datetime.fromtimestamp(subscription.current_period_start),
                'current_period_end': datetime.fromtimestamp(subscription.current_period_end),
                'trial_end': datetime.fromtimestamp(subscription.trial_end) if subscription.trial_end else None,
                'cancel_at_period_end': subscription.cancel_at_period_end
            }
            
            logger.info(f"Created Stripe subscription {subscription.id} with status {subscription.status}")
            return result
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to create Stripe subscription: {e}")
            raise StripeAPIError(f"Failed to create subscription: {str(e)}")
    
    async def update_subscription(
        self,
        subscription_id: str,
        new_price_id: str,
        proration_behavior: str = "create_prorations"
    ) -> Dict[str, Any]:
        """
        Update subscription price with proration.
        
        Args:
            subscription_id: Stripe subscription ID
            new_price_id: New price ID
            proration_behavior: How to handle proration ("create_prorations" or "none")
            
        Returns:
            Updated subscription object with prorated charge
            
        Raises:
            StripeAPIError: If Stripe API call fails
        """
        try:
            # Get current subscription to access items
            subscription = self.stripe.Subscription.retrieve(subscription_id)
            
            # Update the subscription item with new price
            subscription_item = subscription['items']['data'][0]
            
            updated_subscription = self.stripe.Subscription.modify(
                subscription_id,
                items=[{
                    'id': subscription_item.id,
                    'price': new_price_id,
                }],
                proration_behavior=proration_behavior,
                expand=['latest_invoice.payment_intent']
            )
            
            result = {
                'id': updated_subscription.id,
                'status': updated_subscription.status,
                'current_period_start': datetime.fromtimestamp(updated_subscription.current_period_start),
                'current_period_end': datetime.fromtimestamp(updated_subscription.current_period_end),
                'trial_end': datetime.fromtimestamp(updated_subscription.trial_end) if updated_subscription.trial_end else None,
                'cancel_at_period_end': updated_subscription.cancel_at_period_end,
                'latest_invoice': {
                    'id': updated_subscription.latest_invoice.id,
                    'amount_due': updated_subscription.latest_invoice.amount_due,
                    'amount_paid': updated_subscription.latest_invoice.amount_paid,
                } if updated_subscription.latest_invoice else None
            }
            
            logger.info(f"Updated Stripe subscription {subscription_id} to price {new_price_id}")
            return result
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to update Stripe subscription: {e}")
            raise StripeAPIError(f"Failed to update subscription: {str(e)}")
    
    async def cancel_subscription(
        self,
        subscription_id: str,
        at_period_end: bool = True
    ) -> Dict[str, Any]:
        """
        Cancel Stripe subscription.
        
        Args:
            subscription_id: Stripe subscription ID
            at_period_end: If True, cancel at period end; if False, immediately
            
        Returns:
            Canceled subscription object
            
        Raises:
            StripeAPIError: If Stripe API call fails
        """
        try:
            if at_period_end:
                # Schedule cancellation at period end
                subscription = self.stripe.Subscription.modify(
                    subscription_id,
                    cancel_at_period_end=True
                )
                logger.info(f"Scheduled cancellation for subscription {subscription_id} at period end")
            else:
                # Cancel immediately
                subscription = self.stripe.Subscription.cancel(subscription_id)
                logger.info(f"Immediately canceled subscription {subscription_id}")
            
            result = {
                'id': subscription.id,
                'status': subscription.status,
                'current_period_start': datetime.fromtimestamp(subscription.current_period_start),
                'current_period_end': datetime.fromtimestamp(subscription.current_period_end),
                'canceled_at': datetime.fromtimestamp(subscription.canceled_at) if subscription.canceled_at else None,
                'cancel_at_period_end': subscription.cancel_at_period_end
            }
            
            return result
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to cancel Stripe subscription: {e}")
            raise StripeAPIError(f"Failed to cancel subscription: {str(e)}")
    
    async def add_payment_method(
        self,
        customer_id: str,
        payment_method_id: str,
        set_default: bool = True
    ) -> Dict[str, Any]:
        """
        Attach payment method to customer.
        
        Args:
            customer_id: Stripe customer ID
            payment_method_id: Stripe payment method ID (from Stripe Elements)
            set_default: Whether to set as default payment method
            
        Returns:
            Payment method object with last4, brand, exp_month, exp_year
            
        Raises:
            StripeAPIError: If Stripe API call fails
        """
        try:
            # Attach payment method to customer
            payment_method = self.stripe.PaymentMethod.attach(
                payment_method_id,
                customer=customer_id
            )
            
            # Set as default payment method if requested
            if set_default:
                self.stripe.Customer.modify(
                    customer_id,
                    invoice_settings={'default_payment_method': payment_method_id}
                )
            
            result = {
                'id': payment_method.id,
                'type': payment_method.type,
                'card': {
                    'brand': payment_method.card.brand,
                    'last4': payment_method.card.last4,
                    'exp_month': payment_method.card.exp_month,
                    'exp_year': payment_method.card.exp_year,
                } if payment_method.card else None,
                'created': datetime.fromtimestamp(payment_method.created)
            }
            
            logger.info(f"Attached payment method {payment_method_id} to customer {customer_id}")
            return result
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to attach payment method: {e}")
            raise StripeAPIError(f"Failed to attach payment method: {str(e)}")
    
    async def retry_invoice_payment(
        self,
        invoice_id: str,
        payment_method_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Retry payment for failed invoice.
        
        Args:
            invoice_id: Stripe invoice ID
            payment_method_id: Optional new payment method
            
        Returns:
            Invoice object with payment attempt result
            
        Raises:
            StripeAPIError: If Stripe API call fails
        """
        try:
            # If new payment method provided, update customer's default
            if payment_method_id:
                invoice = self.stripe.Invoice.retrieve(invoice_id)
                customer_id = invoice.customer
                
                # Attach and set as default
                await self.add_payment_method(customer_id, payment_method_id, set_default=True)
            
            # Retry the invoice payment
            invoice = self.stripe.Invoice.pay(
                invoice_id,
                expand=['payment_intent']
            )
            
            result = {
                'id': invoice.id,
                'status': invoice.status,
                'amount_due': invoice.amount_due,
                'amount_paid': invoice.amount_paid,
                'paid': invoice.paid,
                'payment_intent': {
                    'id': invoice.payment_intent.id,
                    'status': invoice.payment_intent.status,
                } if invoice.payment_intent else None,
                'attempt_count': invoice.attempt_count
            }
            
            logger.info(f"Retried payment for invoice {invoice_id}, status: {invoice.status}")
            return result
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to retry invoice payment: {e}")
            raise StripeAPIError(f"Failed to retry invoice payment: {str(e)}")
    
    async def calculate_proration(
        self,
        subscription_id: str,
        new_price_id: str
    ) -> float:
        """
        Preview proration amount for subscription change.
        
        Args:
            subscription_id: Stripe subscription ID
            new_price_id: Target price ID
            
        Returns:
            Prorated amount in dollars (can be negative for downgrades)
            
        Raises:
            StripeAPIError: If Stripe API call fails
            InvalidProrationError: If proration calculation fails
        """
        try:
            # Get current subscription
            subscription = self.stripe.Subscription.retrieve(subscription_id)
            subscription_item = subscription['items']['data'][0]
            
            # Calculate proration using invoice preview
            upcoming_invoice = self.stripe.Invoice.upcoming(
                customer=subscription.customer,
                subscription=subscription_id,
                subscription_items=[{
                    'id': subscription_item.id,
                    'price': new_price_id,
                }],
                subscription_proration_behavior='create_prorations'
            )
            
            # Calculate total proration amount
            proration_amount = 0
            for line_item in upcoming_invoice.lines.data:
                if line_item.proration:
                    proration_amount += line_item.amount
            
            # Convert from cents to dollars
            proration_dollars = proration_amount / 100.0
            
            logger.info(f"Calculated proration for subscription {subscription_id}: ${proration_dollars}")
            return proration_dollars
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to calculate proration: {e}")
            raise StripeAPIError(f"Failed to calculate proration: {str(e)}")
        except Exception as e:
            logger.error(f"Invalid proration calculation: {e}")
            raise InvalidProrationError(f"Invalid proration calculation: {str(e)}")
    
    async def get_customer(self, customer_id: str) -> Dict[str, Any]:
        """
        Retrieve Stripe customer details.
        
        Args:
            customer_id: Stripe customer ID
            
        Returns:
            Customer object
            
        Raises:
            StripeAPIError: If Stripe API call fails
        """
        try:
            customer = self.stripe.Customer.retrieve(customer_id)
            
            result = {
                'id': customer.id,
                'email': customer.email,
                'name': customer.name,
                'created': datetime.fromtimestamp(customer.created),
                'metadata': customer.metadata
            }
            
            return result
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to retrieve customer: {e}")
            raise StripeAPIError(f"Failed to retrieve customer: {str(e)}")
    
    async def get_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """
        Retrieve Stripe subscription details.
        
        Args:
            subscription_id: Stripe subscription ID
            
        Returns:
            Subscription object
            
        Raises:
            StripeAPIError: If Stripe API call fails
        """
        try:
            subscription = self.stripe.Subscription.retrieve(
                subscription_id,
                expand=['default_payment_method']
            )
            
            result = {
                'id': subscription.id,
                'customer': subscription.customer,
                'status': subscription.status,
                'current_period_start': datetime.fromtimestamp(subscription.current_period_start),
                'current_period_end': datetime.fromtimestamp(subscription.current_period_end),
                'trial_end': datetime.fromtimestamp(subscription.trial_end) if subscription.trial_end else None,
                'cancel_at_period_end': subscription.cancel_at_period_end,
                'canceled_at': datetime.fromtimestamp(subscription.canceled_at) if subscription.canceled_at else None,
                'items': [{
                    'id': item.id,
                    'price': {
                        'id': item.price.id,
                        'unit_amount': item.price.unit_amount,
                        'currency': item.price.currency,
                        'recurring': item.price.recurring
                    }
                } for item in subscription.items.data],
                'default_payment_method': {
                    'id': subscription.default_payment_method.id,
                    'card': {
                        'brand': subscription.default_payment_method.card.brand,
                        'last4': subscription.default_payment_method.card.last4,
                        'exp_month': subscription.default_payment_method.card.exp_month,
                        'exp_year': subscription.default_payment_method.card.exp_year,
                    }
                } if subscription.default_payment_method else None
            }
            
            return result
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to retrieve subscription: {e}")
            raise StripeAPIError(f"Failed to retrieve subscription: {str(e)}")
    
    async def list_payment_methods(self, customer_id: str) -> list[Dict[str, Any]]:
        """
        List all payment methods for a customer.
        
        Args:
            customer_id: Stripe customer ID
            
        Returns:
            List of payment method objects
            
        Raises:
            StripeAPIError: If Stripe API call fails
        """
        try:
            payment_methods = self.stripe.PaymentMethod.list(
                customer=customer_id,
                type='card'
            )
            
            result = []
            for pm in payment_methods.data:
                result.append({
                    'id': pm.id,
                    'type': pm.type,
                    'card': {
                        'brand': pm.card.brand,
                        'last4': pm.card.last4,
                        'exp_month': pm.card.exp_month,
                        'exp_year': pm.card.exp_year,
                    } if pm.card else None,
                    'created': datetime.fromtimestamp(pm.created)
                })
            
            return result
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to list payment methods: {e}")
            raise StripeAPIError(f"Failed to list payment methods: {str(e)}")
    
    async def detach_payment_method(self, payment_method_id: str) -> bool:
        """
        Detach payment method from customer.
        
        Args:
            payment_method_id: Stripe payment method ID
            
        Returns:
            True if successfully detached
            
        Raises:
            StripeAPIError: If Stripe API call fails
        """
        try:
            self.stripe.PaymentMethod.detach(payment_method_id)
            logger.info(f"Detached payment method {payment_method_id}")
            return True
            
        except stripe.error.StripeError as e:
            logger.error(f"Failed to detach payment method: {e}")
            raise StripeAPIError(f"Failed to detach payment method: {str(e)}")


def get_payment_processor() -> PaymentProcessor:
    """Factory function to create PaymentProcessor instance"""
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    
    stripe_api_key = os.getenv('STRIPE_API_KEY')
    if not stripe_api_key:
        raise ValueError(
            "STRIPE_API_KEY environment variable is required. "
            "Please add your Stripe secret key to your .env file."
        )
    
    return PaymentProcessor(stripe_api_key)