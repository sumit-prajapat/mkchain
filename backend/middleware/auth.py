"""Compatibility shim: expose `require_api_key` and `AuthContext` as `middleware.auth`.

This keeps the existing import paths used across the codebase while the
primary implementation lives in `middleware_auth.py`.
"""
from .middleware_auth import require_api_key, AuthContext

__all__ = ["require_api_key", "AuthContext"]
