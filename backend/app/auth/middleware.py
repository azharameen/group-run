"""Streaming-safe Firebase authentication middleware."""

from __future__ import annotations

import logging

from fastapi import HTTPException, Request
from starlette.datastructures import Headers
from starlette.responses import JSONResponse

from .models import AuthenticatedPrincipal
from .verifier import AuthenticationError, verify_request_headers

logger = logging.getLogger(__name__)

PUBLIC_API_PATHS = frozenset(("/api/health", "/api/ready"))


def is_public_api_path(path: str) -> bool:
    return path in PUBLIC_API_PATHS


def get_request_principal(request: Request) -> AuthenticatedPrincipal:
    principal = getattr(request.state, "principal", None)
    if not isinstance(principal, AuthenticatedPrincipal):
        raise HTTPException(status_code=500, detail="Authenticated principal unavailable")
    return principal


class FirebaseAuthenticationMiddleware:
    """Protect all API routes except explicit public endpoints and OPTIONS."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        method = scope.get("method", "").upper()
        if method == "OPTIONS" or not path.startswith("/api") or is_public_api_path(path):
            await self.app(scope, receive, send)
            return

        try:
            principal = verify_request_headers(Headers(scope=scope))
        except AuthenticationError as exc:
            log_level = logging.WARNING if exc.status_code < 500 else logging.ERROR
            logger.log(
                log_level,
                "Request authentication failed path=%s method=%s code=%s status=%s",
                path,
                method,
                exc.code,
                exc.status_code,
            )
            response = JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.public_detail},
                headers=exc.headers,
            )
            await response(scope, receive, send)
            return

        scope.setdefault("state", {})["principal"] = principal
        await self.app(scope, receive, send)
