# Project Org Access Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 조직(Organization) 기반 프로젝트 등록 권한 및 노출 제어 구현 — admin/owner 역할의 조직 관리자만 프로젝트를 등록하고, 같은 조직의 그룹원 목록에서 멤버를 선택해 프로젝트에 접근 권한을 부여한다.

**Architecture:** `ProjectModel`에 `organization_id` 컬럼을 추가하여 소속 조직을 명시하고, 프로젝트 생성 API는 조직 admin/owner만 호출 가능하도록 권한 체크를 추가한다. 프로젝트 목록 조회는 시스템admin=전체, 조직admin=자기 org 소속만, 일반 멤버=ProjectAccess 있는 것만 보이도록 필터링한다. 프론트엔드의 프로젝트 멤버 추가 UI는 기존 "유저 검색+이메일 초대"에서 "같은 조직 멤버 목록 선택"으로 교체한다.

**Tech Stack:** Python/FastAPI, SQLAlchemy 2.0 (asyncpg), PostgreSQL, React/TypeScript, Zustand, Tailwind CSS

---

## 전제 조건

- `USE_DATABASE=true` 환경에서 동작 (JSON fallback도 고려)
- `OrganizationMemberModel.role`: `"owner"` | `"admin"` | `"member"` | `"viewer"`
- `UserModel.role`: `"user"` | `"manager"` | `"admin"` (시스템 레벨)
- **프로젝트 등록 가능한 관리자** = 시스템admin (`UserModel.role == "admin"`) OR 조직에서 `"owner"` 또는 `"admin"` 역할인 사람
- Organization invitation(조직 초대)은 기존 방식 유지

---

### Task 1: DB 스키마 — `projects` 테이블에 `organization_id` 추가

**Files:**
- Modify: `src/backend/db/models.py:1076-1095` (`ProjectModel`)
- Create: `src/backend/db/migrations/add_org_id_to_projects.sql`

**Step 1: `ProjectModel`에 컬럼 추가**

`src/backend/db/models.py`의 `ProjectModel` 클래스를 수정:

```python
class ProjectModel(Base):
    """Project model for DB-managed project registry."""

    __tablename__ = "projects"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    path = Column(String(1000), nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    settings = Column(JSONB, default=dict)

    # Organization ownership
    organization_id = Column(String(36), nullable=True, index=True)  # ← 신규 추가

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    __table_args__: tuple = ()
```

**Step 2: DB 마이그레이션 SQL 파일 생성**

`src/backend/db/migrations/add_org_id_to_projects.sql`:

```sql
-- Add organization_id to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36);

CREATE INDEX IF NOT EXISTS ix_projects_organization_id
ON projects(organization_id);
```

**Step 3: 마이그레이션 실행**

```bash
psql $DATABASE_URL -f src/backend/db/migrations/add_org_id_to_projects.sql
```

Expected: `ALTER TABLE`, `CREATE INDEX`

**Step 4: Commit**

```bash
git add src/backend/db/models.py src/backend/db/migrations/add_org_id_to_projects.sql
git commit -m "feat: add organization_id column to projects table"
```

---

### Task 2: Backend — 헬퍼 함수: 현재 유저의 조직 admin 멤버십 조회

**Files:**
- Modify: `src/backend/api/projects.py` (파일 상단에 헬퍼 함수 추가)

**Step 1: 조직 admin 체크 헬퍼 함수 작성**

`src/backend/api/projects.py`에 다음 헬퍼 함수를 추가 (import 아래 `_slugify` 전):

```python
async def _get_admin_org_ids(user) -> list[str]:
    """유저가 admin/owner인 조직 ID 목록을 반환한다.

    시스템 admin은 특별 처리하지 않음 (호출자가 별도 처리).
    JSON fallback(in-memory)도 지원.
    """
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        return []

    from db.database import async_session_factory
    from db.models import OrganizationMemberModel, OrganizationModel
    from sqlalchemy import and_, select

    admin_roles = {"owner", "admin"}

    async with async_session_factory() as session:
        result = await session.execute(
            select(OrganizationMemberModel.organization_id).where(
                and_(
                    OrganizationMemberModel.user_id == user.id,
                    OrganizationMemberModel.role.in_(admin_roles),
                    OrganizationMemberModel.is_active == True,  # noqa: E712
                )
            )
        )
        db_org_ids = [row[0] for row in result.all()]

    # JSON fallback
    from services.organization_service import OrganizationService
    all_orgs = OrganizationService.list_organizations()
    json_org_ids = []
    for org in all_orgs:
        mem = OrganizationService.get_member_by_user(org.id, user.id)
        if mem:
            role_val = mem.role.value if hasattr(mem.role, "value") else mem.role
            if role_val in admin_roles:
                json_org_ids.append(org.id)

    # 합집합 (순서 유지, 중복 제거)
    seen = set()
    combined = []
    for oid in db_org_ids + json_org_ids:
        if oid not in seen:
            seen.add(oid)
            combined.append(oid)
    return combined
```

