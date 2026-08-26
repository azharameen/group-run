"""Bearer token parsing and Firebase verification."""

from __future__ import annotations

from dataclasses import dataclass
from http import HTTPStatus

from firebase_admin import auth
from starlette.datastructures import Headers

from . import firebase as firebase_client
from .models import AuthenticatedPrincipal


@dataclass(frozen=True, slots=True)
class AuthenticationError(Exception):
    code: str
    public_detail: str = "Authentication required"
    status_code: int = HTTPStatus.UNAUTHORIZED

    @property
    def headers(self) -> dict[str, str]:
        if self.status_code == HTTPStatus.UNAUTHORIZED:
            return {"WWW-Authenticate": "Bearer"}
        return {}


def _extract_bearer_token(headers: Headers) -> str:
    authorization = headers.get("authorization")
    if not authorization:
        raise AuthenticationError(code="missing_token")

    parts = authorization.strip().split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise AuthenticationError(code="malformed_token")
    return parts[1].strip()


def verify_request_headers(headers: Headers) -> AuthenticatedPrincipal:
    token = _extract_bearer_token(headers)
    try:
        claims = firebase_client.verify_firebase_token(token)
        principal = AuthenticatedPrincipal.from_claims(claims)
        if principal.provider != "google.com":
            raise AuthenticationError(code="unsupported_provider")
        return principal
    except AuthenticationError:
        raise
    except auth.ExpiredIdTokenError:
        raise AuthenticationError(code="expired_token") from None
    except auth.RevokedIdTokenError:
        raise AuthenticationError(code="revoked_token") from None
    except auth.UserDisabledError:
        raise AuthenticationError(code="disabled_user") from None
    except (auth.InvalidIdTokenError, ValueError):
        raise AuthenticationError(code="invalid_token") from None
    except RuntimeError:
        raise AuthenticationError(
            code="auth_unavailable",
            public_detail="Authentication service unavailable",
            status_code=HTTPStatus.SERVICE_UNAVAILABLE,
        ) from None
    except Exception:
        raise AuthenticationError(
            code="auth_unavailable",
            public_detail="Authentication service unavailable",
            status_code=HTTPStatus.SERVICE_UNAVAILABLE,
        ) from None
