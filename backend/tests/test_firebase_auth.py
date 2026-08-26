"""Firebase authentication and bootstrap tests."""

from __future__ import annotations

import copy
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from firebase_admin import auth as firebase_auth

from app.api.app import create_app
from app.auth.models import AuthenticatedPrincipal


class FakeDocumentSnapshot:
    def __init__(self, data):
        self._data = copy.deepcopy(data) if data is not None else None

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> dict:
        return copy.deepcopy(self._data) if self._data is not None else {}


class FakeDocumentReference:
    def __init__(self, client: "FakeFirestoreClient", path: str):
        self._client = client
        self._path = path

    def get(self, transaction=None) -> FakeDocumentSnapshot:
        with self._client.lock:
            return FakeDocumentSnapshot(self._client.documents.get(self._path))

    def set(self, data: dict, merge: bool = False) -> None:
        with self._client.lock:
            existing = copy.deepcopy(self._client.documents.get(self._path, {}))
            payload = self._client.resolve_server_timestamps(data)
            self._client.documents[self._path] = {**existing, **payload} if merge else payload


class FakeCollectionReference:
    def __init__(self, client: "FakeFirestoreClient", name: str):
        self._client = client
        self._name = name

    def document(self, document_id: str) -> FakeDocumentReference:
        return FakeDocumentReference(self._client, f"{self._name}/{document_id}")


class FakeTransaction:
    def __init__(self, client: "FakeFirestoreClient"):
        self.client = client

    def set(self, reference: FakeDocumentReference, data: dict, merge: bool = False) -> None:
        reference.set(data, merge=merge)


class FakeFirestoreClient:
    def __init__(self):
        self.documents: dict[str, dict] = {}
        self.lock = threading.RLock()
        self.server_timestamp_sentinel = object()
        self._base_time = datetime(2026, 1, 1, tzinfo=UTC)
        self._tick = 0

    def collection(self, name: str) -> FakeCollectionReference:
        return FakeCollectionReference(self, name)

    def transaction(self) -> FakeTransaction:
        return FakeTransaction(self)

    def resolve_server_timestamps(self, data: dict) -> dict:
        resolved = {}
        for key, value in data.items():
            resolved[key] = self.next_timestamp() if value is self.server_timestamp_sentinel else value
        return resolved

    def next_timestamp(self) -> datetime:
        self._tick += 1
        return self._base_time + timedelta(seconds=self._tick)

    def seed_user(self, uid: str, data: dict) -> None:
        with self.lock:
            self.documents[f"users/{uid}"] = copy.deepcopy(data)

    def read_user(self, uid: str) -> dict | None:
        with self.lock:
            record = self.documents.get(f"users/{uid}")
            return copy.deepcopy(record) if record is not None else None


def _install_fake_firestore(monkeypatch, fake_firestore: FakeFirestoreClient) -> None:
    import app.services.firebase_users as firebase_users

    def fake_transactional(function):
        def wrapper(transaction, *args, **kwargs):
            with transaction.client.lock:
                return function(transaction, *args, **kwargs)

        return wrapper

    monkeypatch.setattr(firebase_users, "get_firestore_client", lambda: fake_firestore)
    monkeypatch.setattr(firebase_users.firestore, "SERVER_TIMESTAMP", fake_firestore.server_timestamp_sentinel)
    monkeypatch.setattr(firebase_users.firestore, "transactional", fake_transactional)


def test_public_health_endpoint_skips_auth(disable_auto_auth_headers):
    with TestClient(create_app()) as client:
        response = client.get("/api/health")

    assert response.status_code == 200


def test_public_ready_endpoint_skips_auth(monkeypatch, disable_auto_auth_headers):
    monkeypatch.setattr("app.api.routes.health.get_pg_checkpointer", AsyncMock(return_value=object()))

    with TestClient(create_app()) as client:
        response = client.get("/api/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_options_preflight_skips_auth(disable_auto_auth_headers):
    with TestClient(create_app()) as client:
        response = client.options(
            "/api/threads",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200


def test_missing_token_returns_sanitized_401(disable_auto_auth_headers):
    with TestClient(create_app()) as client:
        response = client.get("/api/threads")

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}
    assert response.headers["www-authenticate"] == "Bearer"


def test_missing_token_keeps_cors_headers(disable_auto_auth_headers):
    with TestClient(create_app()) as client:
        response = client.get(
            "/api/threads",
            headers={"Origin": "http://localhost:3000"},
        )

    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_malformed_bearer_token_returns_sanitized_401(disable_auto_auth_headers):
    with TestClient(create_app()) as client:
        response = client.get("/api/threads", headers={"Authorization": "Token no-thanks"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}


def test_invalid_token_returns_sanitized_401(firebase_token_claims, auth_headers, disable_auto_auth_headers):
    firebase_token_claims["invalid-token"] = ValueError("raw firebase exception")

    with TestClient(create_app()) as client:
        response = client.get("/api/threads", headers=auth_headers("invalid-token"))

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}
    assert "raw firebase exception" not in response.text


def test_expired_token_returns_sanitized_401(firebase_token_claims, auth_headers, disable_auto_auth_headers):
    firebase_token_claims["expired-token"] = firebase_auth.ExpiredIdTokenError(
        "expired token raw detail",
        None,
    )

    with TestClient(create_app()) as client:
        response = client.get("/api/threads", headers=auth_headers("expired-token"))

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}
    assert "expired token raw detail" not in response.text


