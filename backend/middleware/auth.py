"""
JWT Authentication Middleware for Supabase

This middleware validates JWT tokens from Supabase Auth and extracts
user_id and organization_id for multi-tenant data isolation.

Demo Mode: When DEMO_MODE=true in .env, allows unauthenticated access
with a default demo user/org context.
"""

from fastapi import Request, HTTPException
from jose import jwt, JWTError
import os
import uuid


SUPABASE_JWT_SECRET = os.getenv('SUPABASE_JWT_SECRET')
DEMO_MODE = os.getenv('DEMO_MODE', 'false').lower() == 'true'

# Demo/public endpoints that don't require authentication
PUBLIC_PATHS = [
    '/',
    '/docs',
    '/openapi.json',
    '/api/darkweb/stats',
    '/api/darkweb/search',
    '/api/darkweb/entities',
    '/api/invites',  # Invite acceptance needs to be public
]


async def auth_middleware(request: Request, call_next):
    """
    Middleware to validate Supabase JWT tokens and extract user context.
    
    Skips authentication for:
    - Health check endpoint (/)
    - API documentation
    - Public OSINT endpoints
    - Demo mode (if enabled)
    
    For authenticated routes:
    - Extracts JWT from Authorization header
    - Validates JWT signature using SUPABASE_JWT_SECRET
    - Extracts user_id (from 'sub' claim) and organization_id
    - Adds to request.state for use in route handlers
    
    Returns 401 for missing or invalid tokens.
    """
    # Skip auth for public paths
    if any(request.url.path.startswith(path) for path in PUBLIC_PATHS):
        return await call_next(request)
    
    # DEMO MODE: Allow unauthenticated access with demo context
    if DEMO_MODE:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            # No auth header - set demo context
            request.state.user_id = 'demo-user'
            request.state.organization_id = 'demo-org'
            request.state.is_demo = True
            return await call_next(request)
    
    # Extract JWT token
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        raise HTTPException(
            status_code=401,
            detail='Missing or invalid authorization header'
        )
    
    token = auth_header.replace('Bearer ', '')
    
    # Validate JWT
    try:
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=['HS256'])
        request.state.user_id = payload.get('sub')
        request.state.organization_id = payload.get('organization_id')
        request.state.is_demo = False
    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail=f'Invalid token: {str(e)}'
        )
    
    return await call_next(request)