**Step 2: Commit**

```bash
git add src/backend/api/projects.py
git commit -m "feat: add _get_admin_org_ids helper for org-level permission check"
```

---

### Task 3: Backend — `create_project` 권한 체크 + org_id 설정

**Files:**
- Modify: `src/backend/api/projects.py:58-124` (`create_project` 함수)
- Modify: `src/backend/models/project.py:166-173` (`DBProjectCreate`)

**Step 1: `DBProjectCreate` 모델에 `organization_id` 필드 추가**

`src/backend/models/project.py`:

```python
class DBProjectCreate(BaseModel):
    """Request to create a DB-managed project."""

    name: str = Field(..., description="Unique project name", min_length=1, max_length=255)
    description: str | None = Field(None, description="Project description")
    path: str | None = Field(None, description="Filesystem path for config scanning")
    settings: dict | None = Field(None, description="Extra settings (JSON)")
    organization_id: str | None = Field(None, description="조직 ID (자동 감지 또는 명시)")
```

**Step 2: `DBProjectResponse`에 `organization_id` 추가**

```python
class DBProjectResponse(BaseModel):
    """Response for a DB-managed project."""

    id: str
    name: str
    slug: str
    description: str | None = None
    path: str | None = None
    is_active: bool = True
    settings: dict = Field(default_factory=dict)
    organization_id: str | None = None  # ← 신규
    created_at: str | None = None
    updated_at: str | None = None
    created_by: str | None = None
```

**Step 3: `_model_to_response` 함수 업데이트**

```python
def _model_to_response(row) -> DBProjectResponse:
    """Convert DB row to response model."""
    return DBProjectResponse(
        id=row.id,
        name=row.name,
        slug=row.slug,
        description=row.description,
        path=row.path,
        is_active=row.is_active,
        settings=row.settings or {},
        organization_id=row.organization_id,  # ← 신규
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
        created_by=row.created_by,
    )
```

**Step 4: `create_project` 함수 교체**

```python
@router.post("", response_model=DBProjectResponse, status_code=201)
async def create_project(
    request: DBProjectCreate,
    current_user: UserModel = Depends(get_current_user),
) -> DBProjectResponse:
    """Create a new project. Only system admins or org admin/owners can create."""
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel

    is_system_admin = current_user.role == "admin" or current_user.is_admin

    # 조직 admin 체크
    admin_org_ids = []
    if not is_system_admin:
        admin_org_ids = await _get_admin_org_ids(current_user)
        if not admin_org_ids:
            raise HTTPException(
                status_code=403,
                detail="프로젝트 등록 권한이 없습니다. 조직의 admin 또는 owner만 등록 가능합니다.",
            )

    # organization_id 결정
    org_id = request.organization_id
    if not is_system_admin:
        if org_id and org_id not in admin_org_ids:
            raise HTTPException(
                status_code=403,
                detail="해당 조직에 대한 admin 권한이 없습니다.",
            )
        if not org_id:
            if len(admin_org_ids) == 1:
                org_id = admin_org_ids[0]
            else:
                # 여러 조직에 속할 경우 클라이언트가 명시해야 함
                raise HTTPException(
                    status_code=400,
                    detail="여러 조직에 속해 있습니다. organization_id를 명시해 주세요.",
                )

    slug = _slugify(request.name)
    project_id = str(uuid.uuid4())

    async with async_session_factory() as session:
        existing = await session.execute(
            select(ProjectModel).where(ProjectModel.name == request.name)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail=f"Project '{request.name}' already exists")

        existing_slug = await session.execute(select(ProjectModel).where(ProjectModel.slug == slug))
        if existing_slug.scalar_one_or_none():
            slug = f"{slug}-{project_id[:8]}"

        project = ProjectModel(
            id=project_id,
            name=request.name,
            slug=slug,
            description=request.description,
            path=request.path,
            is_active=True,
            settings=request.settings or {},
            organization_id=org_id,
            created_by=current_user.id,
        )
        session.add(project)
        await session.flush()

        access = ProjectAccessModel(
            id=str(uuid.uuid4()),
            project_id=project_id,
            user_id=current_user.id,
            role="owner",
            granted_by=current_user.id,
        )
        session.add(access)
        await session.commit()
        await session.refresh(project)

        return _model_to_response(project)
```

