"""Secrets management API router."""

from fastapi import APIRouter, HTTPException, Query

from models.secret import SecretCreate, SecretListResponse, SecretScope, SecretUpdate
from services.secret_service import get_secret_service

router = APIRouter(prefix="/secrets", tags=["secrets"])


@router.get("", response_model=SecretListResponse)
async def list_secrets(
    scope: SecretScope | None = Query(None),
    scope_id: str | None = Query(None),
):
    """List secrets (values are never returned)."""
    service = get_secret_service()
    secrets = service.list_secrets(scope=scope, scope_id=scope_id)
    return {"secrets": secrets, "total": len(secrets)}


@router.post("", status_code=201)
async def create_secret(data: SecretCreate):
    """Create a new secret."""
    try:
        service = get_secret_service()
        return service.create_secret(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{secret_id}")
async def update_secret(secret_id: str, data: SecretUpdate):
    """Update a secret."""
    service = get_secret_service()
    result = service.update_secret(secret_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Secret not found")
    return result


@router.delete("/{secret_id}", status_code=204)
async def delete_secret(secret_id: str):
    """Delete a secret."""
    service = get_secret_service()
    if not service.delete_secret(secret_id):
        raise HTTPException(status_code=404, detail="Secret not found")
