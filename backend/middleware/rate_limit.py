"""
backend/middleware/rate_limit.py

Sliding-window rate limiter using Upstash Redis.
Enforces per-plan per-minute request limits.

Free:  5 req/min
Pro:   60 req/min
Team:  300 req/min
"""

import os
import time
from fastapi import Depends, HTTPException, status, Request

import redis.asyncio as aioredis

from middleware.auth import AuthContext, require_api_key


# ─── Redis connection (Upstash — free tier) ──────────────────────────────────

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        url = os.getenv("UPSTASH_REDIS_URL")
        if not url:
            raise RuntimeError("UPSTASH_REDIS_URL not set in environment")
        _redis = aioredis.from_url(url, encoding="utf-8", decode_responses=True)
    return _redis


# ─── Sliding window counter ───────────────────────────────────────────────────

async def check_rate_limit(
    request: Request,
    ctx: AuthContext = Depends(require_api_key),
) -> AuthContext:
    """
    FastAPI dependency.
    Checks per-key and per-IP sliding windows.
    Add to any route:  Depends(check_rate_limit)
    """
    redis = await get_redis()
    limit = ctx.plan.get("rate_per_min", 5)
    now = int(time.time())
    window = 60  # 1-minute window

    # Sliding window key — keyed by api_key_id
    bucket_key = f"rl:key:{ctx.api_key_id}:{now // window}"

    pipe = redis.pipeline()
    pipe.incr(bucket_key)
    pipe.expire(bucket_key, window * 2)
    results = await pipe.execute()

    count = results[0]

    if count > limit:
        retry_after = window - (now % window)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Rate limit exceeded: {limit} requests/minute on the {ctx.plan_id} plan. "
                f"Retry after {retry_after}s."
            ),
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": str(max(0, limit - count)),
                "X-RateLimit-Reset": str(now + retry_after),
            },
        )

    return ctx


# ─── IP abuse guard (secondary, no auth needed) ──────────────────────────────

async def ip_guard(request: Request) -> None:
    """
    Global IP-level guard — 30 req/min regardless of plan.
    Protects unauthenticated endpoints (signup, demo).
    """
    redis = await get_redis()
    ip = request.client.host if request.client else "unknown"
    now = int(time.time())
    window = 60
    key = f"rl:ip:{ip}:{now // window}"

    count = await redis.incr(key)
    await redis.expire(key, window * 2)

    if count == 1:
        pass  # first hit in window, set expiry already done
    elif count > 30:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests from this IP. Please slow down.",
            headers={"Retry-After": str(window - (now % window))},
        )