**Step 5: Commit**

```bash
git add src/backend/api/projects.py src/backend/models/project.py
git commit -m "feat: restrict project creation to org admin/owner + auto-detect organization_id"
```

---

### Task 4: Backend — `list_active_projects` 조직 기반 필터링

**Files:**
- Modify: `src/backend/api/projects.py:127-186` (`list_active_projects` 함수)

**Step 1: 기존 함수를 아래로 교체**

```python
@router.get("", response_model=DBProjectListResponse)
async def list_active_projects(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> DBProjectListResponse:
    """List active projects filtered by org membership.

    - 시스템admin: 전체 활성 프로젝트
    - 조직admin/owner: 자신의 조직 소속 프로젝트
    - 일반 유저/member: ProjectAccess에 명시된 프로젝트만
    """
    import os
    from sqlalchemy import or_

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel

    async with async_session_factory() as session:
        is_system_admin = current_user.role == "admin" or current_user.is_admin

        if is_system_admin:
            # 시스템 admin: 모든 활성 프로젝트
            result = await session.execute(
                select(ProjectModel)
                .where(ProjectModel.is_active == True)  # noqa: E712
                .order_by(ProjectModel.name)
            )
        else:
            # 조직 admin/owner인 조직 ID 목록
            admin_org_ids = await _get_admin_org_ids(current_user)

            if admin_org_ids:
                # 조직 관리자: 자신의 org 소속 프로젝트 + ProjectAccess 있는 프로젝트
                member_subq = (
                    select(ProjectAccessModel.project_id)
                    .where(ProjectAccessModel.user_id == current_user.id)
                    .scalar_subquery()
                )
                result = await session.execute(
                    select(ProjectModel)
                    .where(
                        ProjectModel.is_active == True,  # noqa: E712
                        or_(
                            ProjectModel.organization_id.in_(admin_org_ids),
                            ProjectModel.id.in_(member_subq),
                        ),
                    )
                    .order_by(ProjectModel.name)
                )
            else:
                # 일반 유저: ProjectAccess에 명시된 것만
                member_subq = (
                    select(ProjectAccessModel.project_id)
                    .where(ProjectAccessModel.user_id == current_user.id)
                    .scalar_subquery()
                )
                result = await session.execute(
                    select(ProjectModel)
                    .where(
                        ProjectModel.is_active == True,  # noqa: E712
                        ProjectModel.id.in_(member_subq),
                    )
                    .order_by(ProjectModel.name)
                )

        projects = result.scalars().all()
        return DBProjectListResponse(
            projects=[_model_to_response(p) for p in projects],
            total_count=len(projects),
        )
```

**Step 2: Commit**

```bash
git add src/backend/api/projects.py
git commit -m "feat: filter project list by org membership (system-admin=all, org-admin=org projects, member=acl only)"
```

---

### Task 5: Backend — `GET /{project_id}/available-members` 신규 엔드포인트

**Files:**
- Modify: `src/backend/api/projects.py` (하단에 신규 엔드포인트 추가)
- Modify: `src/backend/models/project.py` (신규 응답 모델 추가)

**Step 1: 응답 모델 추가 (`src/backend/models/project.py`)**

```python
class OrgMemberForProject(BaseModel):
    """조직 멤버 중 프로젝트에 추가 가능한 사람."""

    user_id: str
    email: str
    name: str | None = None
    org_role: str  # owner, admin, member, viewer


class OrgMemberListResponse(BaseModel):
    """Available org members response."""

    members: list[OrgMemberForProject]
    total_count: int
```

**Step 2: 엔드포인트 추가 (`src/backend/api/projects.py` 하단)**

