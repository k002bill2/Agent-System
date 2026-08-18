# API Reference - Projects

프로젝트 레지스트리, 오케스트레이션, 설정(Skills/Agents/MCP/Hooks/Commands), 버전 관리, 접근제어, 초대, 모니터링, 진단 API입니다.

## Base URL
- Development: `http://localhost:8000`

---

## Project Registry (DB 관리)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/project-registry` | 프로젝트 생성 |
| GET | `/api/project-registry` | 활성 프로젝트 목록 |
| GET | `/api/project-registry/all` | 전체 프로젝트 (비활성 포함) |
| GET | `/api/project-registry/{id}` | 프로젝트 상세 |
| PUT | `/api/project-registry/{id}` | 프로젝트 수정 |
| DELETE | `/api/project-registry/{id}` | 프로젝트 비활성화 (soft-delete) |
| DELETE | `/api/project-registry/{id}/permanent` | 프로젝트 영구 삭제 (hard-delete, admin 전용) |
| POST | `/api/project-registry/{id}/restore` | 프로젝트 복원 |

### Project Members

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-registry/{id}/members` | 프로젝트 멤버 목록 |
| POST | `/api/project-registry/{id}/members` | 멤버 추가 |
| PATCH | `/api/project-registry/{id}/members/{user_id}` | 멤버 역할 변경 |
| DELETE | `/api/project-registry/{id}/members/{user_id}` | 멤버 제거 |
| GET | `/api/project-registry/{id}/available-members` | 추가 가능 멤버 목록 |
| PATCH | `/api/project-registry/{id}/toggle-active` | 프로젝트 활성 토글 |

**요청 본문** (`POST /api/project-registry`):
```json
{
  "name": "My Project",
  "description": "프로젝트 설명",
  "path": "/path/to/project",
  "settings": {}
}
```

**응답**: `ProjectResponse` (id, name, slug, description, path, is_active, settings, created_at, updated_at)

> **Note**: 기존 `/api/projects` 경로는 오케스트레이션 세션 프로젝트용이며, 이 API는 DB 기반 프로젝트 레지스트리 관리 전용입니다.

---

## Projects (오케스트레이션)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects` | 프로젝트 목록 (접근 제어 적용) |
| POST | `/api/projects` | 프로젝트 등록 |
| POST | `/api/projects/create` | 템플릿에서 프로젝트 생성 |
| POST | `/api/projects/link` | 외부 프로젝트 심볼릭 링크 |
| POST | `/api/projects/reorder` | 프로젝트 순서 변경 |
| GET | `/api/projects/templates` | 프로젝트 템플릿 목록 |
| GET | `/api/projects/{id}` | 프로젝트 상세 조회 |
| PUT | `/api/projects/{id}` | 프로젝트 수정 |
| DELETE | `/api/projects/{id}` | 프로젝트 삭제 (cascade) |
| GET | `/api/projects/{id}/health` | 프로젝트 헬스 상태 |
| GET | `/api/projects/{id}/checks/run-all` | 전체 체크 실행 (SSE) |
| GET | `/api/projects/{id}/checks/{check_type}` | 특정 체크 실행 (SSE) |
| GET | `/api/projects/{id}/deletion-preview` | 삭제 미리보기 |
| GET | `/api/projects/{id}/context` | 프로젝트 컨텍스트 (CLAUDE.md, dev docs) |
| GET | `/api/projects/{id}/claude-md` | CLAUDE.md 내용 조회 |

### 프로젝트 id 제약 (요청 본문)

`POST /api/projects`, `POST /api/projects/create`, `POST /api/projects/link` 세 엔드포인트의
요청 본문 `id`는 **slug 로 제한**된다 — `^[A-Za-z0-9][A-Za-z0-9_-]*$`, 최대 36자
(`models/project.py` 의 `PROJECT_ID_PATTERN` / `PROJECT_ID_MAX_LENGTH`).
상한 36자는 DB 컬럼 폭(`db/models/project.py` 의 `ProjectModel.id = String(36)`)과 맞춘 값이다 —
더 길게 허용하면 검증은 통과하는데 DB insert 에서 실패해 파일시스템 레지스트리와 DB 가 어긋난다.

