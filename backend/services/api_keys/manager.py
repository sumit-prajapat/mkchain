"""Compatibility shim to match import path `services.api_keys.manager`.

Re-exports the implementation in `api_keys_manager.py`.
"""
from .api_keys_manager import create_api_key, list_api_keys, revoke_api_key

__all__ = ["create_api_key", "list_api_keys", "revoke_api_key"]