```python
@router.get("/{project_id}/available-members", response_model=OrgMemberListResponse)
async def list_available_org_members(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
) -> OrgMemberListResponse:
    """프로젝트에 추가 가능한 조직 멤버 목록 반환.

    프로젝트의 organization_id로 org 멤버를 조회하되,
    이미 ProjectAccess에 있는 유저는 제외한다.
    Admin/owner만 호출 가능.
    """
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import OrganizationMemberModel, ProjectAccessModel, ProjectModel
    from db.models import UserModel as UserModelDB
    from sqlalchemy import and_, select

    is_system_admin = current_user.role == "admin" or current_user.is_admin

    async with async_session_factory() as session:
        # 프로젝트 존재 확인
        proj_result = await session.execute(
            select(ProjectModel).where(ProjectModel.id == project_id)
        )
        project = proj_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

        # 권한 확인: system admin 또는 프로젝트 org의 admin/owner
        if not is_system_admin:
            admin_org_ids = await _get_admin_org_ids(current_user)
            if project.organization_id not in admin_org_ids:
                raise HTTPException(status_code=403, detail="Project owner or admin required")

        # 이미 프로젝트에 속한 user_id 집합
        existing_result = await session.execute(
            select(ProjectAccessModel.user_id).where(
                ProjectAccessModel.project_id == project_id
            )
        )
        existing_user_ids = {row[0] for row in existing_result.all()}

        org_id = project.organization_id
        if not org_id:
            # org_id 없는 프로젝트 → 조직 없이 생성된 것, 빈 목록 반환
            return OrgMemberListResponse(members=[], total_count=0)

        # DB org 멤버 조회
        members_result = await session.execute(
            select(OrganizationMemberModel, UserModelDB)
            .join(UserModelDB, OrganizationMemberModel.user_id == UserModelDB.id, isouter=True)
            .where(
                and_(
                    OrganizationMemberModel.organization_id == org_id,
                    OrganizationMemberModel.is_active == True,  # noqa: E712
                )
            )
        )
        rows = members_result.all()

        # JSON fallback 멤버도 포함
        from services.organization_service import OrganizationService
        json_members = OrganizationService.list_members(org_id) or []

        available = []
        seen_user_ids = set()

        for mem, user in rows:
            if mem.user_id in existing_user_ids:
                continue
            if mem.user_id in seen_user_ids:
                continue
            seen_user_ids.add(mem.user_id)
            available.append(
                OrgMemberForProject(
                    user_id=mem.user_id,
                    email=mem.email,
                    name=user.name if user else mem.name,
                    org_role=mem.role,
                )
            )

        for jmem in json_members:
            uid = jmem.user_id if hasattr(jmem, "user_id") else jmem.get("user_id", "")
            if uid in existing_user_ids or uid in seen_user_ids:
                continue
            seen_user_ids.add(uid)
            role_val = jmem.role.value if hasattr(jmem.role, "value") else jmem.role
            available.append(
                OrgMemberForProject(
                    user_id=uid,
                    email=getattr(jmem, "email", ""),
                    name=getattr(jmem, "name", None),
                    org_role=role_val,
                )
            )

        return OrgMemberListResponse(members=available, total_count=len(available))
```

**Step 3: import 추가**

`src/backend/api/projects.py` 상단 import에 추가:

```python
from models.project import (
    ...
    OrgMemberForProject,
    OrgMemberListResponse,
)
```

**Step 4: Commit**

```bash
git add src/backend/api/projects.py src/backend/models/project.py
git commit -m "feat: add GET /{project_id}/available-members endpoint for org member picker"
```

---

### Task 6: Backend — `add_project_member` 유효성 검증 강화

**Files:**
- Modify: `src/backend/api/projects.py:488-552` (`add_project_member` 함수)

**Step 1: 함수에 org 멤버 검증 추가**

`add_project_member` 함수 내부, `access` 객체 생성 직전에 삽입:

