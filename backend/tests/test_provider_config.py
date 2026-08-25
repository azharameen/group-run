"""Focused tests for provider credential safety and validation."""

import pytest
from app.providers.service import ProviderConfigService


def test_invalid_provider_is_rejected():
    with pytest.raises(ValueError, match="Unsupported provider"):
        ProviderConfigService._validate({"provider": "unknown", "model": "x"})


def test_provider_key_is_required():
    with pytest.raises(ValueError, match="API key is required"):
        ProviderConfigService._validate({"provider": "openai", "model": "gpt-4o", "credentials": {}})
