# Task 4: Organization Filtering Verification

## Changes Made

Updated `routes/analysis.py` to add organization-based data isolation for all analysis endpoints.

### Modified Endpoints

#### 1. POST /api/analyze
- **Added**: `request: Request` parameter to access JWT context
- **Validation**: Checks for `org_id` and `user_id` from `request.state`
- **Filtering**: Queries for existing analyses filtered by `org_id`
- **Insert**: New analyses created with both `org_id` and `user_id`

#### 2. GET /api/analyses
- **Added**: `request: Request` parameter
- **Validation**: Checks for `org_id` from `request.state`
- **Filtering**: Returns only analyses belonging to the user's organization

#### 3. GET /api/analyses/{analysis_id}
- **Added**: `request: Request` parameter
- **Validation**: Checks for `org_id` from `request.state`
- **Filtering**: Queries analysis by both `id` AND `org_id`
- **Security**: Returns 404 if analysis doesn't belong to organization (prevents data leakage)

#### 4. DELETE /api/analyses/{analysis_id}
- **Added**: `request: Request` parameter
- **Validation**: Checks for `org_id` from `request.state`
- **Filtering**: Queries analysis by both `id` AND `org_id`
- **Security**: Returns 404 if analysis doesn't belong to organization (prevents unauthorized deletion)

### Code Changes Summary

```python
# Added imports
from fastapi import APIRouter, Depends, HTTPException, Request  # Added Request
import uuid  # Added for UUID conversion

# Example: POST /api/analyze
async def analyze_wallet(req: AnalyzeRequest, request: Request, db: Session = Depends(get_db)):
    # Extract org context from JWT (set by middleware)
    org_id = request.state.organization_id
    user_id = request.state.user_id
    
    if not org_id or not user_id:
        raise HTTPException(status_code=401, detail="Missing organization or user context")
    
    # Filter existing analyses by organization
    existing = db.query(WalletAnalysis).filter(
        WalletAnalysis.address == address,
        WalletAnalysis.chain   == chain,
        WalletAnalysis.org_id  == uuid.UUID(org_id),  # MULTI-TENANT FILTER
    ).order_by(WalletAnalysis.created_at.desc()).first()
    
    # Create new analysis with org context
    analysis = WalletAnalysis(
        org_id       = uuid.UUID(org_id),    # SET ORG ID
        user_id      = uuid.UUID(user_id),   # SET USER ID
        address      = address,
        # ... rest of fields
    )
```

## Security Guarantees

### Data Isolation
✅ **Read Isolation**: Users can only see analyses from their organization
✅ **Write Isolation**: New analyses are always tagged with the user's organization
✅ **Update Isolation**: N/A (no update endpoint)
✅ **Delete Isolation**: Users can only delete analyses from their organization

### Attack Prevention
✅ **ID Enumeration**: Querying analysis by ID returns 404 if not in user's org (prevents discovery of other org IDs)
✅ **Unauthorized Access**: All operations require valid JWT with org_id
✅ **Missing Context**: Operations fail with 401 if org_id is missing from JWT

## Testing Verification

### Manual Testing Steps

1. **Test Organization Isolation**:
   ```bash
   # User A (org_id = org-123)
   curl -X POST http://localhost:8000/api/analyze \
     -H "Authorization: Bearer <TOKEN_ORG_123>" \
     -H "Content-Type: application/json" \
     -d '{"address": "0x123...", "chain": "eth", "hops": 2}'
   # Returns analysis_id = 1
   
   # User B (org_id = org-456) - different organization
   curl -X GET http://localhost:8000/api/analyses/1 \
     -H "Authorization: Bearer <TOKEN_ORG_456>"
   # Should return 404 (not 403 to prevent enumeration)
   ```

2. **Test List Filtering**:
   ```bash
   # User A creates 3 analyses
   # User B creates 2 analyses
   
   # User A lists analyses
   curl -X GET http://localhost:8000/api/analyses \
     -H "Authorization: Bearer <TOKEN_ORG_123>"
   # Should return 3 analyses
   
   # User B lists analyses
   curl -X GET http://localhost:8000/api/analyses \
     -H "Authorization: Bearer <TOKEN_ORG_456>"
   # Should return 2 analyses (not 5)
   ```

3. **Test Delete Isolation**:
   ```bash
   # User A deletes their analysis (analysis_id = 1)
   curl -X DELETE http://localhost:8000/api/analyses/1 \
     -H "Authorization: Bearer <TOKEN_ORG_123>"
   # Should return 200 OK
   
   # User B tries to delete User A's analysis
   curl -X DELETE http://localhost:8000/api/analyses/1 \
     -H "Authorization: Bearer <TOKEN_ORG_456>"
   # Should return 404 (already deleted, but would also return 404 if existed)
   ```

### Expected Behavior

| Endpoint | User Org | Target Org | Expected Result |
|----------|----------|------------|-----------------|
| POST /api/analyze | org-A | N/A | Creates analysis with org_id=org-A |
| GET /api/analyses | org-A | N/A | Returns only org-A analyses |
| GET /api/analyses/123 | org-A | org-A | Returns analysis 123 |
| GET /api/analyses/123 | org-A | org-B | Returns 404 |
| DELETE /api/analyses/123 | org-A | org-A | Deletes analysis 123 |
| DELETE /api/analyses/123 | org-A | org-B | Returns 404 |

## Integration with Middleware

This implementation depends on Task 3 (JWT authentication middleware):

```python
# middleware/auth.py sets these values:
request.state.user_id = payload.get('sub')
request.state.organization_id = payload.get('organization_id')

# routes/analysis.py reads these values:
org_id = request.state.organization_id
user_id = request.state.user_id
```

### JWT Token Structure Expected

```json
{
  "sub": "user-uuid-123",
  "organization_id": "org-uuid-456",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234571490
}
```

## Database Schema

The implementation uses existing columns in the `wallet_analyses` table:

```python
# models.py
class WalletAnalysis(Base):
    __tablename__ = "wallet_analyses"
    id       = Column(Integer, primary_key=True, index=True)
    org_id   = Column(UUID(as_uuid=True), nullable=False, index=True)  # Used for filtering
    user_id  = Column(UUID(as_uuid=True), nullable=False, index=True)  # Used for tracking
    # ... rest of fields
```

**Important**: The column is named `org_id` in the model (not `organization_id`).

## Verification Checklist

- [x] All route handlers accept `Request` parameter
- [x] All SELECT queries filter by `org_id`
- [x] All INSERT operations set `org_id` and `user_id`
- [x] Missing org_id/user_id raises 401 error
- [x] Cross-organization access returns 404 (not 403)
- [x] Code passes Python syntax validation
- [x] Documentation added for multi-tenant behavior

## Next Steps

After this task:
1. **Task 5**: Update reports routes with organization filtering
2. **Task 6**: Update alerts routes with organization filtering
3. **Task 10**: Comprehensive testing with JWT tokens
4. **Task 32**: Apply Supabase RLS policies as additional security layer

## Notes

- The `uuid` module is used to convert string org_id/user_id to UUID objects for database queries
- Error messages don't distinguish between "not found" and "not authorized" to prevent information leakage
- The middleware must be registered before these routes work (already done in main.py)
- Organization ID is extracted from JWT `organization_id` claim (not from query params or body)