```python
        # 프로젝트에 org_id가 있으면, 추가할 유저도 같은 org 멤버인지 검증
        proj_result = await session.execute(
            select(ProjectModel).where(ProjectModel.id == project_id)
        )
        proj = proj_result.scalar_one_or_none()
        if proj and proj.organization_id:
            # DB 체크
            org_mem_result = await session.execute(
                select(OrganizationMemberModel).where(
                    and_(
                        OrganizationMemberModel.organization_id == proj.organization_id,
                        OrganizationMemberModel.user_id == request.user_id,
                        OrganizationMemberModel.is_active == True,  # noqa: E712
                    )
                )
            )
            is_org_member = org_mem_result.scalar_one_or_none() is not None

            if not is_org_member:
                # JSON fallback
                from services.organization_service import OrganizationService
                json_mem = OrganizationService.get_member_by_user(
                    proj.organization_id, request.user_id
                )
                is_org_member = json_mem is not None

            if not is_org_member:
                raise HTTPException(
                    status_code=400,
                    detail="해당 유저는 프로젝트의 조직에 속하지 않습니다. 먼저 조직에 초대해 주세요.",
                )
```

**Step 2: 필요한 import 추가**

함수 상단에 (또는 파일 내부 로컬 import로):

```python
from db.models import OrganizationMemberModel
from sqlalchemy import and_
```

**Step 3: Commit**

```bash
git add src/backend/api/projects.py
git commit -m "feat: validate org membership when adding project member"
```

---

### Task 7: Frontend — `projectAccess` store에 available-members API 추가

**Files:**
- Modify: `src/dashboard/src/stores/projectAccess.ts`

**Step 1: 타입 및 상태 추가**

`projectAccess.ts` 상단 타입 섹션에 추가:

```typescript
export interface OrgMemberForProject {
  user_id: string
  email: string
  name: string | null
  org_role: string  // owner, admin, member, viewer
}
```

**Step 2: store 인터페이스에 추가**

```typescript
interface ProjectAccessState {
  // ... 기존 필드 ...
  availableOrgMembers: OrgMemberForProject[]
  isLoadingAvailableMembers: boolean

  // Actions
  // ... 기존 액션 ...
  fetchAvailableOrgMembers: (projectId: string) => Promise<void>
}
```

**Step 3: 초기값 및 액션 구현 추가**

```typescript
export const useProjectAccessStore = create<ProjectAccessState>((set, get) => ({
  // ... 기존 초기값 ...
  availableOrgMembers: [],
  isLoadingAvailableMembers: false,

  // ... 기존 액션 ...

  fetchAvailableOrgMembers: async (projectId: string) => {
    set({ isLoadingAvailableMembers: true })
    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/project-registry/${projectId}/available-members`
      )
      if (res.ok) {
        const data = await res.json()
        set({ availableOrgMembers: data.members, isLoadingAvailableMembers: false })
      } else {
        set({ availableOrgMembers: [], isLoadingAvailableMembers: false })
      }
    } catch {
      set({ availableOrgMembers: [], isLoadingAvailableMembers: false })
    }
  },
}))
```

**Step 4: Commit**

```bash
git add src/dashboard/src/stores/projectAccess.ts
git commit -m "feat: add fetchAvailableOrgMembers action to projectAccess store"
```

---

### Task 8: Frontend — `ProjectMembersContent` 멤버 추가 UI 교체

**Files:**
- Modify: `src/dashboard/src/components/project-management/ProjectMembersContent.tsx`

**Step 1: import 수정**

기존 `import { X, UserPlus, Loader2, Search, Users, Mail } from 'lucide-react'`에서
`Search`, `Mail`을 제거하고 `ChevronDown`을 추가:

```typescript
import { X, UserPlus, Loader2, Users, ChevronDown } from 'lucide-react'
```

**Step 2: store에서 신규 필드 구독**

```typescript
  const {
    members,
    myAccess,
    loading,
    error,
    invitations,
    isLoadingInvitations,
    availableOrgMembers,       // ← 신규
    isLoadingAvailableMembers, // ← 신규
    fetchMembers,
    addMember,
    updateRole,
    removeMember,
    fetchMyAccess,
    clearError,
    fetchInvitations,
    cancelInvitation,
    fetchAvailableOrgMembers,  // ← 신규
    // inviteByEmail 제거
  } = useProjectAccessStore()
