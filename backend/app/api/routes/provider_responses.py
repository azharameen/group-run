"""Response conversion and error mapping for provider configuration routes."""

from fastapi import HTTPException

from ...providers.adapters import CatalogResult
from ...providers.service import ProviderSelectionError
from ..schemas import ProviderCatalogGroup, ProviderConfigResponse, ProviderModel


def provider_response(record: dict) -> ProviderConfigResponse:
    """Return public provider metadata without encrypted credentials."""
    return ProviderConfigResponse(
        **{key: record.get(key) for key in ProviderConfigResponse.model_fields}
    )


def catalog_response(record: dict, result: CatalogResult) -> ProviderCatalogGroup:
    """Combine safe provider metadata with a live discovery result."""
    return ProviderCatalogGroup(
        **record,
        available=result.available,
        message=result.message,
        models=[ProviderModel(**model.__dict__) for model in result.models],
    )


def catalog_group_response(group: dict) -> ProviderCatalogGroup:
    """Convert a grouped catalog record to its public API representation."""
    return ProviderCatalogGroup(
        **{
            **{
                key: group[key]
                for key in ("provider_id", "provider", "name", "endpoint", "is_enabled")
            },
            "available": group["available"],
            "message": group["message"],
            "models": [ProviderModel(**model) for model in group["models"]],
        }
    )


def provider_error(exc: Exception) -> HTTPException:
    """Map selection and ownership failures to the public provider contract."""
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ProviderSelectionError):
        return HTTPException(status_code=409, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))
