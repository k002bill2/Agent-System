"""리모트 관리·fetch/pull/push 모델."""

from pydantic import BaseModel


class GitRemote(BaseModel):
    """Git remote information."""

    name: str
    url: str
    fetch_url: str | None = None
    push_url: str | None = None


class RemoteListResponse(BaseModel):
    """Response for remote list endpoint."""

    remotes: list[GitRemote]


class RemoteAddRequest(BaseModel):
    """Request to add a new remote."""

    name: str
    url: str


class RemoteUpdateRequest(BaseModel):
    """Request to update a remote."""

    new_name: str | None = None
    url: str | None = None


class RemoteOperationResult(BaseModel):
    """Result of a remote operation."""

    success: bool
    message: str = ""


class FetchResult(BaseModel):
    """Result of git fetch operation."""

    success: bool
    remote: str
    branches_updated: list[str] = []
    new_branches: list[str] = []
    message: str = ""


class PullResult(BaseModel):
    """Result of git pull operation."""

    success: bool
    remote: str
    branch: str
    commits_pulled: int = 0
    files_changed: int = 0
    message: str = ""


class PushResult(BaseModel):
    """Result of git push operation."""

    success: bool
    remote: str
    branch: str
    commits_pushed: int = 0
    message: str = ""