```

**Step 3: 상태 변수 정리**

기존의 `searchQuery`, `userSuggestions`, `selectedUser`, `isSuggestionsOpen`, `isSearching`, `manualUserId`, `inviteEmail`, `inviteRole`, `isInviting`, `inviteError` 상태를 모두 제거하고 아래로 대체:

```typescript
  // Org member picker state
  const [selectedOrgMember, setSelectedOrgMember] = useState<OrgMemberForProject | null>(null)
  const [newRole, setNewRole] = useState<ProjectRole>('viewer')
  const [showAddForm, setShowAddForm] = useState(false)
```

**Step 4: useEffect 수정**

```typescript
  useEffect(() => {
    fetchMembers(projectId)
    fetchMyAccess(projectId)
    fetchAvailableOrgMembers(projectId)
    // fetchInvitations 제거 (프로젝트 레벨 이메일 초대 비사용)
  }, [projectId, fetchMembers, fetchMyAccess, fetchAvailableOrgMembers])
```

**Step 5: `handleAdd` 수정**

```typescript
  const handleAdd = async () => {
    if (!selectedOrgMember) return
    await addMember(projectId, selectedOrgMember.user_id, newRole)
    setSelectedOrgMember(null)
    setNewRole('viewer')
    setShowAddForm(false)
    fetchAvailableOrgMembers(projectId)  // 목록 갱신
  }
