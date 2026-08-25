"""Focused tests for provider credential safety and validation."""

import pytest
from app.providers.encryption import CredentialEncryption
from app.providers.service import ProviderConfigService
from cryptography.fernet import Fernet


def test_credentials_are_authenticated_and_not_plaintext():
    encryption = CredentialEncryption(Fernet.generate_key())
    ciphertext = encryption.encrypt({"api_key": "do-not-leak"})
    assert "do-not-leak" not in ciphertext
    assert encryption.decrypt(ciphertext) == {"api_key": "do-not-leak"}


def test_invalid_provider_is_rejected():
    with pytest.raises(ValueError, match="Unsupported provider"):
        ProviderConfigService._validate({"provider": "unknown", "model": "x"})


def test_provider_key_is_required():
    with pytest.raises(ValueError, match="API key is required"):
        ProviderConfigService._validate({"provider": "openai", "model": "gpt-4o", "credentials": {}})
