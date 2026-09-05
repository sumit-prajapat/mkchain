# Usage Enforcer Middleware

## Overview

The `UsageEnforcerMiddleware` provides real-time quota enforcement and feature access control for the MKChain subscription billing system. It intercepts all API requests to enforce plan-specific limits before processing.

## Features

- **Analysis Quota Enforcement**: Prevents organizations from exceeding monthly analysis limits
- **Feature Access Control**: Restricts premium features to appropriate plan tiers
- **API Rate Limiting**: Enforces hourly API call limits per plan tier
- **Grace Period Support**: Allows continued access during payment grace periods
- **Trial Period Support**: Grants full feature access during trial periods
- **Rate Limit Headers**: Adds X-RateLimit-* headers to all API responses
- **Fail-Open Design**: Continues processing on middleware errors to prevent service disruption

## Plan Limits

### Free Tier
- **Analyses per month**: 10
- **API calls per hour**: 100
- **Storage**: 1 GB
- **Features**: basic_analysis, 2d_graph

### Pro Tier
- **Analyses per month**: 100
- **API calls per hour**: 1,000
- **Storage**: 50 GB
- **Features**: basic_analysis, 2d_graph, 3d_graph, ai_summary, pdf_report, comparison

### Enterprise Tier
- **Analyses per month**: Unlimited (-1)
- **API calls per hour**: 5,000
- **Storage**: 500 GB
- **Features**: All features (*)

## Installation

### 1. Add to FastAPI Application

```python
from middleware.usage_enforcer import usage_enforcer_middleware

# Add after auth middleware
app.middleware('http')(usage_enforcer_middleware)
```

### 2. Ensure Database Tables Exist

The middleware requires the following tables:
- `subscriptions`
- `usage_metrics`
- `rate_limits`

These are created by the billing system migrations.

## Request Flow

```
1. Request arrives → 2. Auth middleware (sets org_id) → 3. Usage Enforcer
                                                           ↓
4a. Check subscription status                              |
4b. Check rate limit (all endpoints)                       |
4c. Check analysis quota (analysis endpoints)              |
4d. Check feature access (premium feature endpoints)       |
                                                           ↓
5a. Reject with 429/403 ← OR → 5b. Allow request → 6. Process → 7. Add headers
```

## Response Status Codes

### 429 Too Many Requests
Returned when usage quota or rate limit is exceeded:

```json
{
  "error": "Quota exceeded",
  "message": "Monthly analysis quota exceeded. Please upgrade your plan.",
  "quota_type": "analyses_per_month",
  "limit": 10,
  "upgrade_url": "/billing/plans"
}
```

Headers:
- `Retry-After`: Seconds until limit reset
- `X-RateLimit-Limit`: Maximum requests per hour
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

### 403 Forbidden
Returned when feature is not available in current plan:

```json
{
  "error": "Feature access denied",
  "message": "This feature requires pro plan. Please upgrade.",
  "feature": "ai_summary",
  "current_plan": "free",
  "required_plan": "pro",
  "upgrade_url": "/billing/plans"
}
```

### 402 Payment Required
Returned when subscription is past due and grace period expired:

```json
{
  "error": "Payment required",
  "message": "Your subscription payment is overdue. Please update your payment method.",
  "status": "past_due"
}
```

## Endpoint-Specific Behavior

### Analysis Endpoints
- `/api/analyze`
- `/api/analysis`

**Checks**: Analysis quota + rate limit

### Premium Feature Endpoints

#### AI Summary
- Endpoints containing `/ai-summary`
- **Required plan**: Pro or Enterprise

#### PDF Report
- Endpoints containing `/pdf`
- **Required plan**: Pro or Enterprise

#### Comparison
- `/api/compare`
- **Required plan**: Pro or Enterprise

#### Custom Integration
- `/api/v1/integrations`
- **Required plan**: Enterprise

## Special Cases

### Trial Period
Organizations with `status=trialing` have access to ALL features regardless of plan tier. This allows evaluation before committing to payment.

### Grace Period
Organizations in grace period (`status=past_due` with valid `grace_period_end`) maintain full access to their subscribed plan features.

### Canceled/Unpaid Subscriptions
Organizations with `status=canceled` or `status=unpaid` are automatically downgraded to free tier limits.

### Unlimited Quotas
Enterprise tier has unlimited analyses (`analyses_per_month=-1`). These checks always pass.

## Rate Limit Headers

The middleware adds these headers to ALL API responses:

- `X-RateLimit-Limit`: Maximum requests per hour for the plan
- `X-RateLimit-Remaining`: Remaining requests in current hour window
- `X-RateLimit-Reset`: Unix timestamp when the hourly window resets

Example:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 1704124800
```

## Error Handling

The middleware implements "fail-open" behavior:

- If database queries fail → Allow request (logged as error)
- If subscription not found → Default to free tier limits
- If middleware crashes → Allow request (logged as error)

This ensures service availability even if the billing system has issues.

## Logging

The middleware logs:

- **INFO**: Quota warnings at 80% and 100% thresholds
- **WARNING**: Quota exceeded, feature access denied, rate limit exceeded
- **ERROR**: Unexpected errors in quota checking
- **DEBUG**: Successful quota checks with current usage

Example logs:
```
INFO: Analysis quota check passed for org abc123: 7/10
WARNING: Analysis quota exceeded for org abc123: 10/10
ERROR: Error checking rate limit: Database connection failed
```

## Integration with UsageTracker

The middleware works alongside the `UsageTracker` service:

- **UsageTracker**: Records usage after operations complete
- **UsageEnforcer**: Checks limits before operations start

This separation ensures:
1. Requests are blocked BEFORE consuming resources
2. Usage is recorded AFTER successful operations
3. Quota state remains consistent

## Testing

Run the test suite:

```bash
python -m pytest test_usage_enforcer.py -v
```

Tests cover:
- Plan limit definitions
- Analysis quota enforcement
- Feature access control
- Rate limiting
- Trial period access
- Grace period handling
- Error handling

## Performance Considerations

### Database Queries
The middleware makes 2-4 database queries per request:
1. Get subscription (cached in request context by auth middleware)
2. Get usage metrics for current period
3. Get/create rate limit record for current hour
4. Update rate limit counter

### Optimization Recommendations

1. **Redis Cache**: Cache subscription and usage data with 1-minute TTL
2. **Rate Limit in Redis**: Use Redis for rate limiting instead of PostgreSQL
3. **Read Replicas**: Query subscription/usage from read replicas
4. **Connection Pooling**: Ensure proper database connection pooling

Example Redis integration:
```python
# Cache subscription for 60 seconds
cache_key = f"subscription:{org_id}"
subscription = redis.get(cache_key)
if not subscription:
    subscription = db.query(Subscription).filter(...).first()
    redis.setex(cache_key, 60, serialize(subscription))
```

## Troubleshooting

### Issue: All requests blocked with 429
**Cause**: Rate limit not resetting

**Solution**: Check rate_limits table for stuck records:
```sql
SELECT * FROM rate_limits WHERE window_end < NOW();
DELETE FROM rate_limits WHERE window_end < NOW() - INTERVAL '1 hour';
```

### Issue: Premium features accessible on free tier
**Cause**: Middleware not installed or subscription check failing

**Solution**: 
1. Verify middleware is added after auth middleware
2. Check logs for middleware errors
3. Verify subscription record exists for organization

### Issue: 402 errors during valid subscription
**Cause**: Grace period expired

**Solution**: Organization needs to update payment method or subscription status needs correction.

## API Examples

### Successful Request (Within Limits)
```bash
curl -H "Authorization: Bearer <token>" \
     -H "X-Organization-ID: <org_id>" \
     https://api.mkchain.com/api/analyze

HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1704124800
```

### Rate Limit Exceeded
```bash
curl -H "Authorization: Bearer <token>" \
     -H "X-Organization-ID: <org_id>" \
     https://api.mkchain.com/api/analyze

HTTP/1.1 429 Too Many Requests
Retry-After: 2847
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704124800

{
  "error": "Rate limit exceeded",
  "message": "Hourly API quota exceeded. Please upgrade your plan or wait for limit reset.",
  "limit": 100,
  "retry_after": 2847
}
```

### Feature Access Denied
```bash
curl -H "Authorization: Bearer <token>" \
     -H "X-Organization-ID: <org_id>" \
     https://api.mkchain.com/api/reports/123/ai-summary

HTTP/1.1 403 Forbidden

{
  "error": "Feature access denied",
  "message": "This feature requires pro plan. Please upgrade.",
  "feature": "ai_summary",
  "current_plan": "free",
  "required_plan": "pro",
  "upgrade_url": "/billing/plans"
}
```

## See Also

- `services/usage_tracker.py` - Usage recording service
- `models_billing.py` - Subscription and billing models
- `requirements.md` - Requirements 5, 16, 17 (quota enforcement)
- `design.md` - Middleware design specification
