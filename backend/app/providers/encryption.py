"""Authenticated encryption for provider credentials."""

from __future__ import annotations

import json
import os
from typing import Any

from cryptography.fernet import Fernet, InvalidToken


class CredentialEncryption:
    """Encrypt credentials without ever exposing plaintext in repository data."""

    def __init__(self, key: str | bytes | None = None):
        raw = key or os.environ.get("PROVIDER_CONFIG_ENCRYPTION_KEY") or os.environ.get(
            "PROVIDER_CREDENTIALS_ENCRYPTION_KEY", ""
        )
        if not raw:
            raise RuntimeError(
                "PROVIDER_CONFIG_ENCRYPTION_KEY must be configured before saving credentials"
            )
        try:
            self._fernet = Fernet(raw.encode() if isinstance(raw, str) else raw)
        except (ValueError, TypeError) as exc:
            raise RuntimeError("PROVIDER_CONFIG_ENCRYPTION_KEY is not a valid Fernet key") from exc

    def encrypt(self, credentials: dict[str, Any]) -> str:
        payload = json.dumps(credentials, sort_keys=True, separators=(",", ":")).encode()
        return self._fernet.encrypt(payload).decode()

    def decrypt(self, ciphertext: str) -> dict[str, Any]:
        try:
            value = json.loads(self._fernet.decrypt(ciphertext.encode()).decode())
        except (InvalidToken, ValueError, TypeError, json.JSONDecodeError) as exc:
            raise ValueError("Stored provider credentials could not be decrypted") from exc
        if not isinstance(value, dict):
            raise ValueError("Stored provider credentials are malformed")  # noqa: TRY004
        return value
