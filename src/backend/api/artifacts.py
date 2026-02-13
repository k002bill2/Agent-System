"""Workflow artifacts API router."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import Response

from services.artifact_service import get_artifact_service

router = APIRouter(tags=["artifacts"])


@router.get("/workflows/runs/{run_id}/artifacts")
async def list_artifacts(run_id: str):
    """List artifacts for a workflow run."""
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
):
    """Upload an artifact for a workflow run."""
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
async def get_artifact(artifact_id: str):
    """Get artifact metadata."""
    service = get_artifact_service()
    artifact = service.get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
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
async def download_artifact(artifact_id: str):
    """Download artifact file."""
    service = get_artifact_service()
    artifact = service.get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    data = service.get_artifact_data(artifact_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Artifact file not found")

    return Response(
        content=data,
        media_type=artifact["content_type"],
        headers={"Content-Disposition": f'attachment; filename="{artifact["name"]}"'},
    )


@router.delete("/workflows/artifacts/{artifact_id}", status_code=204)
async def delete_artifact(artifact_id: str):
    """Delete an artifact."""
    service = get_artifact_service()
    if not service.delete_artifact(artifact_id):
        raise HTTPException(status_code=404, detail="Artifact not found")
