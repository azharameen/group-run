"""Safe app-wide LLM provider configuration API."""

from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Response, status

from ...config import settings
from ...providers.service import ProviderConfigService
from ..schemas import (
    ProviderConfigRequest,
    ProviderConfigResponse,
    ProviderCredentialsRequest,
    ProviderListResponse,
    ProviderTestResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/providers", tags=["providers"])
service = ProviderConfigService()


def _require_operator(token: str | None) -> None:
    """Protect all secret-bearing operations while authentication is deferred."""
    expected = settings.provider_config_admin_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Provider administration is not enabled; configure PROVIDER_CONFIG_ADMIN_TOKEN",
        )
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid provider admin token")


def _safe(record: dict) -> ProviderConfigResponse:
    values = {k: record.get(k) for k in (
        "provider_id", "provider", "name", "endpoint", "model", "is_active",
        "has_credentials", "created_at", "updated_at",
    )}
    values["has_credentials"] = bool(values["has_credentials"])
    return ProviderConfigResponse(**values)


@router.get("", response_model=ProviderListResponse)
async def list_providers() -> ProviderListResponse:
    records = await service.list_safe()
    return ProviderListResponse(providers=[_safe(r) for r in records], count=len(records))


@router.get("/{provider_id}", response_model=ProviderConfigResponse)
async def get_provider(provider_id: str) -> ProviderConfigResponse:
    record = await service.get_safe(provider_id)
    if not record:
        raise HTTPException(status_code=404, detail="Provider not found")
    return _safe(record)


@router.post("", response_model=ProviderConfigResponse, status_code=201)
async def create_provider(
    payload: ProviderConfigRequest,
    x_provider_config_admin_token: str | None = Header(default=None),
) -> ProviderConfigResponse:
    _require_operator(x_provider_config_admin_token)
    try:
        return _safe(await service.save(payload.model_dump()))
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/{provider_id}", response_model=ProviderConfigResponse)
@router.patch("/{provider_id}", response_model=ProviderConfigResponse)
async def update_provider(
    provider_id: str,
    payload: ProviderConfigRequest,
    x_provider_config_admin_token: str | None = Header(default=None),
) -> ProviderConfigResponse:
    _require_operator(x_provider_config_admin_token)
    if not await service.get_safe(provider_id):
        raise HTTPException(status_code=404, detail="Provider not found")
    try:
        return _safe(await service.save(payload.model_dump(), provider_id))
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{provider_id}", status_code=204)
async def delete_provider(
    provider_id: str,
    x_provider_config_admin_token: str | None = Header(default=None),
) -> Response:
    _require_operator(x_provider_config_admin_token)
    if not await service.delete(provider_id):
        raise HTTPException(status_code=404, detail="Provider not found")
    return Response(status_code=204)


@router.post("/{provider_id}/activate", response_model=ProviderConfigResponse)
async def activate_provider(
    provider_id: str,
    x_provider_config_admin_token: str | None = Header(default=None),
) -> ProviderConfigResponse:
    _require_operator(x_provider_config_admin_token)
    record = await service.activate(provider_id)
    if not record:
        raise HTTPException(status_code=404, detail="Provider not found")
    return _safe(record)


@router.post("/{provider_id}/test", response_model=ProviderTestResponse)
async def test_provider(
    provider_id: str,
    payload: ProviderCredentialsRequest | None = None,
    x_provider_config_admin_token: str | None = Header(default=None),
) -> ProviderTestResponse:
    _require_operator(x_provider_config_admin_token)
    try:
        record = await service.get_safe(provider_id)
        if not record:
            raise LookupError("Provider not found")
        supplied_credentials = None
        if payload:
            supplied_credentials = payload.credentials
            if supplied_credentials is None and payload.api_key:
                supplied_credentials = {"api_key": payload.api_key}
        success, message = await service.test(provider_id, supplied_credentials)
        return ProviderTestResponse(
            provider_id=provider_id, provider=record["provider"], success=success, message=message,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
