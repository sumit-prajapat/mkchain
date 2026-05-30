"""
backend/services/api_keys/manager.py
        {
            "uid": user_id, "meta": f'{{"key_id": "{key_id}"}}'},
        )
  - list (prefixes only)
  - revoke
  - validate (used by auth middleware)
"""

import hashlib
import secrets
import string
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


# ─── Key format: mk_live_<32 random chars> ───────────────────────────────────

PREFIX = "mk_live_"
KEY_LENGTH = 32
ALPHABET = string.ascii_letters + string.digits


def _generate_raw_key() -> str:
    """Returns a cryptographically random key. NEVER stored — only shown once."""
    suffix = "".join(secrets.choice(ALPHABET) for _ in range(KEY_LENGTH))
    return f"{PREFIX}{suffix}"


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def _prefix_of(raw_key: str) -> str:
    """First 16 chars shown in dashboard so user can identify the key."""
    return raw_key[:16] + "…"


# ─── Public service functions ─────────────────────────────────────────────────

async def create_api_key(
    db: AsyncSession,
    user_id: str,
    name: str = "Default key",
    expires_at: Optional[datetime] = None,
) -> dict:
    """
    Create a new API key.
    Returns the raw key ONCE — the caller must show it to the user immediately.
    Only the hash is persisted.
    """
    # Enforce per-plan key limit
    count_result = await db.execute(
        text("SELECT COUNT(*) FROM api_keys WHERE user_id = :uid AND is_active = true"),
        {"uid": user_id},
    )
    active_count = count_result.scalar()

    # Fetch plan limit
    limit_result = await db.execute(
        text("""
            SELECT pl.api_keys_limit
            FROM profiles pr
            JOIN plans pl ON pl.id = pr.plan_id
            WHERE pr.id = :uid
        """),
        {"uid": user_id},
    )
    key_limit = limit_result.scalar() or 1

    if active_count >= key_limit:
        raise ValueError(
            f"Your plan allows a maximum of {key_limit} active API key(s). "
            "Revoke an existing key or upgrade your plan."
        )

    raw_key = _generate_raw_key()
    key_hash = _hash_key(raw_key)
    key_prefix = _prefix_of(raw_key)

    result = await db.execute(
        text("""
            INSERT INTO api_keys (user_id, name, key_prefix, key_hash, expires_at)
            VALUES (:uid, :name, :prefix, :hash, :exp)
            RETURNING id, name, key_prefix, created_at
        """),
        {
            "uid": user_id,
            "name": name,
            "prefix": key_prefix,
            "hash": key_hash,
            "exp": expires_at,
        },
    )
    await db.commit()
    row = result.mappings().first()

    # Also write audit log
    await db.execute(
        text("""
            INSERT INTO audit_logs (user_id, action, metadata)
            VALUES (:uid, 'api_key_created', :meta)
        """),
        {"uid": user_id, "meta": f'{{"key_name": "{name}", "key_id": "{row["id"]}"}}'}, 
    )
    await db.commit()

    return {
        "id": str(row["id"]),
        "name": row["name"],
        "key_prefix": row["key_prefix"],
        "raw_key": raw_key,           # ← show ONCE, then discard
        "created_at": row["created_at"].isoformat(),
    }


async def list_api_keys(db: AsyncSession, user_id: str) -> list[dict]:
    """Return all keys for the user. Never returns the hash or raw key."""
    result = await db.execute(
        text("""
            SELECT id, name, key_prefix, is_active, last_used_at, expires_at, created_at
            FROM api_keys
            WHERE user_id = :uid
            ORDER BY created_at DESC
        """),
        {"uid": user_id},
    )
    rows = result.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "key_prefix": r["key_prefix"],
            "is_active": r["is_active"],
            "last_used_at": r["last_used_at"].isoformat() if r["last_used_at"] else None,
            "expires_at": r["expires_at"].isoformat() if r["expires_at"] else None,
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


async def revoke_api_key(db: AsyncSession, user_id: str, key_id: str) -> bool:
    """Soft-delete: sets is_active = false. Returns True if key was found."""
    result = await db.execute(
        text("""
            UPDATE api_keys
            SET is_active = false
            WHERE id = :kid AND user_id = :uid
            RETURNING id
        """),
        {"kid": key_id, "uid": user_id},
    )
    await db.commit()
    found = result.fetchone() is not None

    if found:
        await db.execute(
            text("""
                INSERT INTO audit_logs (user_id, action, metadata)
                VALUES (:uid, 'api_key_revoked', :meta)
            """),
            {"uid": user_id, "meta": f'{{"key_id": "{key_id}"}}'},
        )
        await db.commit()

    return found
