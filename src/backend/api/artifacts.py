"""Workflow artifacts API router."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user, get_db_session
from api.workflow_authz import authorize_run
from db.models import UserModel
from services.artifact_service import get_artifact_service

router = APIRouter(tags=["artifacts"], dependencies=[Depends(get_current_user)])


async def _authorize_artifact(
    artifact_id: str,
    current_user: UserModel,
    db: AsyncSession,
    min_role: str = "viewer",
) -> dict:
    """Load an artifact and authorize it through its run's owning project."""
    service = get_artifact_service()
    artifact = service.get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    run_id = artifact.get("run_id")
    if not isinstance(run_id, str):
        raise HTTPException(status_code=404, detail="Run not found")
    await authorize_run(run_id, current_user, db, min_role=min_role)
    return artifact


@router.get("/workflows/runs/{run_id}/artifacts")
async def list_artifacts(
    run_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: UserModel = Depends(get_current_user),
):
    """List artifacts for a workflow run."""
    await authorize_run(run_id, current_user, db)
    service = get_artifact_service()
    artifacts = service.list_artifacts(run_id)
    return {
        "artifacts": [
            {
                "id": a["id"],
                "run_id": a["run_id"],
                "job_id": a.get("job_id"),
                "step_id": a.get("step_id"),
                "name": a["name"],
                "path": a["path"],
                "size_bytes": a["size_bytes"],
                "content_type": a["content_type"],
                "retention_days": a["retention_days"],
                "expires_at": a["expires_at"].isoformat() if a.get("expires_at") else None,
                "created_at": a["created_at"].isoformat(),
            }
            for a in artifacts
        ],
        "total": len(artifacts),
    }


@router.post("/workflows/runs/{run_id}/artifacts", status_code=201)
async def upload_artifact(
    run_id: str,
    file: UploadFile = File(...),
    name: str = Form(None),
    job_id: str = Form(None),
    step_id: str = Form(None),
    retention_days: int = Form(30),
    db: AsyncSession = Depends(get_db_session),
    current_user: UserModel = Depends(get_current_user),
):
    """Upload an artifact for a workflow run."""
    await authorize_run(run_id, current_user, db, min_role="editor")
    service = get_artifact_service()
    data = await file.read()
    artifact_name = name or file.filename or "artifact"
    artifact = service.create_artifact(
        run_id=run_id,
        name=artifact_name,
        data=data,
        content_type=file.content_type or "application/octet-stream",
        job_id=job_id,
        step_id=step_id,
        retention_days=retention_days,
    )
    return {
        "id": artifact["id"],
        "run_id": artifact["run_id"],
        "name": artifact["name"],
        "size_bytes": artifact["size_bytes"],
        "content_type": artifact["content_type"],
        "created_at": artifact["created_at"].isoformat(),
    }


@router.get("/workflows/artifacts/{artifact_id}")
async def get_artifact(
    artifact_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: UserModel = Depends(get_current_user),
):
    """Get artifact metadata."""
    artifact = await _authorize_artifact(artifact_id, current_user, db)
    return {
        "id": artifact["id"],
        "run_id": artifact["run_id"],
        "job_id": artifact.get("job_id"),
        "step_id": artifact.get("step_id"),
        "name": artifact["name"],
        "path": artifact["path"],
        "size_bytes": artifact["size_bytes"],
        "content_type": artifact["content_type"],
        "retention_days": artifact["retention_days"],
        "expires_at": artifact["expires_at"].isoformat() if artifact.get("expires_at") else None,
        "created_at": artifact["created_at"].isoformat(),
    }


@router.get("/workflows/artifacts/{artifact_id}/download")
async def download_artifact(
    artifact_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: UserModel = Depends(get_current_user),
):
    """Download artifact file."""
    artifact = await _authorize_artifact(artifact_id, current_user, db)

    service = get_artifact_service()
    data = service.get_artifact_data(artifact_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Artifact file not found")

    return Response(
        content=data,
        media_type=artifact["content_type"],
        headers={"Content-Disposition": f'attachment; filename="{artifact["name"]}"'},
    )


@router.delete("/workflows/artifacts/{artifact_id}", status_code=204)
async def delete_artifact(
    artifact_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: UserModel = Depends(get_current_user),
):
    """Delete an artifact."""
    await _authorize_artifact(artifact_id, current_user, db, min_role="editor")
    service = get_artifact_service()
    if not service.delete_artifact(artifact_id):
        raise HTTPException(status_code=404, detail="Artifact not found")
