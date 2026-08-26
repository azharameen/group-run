"""Typed Firebase authentication models."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Mapping


def _string_or_none(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def _isoformat(value: Any, *, fallback: datetime | None = None) -> str:
    if isinstance(value, datetime):
        timestamp = value
    elif isinstance(value, str) and value.strip():
        return value
    else:
        timestamp = fallback or datetime.now(UTC)

    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    return timestamp.astimezone(UTC).isoformat()


@dataclass(frozen=True, slots=True)
class AuthenticatedPrincipal:
    uid: str
    email: str | None
    email_verified: bool
    display_name: str | None
    photo_url: str | None
    provider: str
    claims: Mapping[str, Any]

    @classmethod
    def from_claims(cls, claims: Mapping[str, Any]) -> "AuthenticatedPrincipal":
        uid = _string_or_none(claims.get("uid")) or _string_or_none(claims.get("sub"))
        if not uid:
            raise ValueError("Verified token missing uid")

        firebase_claims = claims.get("firebase")
        provider = "custom"
        if isinstance(firebase_claims, Mapping):
            provider = _string_or_none(firebase_claims.get("sign_in_provider")) or provider

        return cls(
            uid=uid,
            email=_string_or_none(claims.get("email")),
            email_verified=bool(claims.get("email_verified")),
            display_name=_string_or_none(claims.get("name")),
            photo_url=_string_or_none(claims.get("picture")),
            provider=provider,
            claims=dict(claims),
        )


@dataclass(frozen=True, slots=True)
class UserProfile:
    uid: str
    email: str | None
    display_name: str | None
    photo_url: str | None
    provider: str
    created_at: str
    updated_at: str
    last_sign_in_at: str

    @classmethod
    def from_firestore(
        cls,
        principal: AuthenticatedPrincipal,
        document: Mapping[str, Any],
        *,
        fallback_now: datetime | None = None,
    ) -> "UserProfile":
        now = fallback_now or datetime.now(UTC)
        return cls(
            uid=principal.uid,
            email=_string_or_none(document.get("email")) or principal.email,
            display_name=_string_or_none(document.get("display_name")) or principal.display_name,
            photo_url=_string_or_none(document.get("photo_url")) or principal.photo_url,
            provider=_string_or_none(document.get("provider")) or principal.provider,
            created_at=_isoformat(document.get("created_at"), fallback=now),
            updated_at=_isoformat(document.get("updated_at"), fallback=now),
            last_sign_in_at=_isoformat(document.get("last_sign_in_at"), fallback=now),
        )


@dataclass(frozen=True, slots=True)
class AuthBootstrapResult:
    user: UserProfile
    is_new_user: bool
