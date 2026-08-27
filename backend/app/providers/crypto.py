"""Credential encryption for user-managed provider configurations."""

from __future__ import annotations

import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings


class CredentialCipher:
    """Encrypt and decrypt credential payloads without logging their content."""

    def __init__(self, key: str | None = None):
        configured_key = key if key is not None else settings.provider_credentials_encryption_key
        if not configured_key:
            raise RuntimeError("Provider credential encryption is not configured")
        try:
            self._fernet = Fernet(configured_key.encode())
        except (TypeError, ValueError) as exc:
            raise RuntimeError("Provider credential encryption key is invalid") from exc

    def encrypt(self, credentials: dict[str, Any]) -> str:
        payload = json.dumps(credentials, separators=(",", ":"), sort_keys=True).encode()
        return self._fernet.encrypt(payload).decode()

    def decrypt(self, encrypted_payload: str) -> dict[str, Any]:
        try:
            decoded = self._fernet.decrypt(encrypted_payload.encode())
            value = json.loads(decoded)
        except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RuntimeError("Stored provider credentials cannot be decrypted") from exc
        if not isinstance(value, dict):
            raise RuntimeError("Stored provider credentials are invalid")  # noqa: TRY004
        return value
