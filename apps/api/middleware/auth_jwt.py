import logging
from uuid import UUID

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from core.config import get_settings
from core.context import AuthContext, RequestContext
from core.dependencies import load_auth_context
from core.security import AuthError, decode_supabase_jwt, extract_bearer_token
from database import SessionLocal

logger = logging.getLogger("mkchain.auth")

PUBLIC_PATHS = {
    "/",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        path = request.url.path

        if path in PUBLIC_PATHS or path.startswith("/docs"):
            return await call_next(request)

        token = extract_bearer_token(request.headers.get("Authorization"))
        org_header = request.headers.get("X-Org-Id")

        ctx: RequestContext = getattr(request.state, "ctx", RequestContext(request_id="unknown"))

        if token:
            try:
                payload = decode_supabase_jwt(token)
                user_id = UUID(str(payload["sub"]))
                async with SessionLocal() as db:
                    auth = await load_auth_context(db, user_id, org_header)
                ctx = RequestContext(request_id=ctx.request_id, auth=auth)
                request.state.ctx = ctx
            except AuthError as exc:
                return JSONResponse(status_code=401, content={"detail": str(exc)})
            except HTTPException as exc:
                return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
            except Exception:
                logger.exception("auth_context_load_failed")
                return JSONResponse(status_code=500, content={"detail": "Authentication failed"})

        elif settings.require_auth:
            return JSONResponse(status_code=401, content={"detail": "Authentication required"})

        request.state.ctx = ctx
        return await call_next(request)