def test_revoked_token_returns_sanitized_401(firebase_token_claims, auth_headers, disable_auto_auth_headers):
    firebase_token_claims["revoked-token"] = firebase_auth.RevokedIdTokenError("revoked token raw detail")

    with TestClient(create_app()) as client:
        response = client.get("/api/threads", headers=auth_headers("revoked-token"))

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}


def test_disabled_user_returns_sanitized_401(firebase_token_claims, auth_headers, disable_auto_auth_headers):
    firebase_token_claims["disabled-token"] = firebase_auth.UserDisabledError(
        "disabled user raw detail",
        None,
    )

    with TestClient(create_app()) as client:
        response = client.get("/api/threads", headers=auth_headers("disabled-token"))

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}


def test_non_google_provider_returns_sanitized_401(
    firebase_token_claims,
    auth_headers,
    disable_auto_auth_headers,
):
    firebase_token_claims["password-token"] = {
        "uid": "password-user",
        "sub": "password-user",
        "email": "password@example.com",
        "firebase": {"sign_in_provider": "password"},
    }

    with TestClient(create_app()) as client:
        response = client.get("/api/threads", headers=auth_headers("password-token"))

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}


def test_protected_sse_requires_auth(disable_auto_auth_headers):
    with TestClient(create_app()) as client:
        response = client.get("/api/sse")

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}


def test_protected_sse_accepts_valid_token(monkeypatch):
    async def fake_subscribe():
        yield 'data: {"type":"ping"}\n\n'

    monkeypatch.setattr("app.api.routes.sse._bus.subscribe", fake_subscribe)

    with TestClient(create_app()) as client:
        response = client.get("/api/sse")

    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert '{"type":"ping"}' in response.text


def test_bootstrap_creates_new_user_from_verified_claims(monkeypatch):
    fake_firestore = FakeFirestoreClient()
    _install_fake_firestore(monkeypatch, fake_firestore)

    with TestClient(create_app()) as client:
        response = client.post("/api/auth/bootstrap")

    assert response.status_code == 200
    body = response.json()
    assert body["is_new_user"] is True
    assert body["user"]["uid"] == "test-user-123"
    assert body["user"]["email"] == "test@example.com"
    assert body["user"]["display_name"] == "Test User"
    assert body["user"]["photo_url"] == "https://example.com/avatar.png"
    assert body["user"]["provider"] == "google.com"
    stored = fake_firestore.read_user("test-user-123")
    assert stored is not None
    assert stored["email_verified"] is True


def test_bootstrap_refreshes_existing_user_and_preserves_created_at(monkeypatch):
    fake_firestore = FakeFirestoreClient()
    _install_fake_firestore(monkeypatch, fake_firestore)
    original_created_at = datetime(2025, 6, 1, 12, 30, tzinfo=UTC)
    fake_firestore.seed_user(
        "test-user-123",
        {
            "uid": "test-user-123",
            "email": "old@example.com",
            "display_name": "Old Name",
            "photo_url": None,
            "provider": "password",
            "created_at": original_created_at,
            "updated_at": datetime(2025, 6, 1, 12, 31, tzinfo=UTC),
            "last_sign_in_at": datetime(2025, 6, 1, 12, 32, tzinfo=UTC),
        },
    )

    with TestClient(create_app()) as client:
        response = client.post("/api/auth/bootstrap")

    assert response.status_code == 200
    body = response.json()
    assert body["is_new_user"] is False
    assert body["user"]["created_at"] == original_created_at.isoformat()
    assert body["user"]["email"] == "test@example.com"
    assert body["user"]["display_name"] == "Test User"
    assert body["user"]["provider"] == "google.com"


def test_bootstrap_user_concurrency_returns_only_one_new_user(monkeypatch):
    fake_firestore = FakeFirestoreClient()
    _install_fake_firestore(monkeypatch, fake_firestore)

    from app.services.firebase_users import bootstrap_user

    principal = AuthenticatedPrincipal.from_claims(
        {
            "uid": "concurrent-user",
            "sub": "concurrent-user",
            "email": "concurrent@example.com",
            "firebase": {"sign_in_provider": "google.com"},
        }
    )

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(bootstrap_user, principal) for _ in range(2)]
        results = [future.result() for future in futures]

    assert sorted(result.is_new_user for result in results) == [False, True]
    stored = fake_firestore.read_user("concurrent-user")
    assert stored is not None
    assert stored["uid"] == "concurrent-user"
