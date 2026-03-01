"""LLM Credentials REST API endpoints (CRUD + verify)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import UserModel
from models.external_usage import (
    LLMCredentialCreate,
    LLMCredentialResponse,
    LLMCredentialUpdate,
    LLMCredentialVerifyResponse,
)
from services.credential_service import (
    create_credential,
    delete_credential,
    list_user_credentials,
    update_credential,
    verify_credential,
)

try:
    from api.deps import get_current_user, get_db_session

    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False
    get_current_user = None  # type: ignore[assignment]
    get_db_session = None  # type: ignore[assignment]

router = APIRouter(
    prefix="/users/me/llm-credentials",
    tags=["llm-credentials"],
)


def _get_user_id(current_user: UserModel | None) -> str:
    """Extract user_id string from the current user (or fall back to 'anonymous')."""
    if current_user is None:
        return "anonymous"
    return str(current_user.id)


if AUTH_AVAILABLE:

    @router.get("", response_model=list[LLMCredentialResponse])
    async def list_credentials(
        current_user: UserModel = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> list[LLMCredentialResponse]:
        """Return all active LLM credentials for the authenticated user (keys masked)."""
        user_id = _get_user_id(current_user)
        return await list_user_credentials(db, user_id)

    @router.post("", response_model=LLMCredentialResponse, status_code=201)
    async def add_credential(
        body: LLMCredentialCreate,
        current_user: UserModel = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> LLMCredentialResponse:
        """Store a new LLM API key for the authenticated user."""
        user_id = _get_user_id(current_user)
        return await create_credential(db, user_id, body)

    @router.put("/{credential_id}", response_model=LLMCredentialResponse)
    async def edit_credential(
        credential_id: str,
        body: LLMCredentialUpdate,
        current_user: UserModel = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> LLMCredentialResponse:
        """Update key_name and/or api_key for an existing credential."""
        user_id = _get_user_id(current_user)
        updated = await update_credential(db, user_id, credential_id, body)
        if not updated:
            raise HTTPException(status_code=404, detail="Credential not found")
        return updated

    @router.delete("/{credential_id}", status_code=204)
    async def remove_credential(
        credential_id: str,
        current_user: UserModel = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> Response:
        """Soft-delete a credential (deactivate). Returns 404 if not found or not owned."""
        user_id = _get_user_id(current_user)
        deleted = await delete_credential(db, user_id, credential_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Credential not found")
        return Response(status_code=204)

    @router.post(
        "/{credential_id}/verify",
        response_model=LLMCredentialVerifyResponse,
    )
    async def verify_credential_endpoint(
        credential_id: str,
        current_user: UserModel = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> LLMCredentialVerifyResponse:
        """Test whether the stored API key is valid by making a live API call."""
        user_id = _get_user_id(current_user)
        return await verify_credential(db, user_id, credential_id)

else:

    @router.get("", response_model=list[LLMCredentialResponse])
    async def list_credentials() -> list[LLMCredentialResponse]:  # type: ignore[misc]
        """Return all active LLM credentials (auth unavailable – returns empty list)."""
        return []

    @router.post("", response_model=LLMCredentialResponse, status_code=201)
    async def add_credential(body: LLMCredentialCreate) -> LLMCredentialResponse:  # type: ignore[misc]
        raise HTTPException(status_code=503, detail="Auth service unavailable")

    @router.put("/{credential_id}", response_model=LLMCredentialResponse)
    async def edit_credential(credential_id: str, body: LLMCredentialUpdate) -> LLMCredentialResponse:  # type: ignore[misc]
        raise HTTPException(status_code=503, detail="Auth service unavailable")

    @router.delete("/{credential_id}", status_code=204)
    async def remove_credential(credential_id: str) -> Response:  # type: ignore[misc]
        raise HTTPException(status_code=503, detail="Auth service unavailable")

    @router.post(
        "/{credential_id}/verify",
        response_model=LLMCredentialVerifyResponse,
    )
    async def verify_credential_endpoint(credential_id: str) -> LLMCredentialVerifyResponse:  # type: ignore[misc]
        raise HTTPException(status_code=503, detail="Auth service unavailable")
