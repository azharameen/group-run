"""Firestore-backed authenticated user bootstrap."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from firebase_admin import firestore

from ..auth.firebase import get_firestore_client
from ..auth.models import AuthBootstrapResult, AuthenticatedPrincipal, UserProfile


class FirebaseUserBootstrapError(RuntimeError):
    """Raised when the authenticated user profile cannot be prepared safely."""


def _build_user_document(
    principal: AuthenticatedPrincipal,
    existing: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "uid": principal.uid,
        "email": principal.email,
        "email_verified": principal.email_verified,
        "display_name": principal.display_name,
        "photo_url": principal.photo_url,
        "provider": principal.provider,
        "created_at": existing.get("created_at", firestore.SERVER_TIMESTAMP),
        "updated_at": firestore.SERVER_TIMESTAMP,
        "last_sign_in_at": firestore.SERVER_TIMESTAMP,
    }


def bootstrap_user(principal: AuthenticatedPrincipal) -> AuthBootstrapResult:
    now = datetime.now(UTC)
    try:
        client = get_firestore_client()
        doc_ref = client.collection("users").document(principal.uid)

        @firestore.transactional
        def _upsert(transaction, reference):
            snapshot = reference.get(transaction=transaction)
            existing = snapshot.to_dict() if snapshot.exists else {}
            is_new_user = not snapshot.exists
            transaction.set(
                reference,
                _build_user_document(principal, existing),
                merge=True,
            )
            return is_new_user

        is_new_user = _upsert(client.transaction(), doc_ref)
        persisted_snapshot = doc_ref.get()
        document = persisted_snapshot.to_dict() if persisted_snapshot.exists else {}
        return AuthBootstrapResult(
            user=UserProfile.from_firestore(principal, document, fallback_now=now),
            is_new_user=is_new_user,
        )
    except FirebaseUserBootstrapError:
        raise
    except (RuntimeError, ValueError, TypeError):
        raise FirebaseUserBootstrapError("User profile unavailable") from None
