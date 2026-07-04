"""LLM access profile and entitlement API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from models.llm_access import (
    LLMAccessResponse,
    LLMCLIProfileCreate,
    LLMCLIProfileHealthCheckResponse,
    LLMCLIProfileResponse,
    LLMCLIProfileUpdate,
    LLMEntitlementCreate,
    LLMEntitlementResponse,
    LLMEntitlementUpdate,
)
from services.llm_access_service import (
    check_cli_profile_health,
    create_cli_profile,
    create_entitlement,
    default_access_response,
    delete_cli_profile,
    get_access_for_user,
    list_cli_profiles,
    list_entitlements,
    update_cli_profile,
    update_entitlement,
)

try:
    from api.deps import (
        get_current_admin_or_manager_user,
        get_current_user,
        get_db_session,
    )

    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False
    get_current_user = None  # type: ignore[assignment]
    get_current_admin_or_manager_user = None  # type: ignore[assignment]
    get_db_session = None  # type: ignore[assignment]


router = APIRouter(prefix="/llm-access", tags=["llm-access"])


def _user_id(user) -> str:
    return str(getattr(user, "id", "anonymous"))


if AUTH_AVAILABLE:

    @router.get("/me", response_model=LLMAccessResponse)
    async def get_my_llm_access(
        organization_id: str | None = Query(default=None),
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> LLMAccessResponse:
        """Return current user's CLI-first LLM access state."""
        return await get_access_for_user(
            db,
            _user_id(current_user),
            organization_id=organization_id,
        )

    @router.get("/profiles", response_model=list[LLMCLIProfileResponse])
    async def get_cli_profiles(
        owner_user_id: str | None = Query(default=None),
        organization_id: str | None = Query(default=None),
        provider: str | None = Query(default=None),
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> list[LLMCLIProfileResponse]:
        """List CLI profiles for admin/manager Settings screens."""
        return await list_cli_profiles(
            db,
            owner_user_id=owner_user_id,
            organization_id=organization_id,
            provider=provider,
        )

    @router.post("/profiles", response_model=LLMCLIProfileResponse, status_code=201)
    async def add_cli_profile(
        body: LLMCLIProfileCreate,
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> LLMCLIProfileResponse:
        """Create a CLI profile for a user or organization."""
        owner_user_id = body.owner_user_id
        if owner_user_id is None and body.organization_id is None:
            owner_user_id = _user_id(current_user)
        return await create_cli_profile(
            db,
            body,
            owner_user_id=owner_user_id,
        )

    @router.patch("/profiles/{profile_id}", response_model=LLMCLIProfileResponse)
    async def patch_cli_profile(
        profile_id: str,
        body: LLMCLIProfileUpdate,
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> LLMCLIProfileResponse:
        """Patch a CLI profile."""
        updated = await update_cli_profile(db, profile_id, body)
        if updated is None:
            raise HTTPException(status_code=404, detail="CLI profile not found")
        return updated

    @router.delete(
        "/profiles/{profile_id}",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    async def remove_cli_profile(
        profile_id: str,
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> Response:
        """Delete a persisted CLI profile."""
        deleted = await delete_cli_profile(db, profile_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="CLI profile not found")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.post(
        "/profiles/{profile_id}/health-check",
        response_model=LLMCLIProfileHealthCheckResponse,
    )
    async def probe_cli_profile_health(
        profile_id: str,
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> LLMCLIProfileHealthCheckResponse:
        """Run a short CLI auth/command health check for a profile."""
        result = await check_cli_profile_health(
            db,
            profile_id,
            fallback_user_id=_user_id(current_user),
        )
        if result is None:
            raise HTTPException(status_code=404, detail="CLI profile not found")
        return result

    @router.get("/entitlements", response_model=list[LLMEntitlementResponse])
    async def get_entitlements(
        user_id: str | None = Query(default=None),
        organization_id: str | None = Query(default=None),
        provider: str | None = Query(default=None),
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> list[LLMEntitlementResponse]:
        """List user/org LLM entitlements."""
        return await list_entitlements(
            db,
            user_id=user_id,
            organization_id=organization_id,
            provider=provider,
        )

    @router.post("/entitlements", response_model=LLMEntitlementResponse, status_code=201)
    async def add_entitlement(
        body: LLMEntitlementCreate,
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> LLMEntitlementResponse:
        """Create a user/org LLM entitlement."""
        return await create_entitlement(db, body)

    @router.patch("/entitlements/{entitlement_id}", response_model=LLMEntitlementResponse)
    async def patch_entitlement(
        entitlement_id: str,
        body: LLMEntitlementUpdate,
        current_user=Depends(get_current_admin_or_manager_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> LLMEntitlementResponse:
        """Patch a user/org LLM entitlement."""
        updated = await update_entitlement(db, entitlement_id, body)
        if updated is None:
            raise HTTPException(status_code=404, detail="Entitlement not found")
        return updated

else:

    @router.get("/me", response_model=LLMAccessResponse)  # type: ignore[misc]
    async def get_my_llm_access() -> LLMAccessResponse:  # type: ignore[misc]
        """Return default LLM access when auth is unavailable."""
        return default_access_response("anonymous")

    @router.get("/profiles", response_model=list[LLMCLIProfileResponse])  # type: ignore[misc]
    async def get_cli_profiles() -> list[LLMCLIProfileResponse]:  # type: ignore[misc]
        return []

    @router.get("/entitlements", response_model=list[LLMEntitlementResponse])  # type: ignore[misc]
    async def get_entitlements() -> list[LLMEntitlementResponse]:  # type: ignore[misc]
        return []

    @router.post(
        "/profiles/{profile_id}/health-check",
        response_model=LLMCLIProfileHealthCheckResponse,
    )  # type: ignore[misc]
    async def probe_cli_profile_health(  # type: ignore[misc]
        profile_id: str,
    ) -> LLMCLIProfileHealthCheckResponse:
        result = await check_cli_profile_health(
            None,
            profile_id,
            fallback_user_id="anonymous",
        )
        if result is None:
            raise HTTPException(status_code=404, detail="CLI profile not found")
        return result
