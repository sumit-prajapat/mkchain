import logging
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from core.context import RequestContext

logger = logging.getLogger("mkchain.request")


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = request_id
        request.state.ctx = RequestContext(request_id=request_id)

        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response
