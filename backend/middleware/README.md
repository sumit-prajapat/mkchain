# Authentication Middleware

## Overview

This directory contains JWT authentication middleware for securing API endpoints using Supabase Auth.

## Files

- `auth.py` - Main middleware implementation
- `__init__.py` - Package exports

## How It Works

1. **Health Check Bypass**: The `/` endpoint (health check) is accessible without authentication
2. **JWT Validation**: All other endpoints require a valid JWT token in the Authorization header
3. **User Context**: Successfully validated tokens populate `request.state` with:
   - `user_id` - User's unique identifier (from JWT 'sub' claim)
   - `organization_id` - User's organization for multi-tenant data isolation

## Configuration

Set the `SUPABASE_JWT_SECRET` environment variable:

```bash
# In .env file
SUPABASE_JWT_SECRET=your_supabase_jwt_secret_here
```

You can find this secret in your Supabase Dashboard:
1. Go to Project Settings
2. Navigate to API section
3. Copy the JWT Secret

## Usage in Routes

Access the authenticated user context in your route handlers:

```python
from fastapi import APIRouter, Request

router = APIRouter()

@router.get("/api/analyses")
async def get_analyses(request: Request):
    user_id = request.state.user_id
    org_id = request.state.organization_id
    
    # Filter by organization for multi-tenant isolation
    analyses = db.query(Analysis).filter(
        Analysis.organization_id == org_id
    ).all()
    
    return analyses
```

## Testing

Run the middleware tests:

```bash
cd apps/api
python test_middleware.py
```

## Error Responses

- **401 Unauthorized**: Returned when:
  - Authorization header is missing
  - Authorization header format is invalid (not "Bearer <token>")
  - JWT token is invalid or expired
  - JWT signature verification fails

## Security Notes

- JWT secret must be kept secure and never committed to version control
- Tokens are validated on every request
- Failed authentication attempts return 401 immediately
- Health check endpoint (/) is public for monitoring purposes