```

**Step 6: JSX — Add Member Form 섹션 교체**

기존 Add Member Form 섹션(이메일 검색 + 이메일 초대)을 아래로 교체:

```tsx
        {/* Add Member Form — Org Member Picker */}
        {showAddForm && canManage && (
          <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
              조직 멤버에서 선택
            </p>

            {isLoadingAvailableMembers ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>로딩 중...</span>
              </div>
            ) : availableOrgMembers.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                추가 가능한 조직 멤버가 없습니다.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
                {availableOrgMembers.map((orgMember) => (
                  <button
                    key={orgMember.user_id}
                    onClick={() =>
                      setSelectedOrgMember(
                        selectedOrgMember?.user_id === orgMember.user_id ? null : orgMember
                      )
                    }
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                      selectedOrgMember?.user_id === orgMember.user_id
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    )}
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {(orgMember.name || orgMember.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {orgMember.name || orgMember.email}
                      </p>
                      {orgMember.name && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {orgMember.email}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {orgMember.org_role}
                    </span>
                    {selectedOrgMember?.user_id === orgMember.user_id && (
                      <span className="text-primary-600 dark:text-primary-400 text-xs font-medium shrink-0">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {selectedOrgMember && (
              <div className="flex gap-2">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as ProjectRole)}
                  className="flex-1 px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  onClick={handleAdd}
                  disabled={loading}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '추가'}
                </button>
              </div>
            )}
          </div>
        )}
```

**Step 7: 이메일 초대 섹션 제거**

"Section: Email Invite"와 "Section: Pending Invitations" JSX 블록 전체 삭제.

**Step 8: import 추가**

```typescript
import { useProjectAccessStore, type ProjectRole, type ProjectAccessMember, type OrgMemberForProject } from '../../stores/projectAccess'
```

**Step 9: 타입 체크**

```bash
cd src/dashboard && npx tsc --noEmit 2>&1 | head -30
```

**Step 10: Commit**

```bash
git add src/dashboard/src/components/project-management/ProjectMembersContent.tsx
git commit -m "feat: replace user-search/email-invite with org member picker in ProjectMembersContent"
```

---

### Task 9: Frontend — `ProjectManagementPage` 비관리자 버튼 숨김

**Files:**
- Modify: `src/dashboard/src/pages/ProjectManagementPage.tsx`

**Step 1: auth store에서 유저 정보 가져오기**

파일 상단 import에 추가:

```typescript
import { useAuthStore } from '../stores/auth'
```

컴포넌트 내부:

```typescript
  const currentUser = useAuthStore((s) => s.user)
  const isAdmin = currentUser?.is_admin || currentUser?.role === 'admin'
```

**Step 2: "Add Project" 버튼 조건부 렌더링**

```tsx
        {isAdmin && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        )}
```

**Step 3: Create Form도 조건부**

```tsx
      {isAdmin && showCreateForm && (
        <div className="mb-6 bg-white dark:bg-gray-800 border ...">
          {/* 기존 생성 폼 */}
        </div>
      )}
```

> **주의**: 조직 admin이지만 `UserModel.role != "admin"`인 경우 버튼이 숨겨질 수 있음.
> 이 경우 `useAuthStore`에 org role 정보가 없으므로 별도 API 호출이 필요할 수 있음.
> 단순하게 처리하려면: 버튼은 항상 보이되, 서버에서 403 반환 시 에러 메시지 표시.
> → 이 Task에서는 우선 `is_admin` 또는 `role == 'admin'` 기준으로만 처리.
> 조직 admin 지원은 Task 10에서 선택적으로 처리.

**Step 4: 타입 체크**

```bash
cd src/dashboard && npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**

```bash
git add src/dashboard/src/pages/ProjectManagementPage.tsx
git commit -m "feat: hide Add Project button for non-admin users"
```

---

### Task 10 (선택): Frontend — 조직 admin도 버튼 노출

> **Note:** `UserModel.role`이 `"user"`인 조직 admin은 현재 프론트에서 admin으로 인식 안 됨.
> 이를 해결하려면 별도 API 또는 auth store에 org_roles 추가가 필요.

**Files:**
- Modify: `src/dashboard/src/stores/auth.ts` (user 타입에 org_admin 필드 추가 또는)
- Modify: `src/backend/api/auth.py` (me 엔드포인트 응답에 is_org_admin 추가)

**Step 1: Backend — `/api/auth/me` 응답에 `is_org_admin` 추가**

현재 유저의 `is_org_admin` 여부를 계산하여 응답에 포함:

```python
# src/backend/api/auth.py 의 /me 엔드포인트에서
admin_org_ids = await _get_admin_org_ids(current_user)
is_org_admin = len(admin_org_ids) > 0

return {
    ...existing_fields,
    "is_org_admin": is_org_admin,
    "admin_org_ids": admin_org_ids,
}
```

**Step 2: Frontend — `useAuthStore`의 user 타입 확장**

```typescript
export interface AuthUser {
  // ...기존 필드...
  is_org_admin?: boolean
  admin_org_ids?: string[]
}
```

**Step 3: `ProjectManagementPage`에서 체크 수정**

```typescript
const canCreateProject = isAdmin || (currentUser?.is_org_admin ?? false)
```

**Step 4: Commit**

```bash
git commit -m "feat: expose is_org_admin in auth/me and use in project creation button visibility"
```

---

### Task 11: 통합 테스트 및 검증

**수동 테스트 시나리오:**

1. **시스템 admin 로그인** → 프로젝트 목록에 모든 프로젝트 노출 확인
2. **조직 admin 로그인** → 자신의 org 소속 프로젝트만 노출 확인
3. **일반 member 로그인** → ProjectAccess 있는 프로젝트만 노출 확인
4. **viewer 로그인** → ProjectAccess 없으면 빈 목록 확인
5. **조직 admin으로 프로젝트 생성** → `organization_id`가 자동으로 org ID로 설정되는지 확인
6. **프로젝트 멤버 추가** → 조직 멤버 목록이 표시되고, 선택 후 추가 확인
7. **다른 org 멤버 추가 시도** → 403 또는 빈 목록 확인

**타입 체크:**

```bash
cd src/dashboard && npx tsc --noEmit
```

**백엔드 린트:**

```bash
cd src/backend && python -m ruff check api/projects.py models/project.py
```

---

## 구현 요약

| Task | 변경 위치 | 핵심 내용 |
|------|-----------|----------|
| 1 | `db/models.py`, SQL | `ProjectModel.organization_id` 컬럼 추가 |
| 2 | `api/projects.py` | `_get_admin_org_ids()` 헬퍼 |
| 3 | `api/projects.py`, `models/project.py` | 프로젝트 생성 권한 체크 + org_id 설정 |
| 4 | `api/projects.py` | 프로젝트 목록 조직 기반 필터링 |
| 5 | `api/projects.py`, `models/project.py` | `/available-members` 신규 엔드포인트 |
| 6 | `api/projects.py` | 멤버 추가 시 org 멤버 검증 |
| 7 | `stores/projectAccess.ts` | `fetchAvailableOrgMembers` store 액션 |
| 8 | `components/project-management/ProjectMembersContent.tsx` | 조직 멤버 피커 UI |
| 9 | `pages/ProjectManagementPage.tsx` | 비관리자 버튼 숨김 |
| 10 | auth.py + auth.ts (선택) | 조직 admin 프론트 인식 |
| 11 | — | 통합 테스트 |
