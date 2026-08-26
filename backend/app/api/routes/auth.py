"""Authenticated user bootstrap routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from ...auth.middleware import get_request_principal
from ...services.firebase_users import FirebaseUserBootstrapError, bootstrap_user
from ..schemas import AuthBootstrapResponse, UserProfile

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/bootstrap", response_model=AuthBootstrapResponse)
async def bootstrap_authenticated_user(request: Request) -> AuthBootstrapResponse:
    principal = get_request_principal(request)
    try:
        result = await run_in_threadpool(bootstrap_user, principal)
    except FirebaseUserBootstrapError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None
    return AuthBootstrapResponse(
        user=UserProfile(
            uid=result.user.uid,
            email=result.user.email,
            display_name=result.user.display_name,
            photo_url=result.user.photo_url,
            provider=result.user.provider,
            created_at=result.user.created_at,
            updated_at=result.user.updated_at,
            last_sign_in_at=result.user.last_sign_in_at,
        ),
        is_new_user=result.is_new_user,
    )
