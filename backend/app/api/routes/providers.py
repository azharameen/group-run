"""Authenticated user-scoped LLM provider configuration API."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from ...auth.middleware import get_request_principal
from ...providers.service import ProviderConfigService, ProviderSelectionError
from ..schemas import (
    ProviderCatalogGroup,
    ProviderCatalogResponse,
    ProviderConfigRequest,
    ProviderConfigResponse,
    ProviderDefaultRequest,
    ProviderDefaultResponse,
    ProviderEnabledRequest,
    ProviderListResponse,
    ProviderTestResponse,
)
from .provider_responses import (
    catalog_group_response,
    catalog_response,
    provider_error,
    provider_response,
)

router = APIRouter(prefix="/api/providers", tags=["providers"])
service = ProviderConfigService()


@router.get("", response_model=ProviderListResponse)
async def list_providers(request: Request) -> ProviderListResponse:
    records = await service.list_safe(get_request_principal(request).uid)
    return ProviderListResponse(
        providers=[provider_response(record) for record in records],
        count=len(records),
    )


@router.get("/catalog", response_model=ProviderCatalogResponse)
async def list_catalog(request: Request) -> ProviderCatalogResponse:
    groups = await service.grouped_catalog(get_request_principal(request).uid)
    return ProviderCatalogResponse(groups=[catalog_group_response(group) for group in groups])


@router.get("/default", response_model=ProviderDefaultResponse | None)
async def get_default(request: Request) -> ProviderDefaultResponse | None:
    default = await service.get_default(get_request_principal(request).uid)
    return ProviderDefaultResponse(**default) if default else None


@router.put("/default", response_model=ProviderDefaultResponse)
async def set_default(
    payload: ProviderDefaultRequest, request: Request
) -> ProviderDefaultResponse:
    try:
        default = await service.set_default(
            get_request_principal(request).uid, payload.provider_id, payload.model_id
        )
        return ProviderDefaultResponse(**default)
    except (LookupError, ValueError, RuntimeError) as exc:
        raise provider_error(exc) from exc


@router.get("/{provider_id}", response_model=ProviderConfigResponse)
async def get_provider(provider_id: str, request: Request) -> ProviderConfigResponse:
    principal = get_request_principal(request)
    record = await service.get_safe(principal.uid, provider_id)
    if not record:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider_response(record)


@router.get("/{provider_id}/models", response_model=ProviderCatalogGroup)
async def get_provider_models(provider_id: str, request: Request) -> ProviderCatalogGroup:
    principal = get_request_principal(request)
    try:
        record = await service.get_safe(principal.uid, provider_id)
        if not record:
            raise LookupError("Provider not found")
        return catalog_response(record, await service.catalog(principal.uid, provider_id))
    except (LookupError, ValueError, RuntimeError) as exc:
        raise provider_error(exc) from exc


@router.post("", response_model=ProviderConfigResponse, status_code=201)
async def create_provider(payload: ProviderConfigRequest, request: Request) -> ProviderConfigResponse:
    try:
        return provider_response(await service.save(get_request_principal(request).uid, payload.model_dump()))
    except (LookupError, ValueError, RuntimeError) as exc:
        raise provider_error(exc) from exc


@router.put("/{provider_id}", response_model=ProviderConfigResponse)
async def update_provider(
    provider_id: str, payload: ProviderConfigRequest, request: Request
) -> ProviderConfigResponse:
    try:
        return provider_response(
            await service.save(get_request_principal(request).uid, payload.model_dump(), provider_id)
        )
    except (LookupError, ValueError, RuntimeError) as exc:
        raise provider_error(exc) from exc


@router.patch("/{provider_id}/enabled", response_model=ProviderConfigResponse)
async def set_provider_enabled(
    provider_id: str, payload: ProviderEnabledRequest, request: Request
) -> ProviderConfigResponse:
    record = await service.set_enabled(
        get_request_principal(request).uid, provider_id, payload.is_enabled
    )
    if not record:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider_response(record)


@router.post("/{provider_id}/test", response_model=ProviderTestResponse)
async def test_provider(provider_id: str, request: Request) -> ProviderTestResponse:
    principal = get_request_principal(request)
    try:
        record = await service.get_safe(principal.uid, provider_id)
        if not record:
            raise LookupError("Provider not found")
        success, message = await service.test(principal.uid, provider_id)
        return ProviderTestResponse(
            provider_id=provider_id, provider=record["provider"], success=success, message=message
        )
    except (LookupError, ValueError, RuntimeError) as exc:
        raise provider_error(exc) from exc


@router.delete("/{provider_id}", status_code=204)
async def delete_provider(provider_id: str, request: Request) -> Response:
    try:
        deleted = await service.delete(get_request_principal(request).uid, provider_id)
    except ProviderSelectionError as exc:
        raise provider_error(exc) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Provider not found")
    return Response(status_code=204)
