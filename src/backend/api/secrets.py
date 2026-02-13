"""Secrets management API router — admin-only, DB-backed."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_admin_user, get_db_session
from db.models import UserModel
from models.secret import SecretCreate, SecretListResponse, SecretScope, SecretUpdate
from services.secret_service import SecretService

router = APIRouter(prefix="/secrets", tags=["secrets"])


def _get_service(db: AsyncSession = Depends(get_db_session)) -> SecretService:
    return SecretService(db)


@router.get("", response_model=SecretListResponse)
async def list_secrets(
    scope: SecretScope | None = Query(None),
    scope_id: str | None = Query(None),
    _user: UserModel = Depends(get_current_admin_user),
    service: SecretService = Depends(_get_service),
):
    """List secrets (values are never returned). Admin only."""
    secrets = await service.list_secrets(scope=scope, scope_id=scope_id)
    return {"secrets": secrets, "total": len(secrets)}


@router.post("", status_code=201)
async def create_secret(
    data: SecretCreate,
    current_user: UserModel = Depends(get_current_admin_user),
    service: SecretService = Depends(_get_service),
):
    """Create a new secret. Admin only."""
    try:
        return await service.create_secret(data, user_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{secret_id}")
async def update_secret(
    secret_id: str,
    data: SecretUpdate,
    _user: UserModel = Depends(get_current_admin_user),
    service: SecretService = Depends(_get_service),
):
    """Update a secret. Admin only."""
    result = await service.update_secret(secret_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Secret not found")
    return result


@router.delete("/{secret_id}", status_code=204)
async def delete_secret(
    secret_id: str,
    _user: UserModel = Depends(get_current_admin_user),
    service: SecretService = Depends(_get_service),
):
    """Delete a secret. Admin only."""
    if not await service.delete_secret(secret_id):
        raise HTTPException(status_code=404, detail="Secret not found")