id 는 `projects/<id>` 경로 세그먼트로 그대로 쓰여 심볼릭 링크·디렉터리 생성 대상이 되므로,
경로 구분자(`/` `\`)·상위 참조(`..`)·절대경로·공백이 포함되면 422 로 거부된다.
제약 위반 시 Pydantic 검증 단계에서 막히며 핸들러에 도달하지 않는다.

> 회귀 테스트: `tests/backend/test_project_id_path_traversal.py`

---

## Project Configs

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs` | 프로젝트 설정 목록 |
| GET | `/api/project-configs/{project_id}` | 프로젝트 설정 상세 |

### Skills

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/{project_id}/skills` | 스킬 목록 |
| POST | `/api/project-configs/{project_id}/skills` | 스킬 생성 |
| PUT | `/api/project-configs/{project_id}/skills/{skill_id}` | 스킬 수정 |
| DELETE | `/api/project-configs/{project_id}/skills/{skill_id}` | 스킬 삭제 |
| POST | `/api/project-configs/{project_id}/skills/{skill_id}/copy` | 스킬 복사 (다른 프로젝트로) |

### Agents

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/{project_id}/agents` | 에이전트 목록 |
| POST | `/api/project-configs/{project_id}/agents` | 에이전트 생성 |
| PUT | `/api/project-configs/{project_id}/agents/{agent_id}` | 에이전트 수정 |
| DELETE | `/api/project-configs/{project_id}/agents/{agent_id}` | 에이전트 삭제 |
| POST | `/api/project-configs/{project_id}/agents/{agent_id}/copy` | 에이전트 복사 (다른 프로젝트로) |

### MCP Servers

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/{project_id}/mcp` | MCP 서버 목록 |
| POST | `/api/project-configs/{project_id}/mcp` | MCP 서버 추가 |
| PUT | `/api/project-configs/{project_id}/mcp/{server_id}` | MCP 서버 수정 |
| DELETE | `/api/project-configs/{project_id}/mcp/{server_id}` | MCP 서버 삭제 |
| POST | `/api/project-configs/{project_id}/mcp/{server_id}/enable` | MCP 서버 활성화 |
| POST | `/api/project-configs/{project_id}/mcp/{server_id}/disable` | MCP 서버 비활성화 |
| POST | `/api/project-configs/{project_id}/mcp/{server_id}/toggle` | MCP 서버 활성/비활성 토글 |
| POST | `/api/project-configs/{project_id}/mcp/{server_id}/copy` | MCP 서버 복사 (다른 프로젝트로) |

### Hooks

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/{project_id}/hooks` | Hook 설정 조회 |
| PUT | `/api/project-configs/{project_id}/hooks` | hooks.json 전체 내용 수정 |
| POST | `/api/project-configs/{project_id}/hooks/events/{event}` | 이벤트에 Hook 엔트리 추가 |
| DELETE | `/api/project-configs/{project_id}/hooks/{event}/{index}` | 이벤트/인덱스로 Hook 엔트리 삭제 |
| POST | `/api/project-configs/{project_id}/hooks/{event}/{index}/copy` | Hook 복사 (다른 프로젝트로) |

**Hook 이벤트 타입**: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PermissionRequest`, `Setup`

### Commands

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/{project_id}/commands` | 커맨드 목록 |
| GET | `/api/project-configs/{project_id}/commands/{command_id}/content` | 커맨드 내용 조회 |
| POST | `/api/project-configs/{project_id}/commands` | 커맨드 생성 |
| PUT | `/api/project-configs/{project_id}/commands/{command_id}` | 커맨드 수정 |
| DELETE | `/api/project-configs/{project_id}/commands/{command_id}` | 커맨드 삭제 |
| POST | `/api/project-configs/{project_id}/commands/{command_id}/copy` | 커맨드 복사 |

### Memories

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/{project_id}/memories` | 메모리 엔트리 목록 |
| GET | `/api/project-configs/{project_id}/memories/index` | MEMORY.md 인덱스 조회 |
| PUT | `/api/project-configs/{project_id}/memories/index` | MEMORY.md 인덱스 수정 |
| GET | `/api/project-configs/{project_id}/memories/{memory_id}/content` | 메모리 내용 조회 |
| POST | `/api/project-configs/{project_id}/memories` | 메모리 엔트리 생성 |
| PUT | `/api/project-configs/{project_id}/memories/{memory_id}` | 메모리 내용 수정 |
| DELETE | `/api/project-configs/{project_id}/memories/{memory_id}` | 메모리 엔트리 삭제 |

### Rules (Project)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/{project_id}/rules` | 프로젝트 규칙 목록 |
| GET | `/api/project-configs/{project_id}/rules/{rule_id}/content` | 규칙 내용 조회 |
| POST | `/api/project-configs/{project_id}/rules` | 규칙 생성 |
| PUT | `/api/project-configs/{project_id}/rules/{rule_id}` | 규칙 수정 |
| DELETE | `/api/project-configs/{project_id}/rules/{rule_id}` | 규칙 삭제 |
| POST | `/api/project-configs/{project_id}/rules/{rule_id}/copy` | 규칙 복사 (다른 프로젝트로) |

### Rules (Global)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/global/rules` | 글로벌 규칙 목록 |
| GET | `/api/project-configs/global/rules/{rule_id}/content` | 글로벌 규칙 내용 조회 |
| POST | `/api/project-configs/global/rules` | 글로벌 규칙 생성 |
| PUT | `/api/project-configs/global/rules/{rule_id}` | 글로벌 규칙 수정 |
| DELETE | `/api/project-configs/global/rules/{rule_id}` | 글로벌 규칙 삭제 |

### Additional Config Endpoints

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/global` | 글로벌 설정 조회 |
| GET | `/api/project-configs/paths` | 프로젝트 경로 목록 |
| POST | `/api/project-configs/external-paths` | 외부 경로 추가 |
| DELETE | `/api/project-configs/external-paths/{path}` | 외부 경로 삭제 |
| DELETE | `/api/project-configs/{project_id}/remove` | 프로젝트 설정 삭제 |
| GET | `/api/project-configs/stream` | 설정 변경 SSE 스트림 |
| GET | `/api/project-configs/by-path` | 경로로 프로젝트 조회 |
| GET | `/api/project-configs/skills/all` | 전체 스킬 목록 |
| GET | `/api/project-configs/{project_id}/skills/{skill_id}/content` | 스킬 내용 조회 |
| GET | `/api/project-configs/agents/all` | 전체 에이전트 목록 |
| GET | `/api/project-configs/{project_id}/agents/{agent_id}/content` | 에이전트 내용 조회 |

---

## Config Versions

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/config-versions` | 버전 생성 |
| GET | `/api/config-versions` | 버전 목록 |
| GET | `/api/config-versions/stats` | 버전 통계 |
| GET | `/api/config-versions/{id}` | 버전 상세 |
| PATCH | `/api/config-versions/{id}/label` | 레이블 수정 |
| POST | `/api/config-versions/{id}/archive` | 버전 아카이브 |
| DELETE | `/api/config-versions/{id}` | 드래프트 삭제 |
| GET | `/api/config-versions/history/{type}/{id}` | 설정별 버전 히스토리 |
| GET | `/api/config-versions/latest/{type}/{id}` | 최신 버전 조회 |
| GET | `/api/config-versions/compare/{a}/{b}` | 버전 비교 (diff) |
| POST | `/api/config-versions/rollback` | 롤백 실행 |
| GET | `/api/config-versions/by-number/{type}/{id}/{number}` | 버전 번호로 조회 |

**설정 타입**: `agent`, `session`, `project`, `workflow`, `permission`, `notification_rule`, `llm_router`

---

## Project Access (RBAC)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects/{project_id}/access` | 프로젝트 멤버 목록 (viewer+) |
| POST | `/api/projects/{project_id}/access` | 멤버 추가 (owner) |
| PUT | `/api/projects/{project_id}/access/{user_id}` | 역할 변경 (owner) |
| DELETE | `/api/projects/{project_id}/access/{user_id}` | 멤버 제거 (owner) |
| GET | `/api/projects/{project_id}/access/me` | 내 프로젝트 역할 조회 |

**역할**: `owner`, `editor`, `viewer`

**접근제어 규칙**:
- project_access 레코드가 없는 프로젝트 → 모든 인증 사용자 접근 허용 (하위 호환)
- 시스템 admin (role=="admin")은 모든 프로젝트 접근 바이패스
- 역할 계층: viewer(0) < editor(1) < owner(2)

---

## Project Invitations

이메일 기반 프로젝트 초대 시스템입니다.

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/projects/{project_id}/invitations` | 이메일로 프로젝트 초대 생성 (owner 필요) |
| GET | `/api/v1/projects/{project_id}/invitations` | pending 초대 목록 조회 (owner 필요) |
| DELETE | `/api/v1/projects/{project_id}/invitations/{invitation_id}` | 초대 취소 (owner 필요) |
| GET | `/api/v1/invitations/{token}` | 토큰으로 초대 미리보기 (인증 불필요) |
| POST | `/api/v1/invitations/{token}/accept` | 초대 수락 (로그인 필요) |

**초대 생성 요청 본문** (`POST /api/v1/projects/{project_id}/invitations`):
```json
{
  "email": "user@example.com",
  "role": "editor"
}
```

**초대 응답 필드**: `id`, `project_id`, `email`, `role`, `status`, `expires_at`, `created_at`

**초대 미리보기 응답 필드**: `project_id`, `project_name`, `email`, `role`, `expires_at`, `valid`

**초대 수락 응답**:
```json
{
  "message": "초대를 수락했습니다",
  "project_id": "...",
  "role": "editor"
}
```

**역할**: `owner`, `editor`, `viewer`

---

## Project Monitoring

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects/{id}/health-config` | 헬스 체크 설정 조회 (labels & commands) |
| GET | `/api/projects/{id}/health` | 프로젝트 헬스 상태 |
| GET | `/api/projects/{id}/checks/run-all` | 전체 체크 실행 (SSE) |
| GET | `/api/projects/{id}/checks/{check_type}` | 특정 체크 실행 (SSE) |

**체크 타입**: `test`, `lint`, `build`, `type_check`

---

## Project Diagnostics

프로젝트 환경 진단 및 self-healing API입니다.

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects/{project_id}/diagnostics` | 전체 환경 진단 실행 |
| GET | `/api/projects/{project_id}/diagnostics/{category}` | 단일 카테고리 진단 실행 |
| POST | `/api/projects/{project_id}/diagnostics/fix` | self-healing 수정 액션 실행 |

**진단 카테고리**: `workspace`, `mcp`, `git`, `quota`

**수정 액션** (`POST .../diagnostics/fix`): `create_aos_config`, `create_claude_md`, `enable_mcp_servers`
