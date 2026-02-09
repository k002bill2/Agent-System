# API Reference

AOS Backend API 엔드포인트 문서입니다.

## Base URL
- Development: `http://localhost:8000`

---

## Sessions & Tasks

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/sessions` | 세션 생성 |
| GET | `/api/sessions/{id}` | 세션 상태 조회 |
| POST | `/api/sessions/{id}/tasks` | 태스크 제출 |
| WS | `/ws/{session_id}` | 실시간 스트리밍 |
| GET | `/api/sessions/{id}/approvals` | 대기 중인 승인 요청 조회 |
| POST | `/api/sessions/{id}/approve/{approval_id}` | 작업 승인 |
| POST | `/api/sessions/{id}/deny/{approval_id}` | 작업 거부 |
| POST | `/api/sessions/{id}/tasks/{tid}/retry` | 태스크 재시도 |
| POST | `/api/sessions/{id}/tasks/{tid}/cancel` | 태스크 취소 |
| DELETE | `/api/sessions/{id}/tasks/{tid}` | 태스크 소프트 삭제 |

---

## Authentication

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/auth/google` | Google OAuth 리다이렉트 URL |
| POST | `/api/auth/google/callback` | Google OAuth 콜백 처리 |
| GET | `/api/auth/github` | GitHub OAuth 리다이렉트 URL |
| POST | `/api/auth/github/callback` | GitHub OAuth 콜백 처리 |
| POST | `/api/auth/register` | 이메일/비밀번호 회원가입 |
| POST | `/api/auth/login` | 이메일/비밀번호 로그인 |
| POST | `/api/auth/refresh` | Access Token 갱신 |
| GET | `/api/auth/me` | 현재 사용자 정보 |
| POST | `/api/auth/logout` | 로그아웃 |

---

## Agents & MCP

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/agents` | 에이전트 목록 조회 |
| GET | `/api/agents/stats` | 레지스트리 통계 |
| POST | `/api/agents/search` | 능력 기반 검색 |
| POST | `/api/agents/orchestrate/analyze` | 태스크 분석 |
| GET | `/api/agents/mcp/servers` | MCP 서버 목록 |
| POST | `/api/agents/mcp/servers/{id}/start` | MCP 서버 시작 |
| POST | `/api/agents/mcp/servers/{id}/stop` | MCP 서버 중지 |
| POST | `/api/agents/mcp/tools/call` | MCP 도구 호출 |

---

## MCP (Model Context Protocol)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/mcp/servers` | MCP 서버 목록 조회 |
| POST | `/api/mcp/servers` | MCP 서버 추가 |
| GET | `/api/mcp/servers/{id}` | MCP 서버 상세 |
| PUT | `/api/mcp/servers/{id}` | MCP 서버 수정 |
| DELETE | `/api/mcp/servers/{id}` | MCP 서버 삭제 |
| POST | `/api/mcp/servers/{id}/start` | 서버 시작 |
| POST | `/api/mcp/servers/{id}/stop` | 서버 중지 |
| GET | `/api/mcp/servers/{id}/tools` | 도구 목록 조회 |
| POST | `/api/mcp/servers/{id}/tools/{tool}/call` | 도구 호출 |
| GET | `/api/mcp/stats` | MCP 통계 |

---

## RAG (Vector DB)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/rag/projects/{id}/index` | 프로젝트 벡터 인덱싱 |
| POST | `/api/rag/projects/{id}/query` | 의미론적 검색 쿼리 |
| GET | `/api/rag/projects/{id}/stats` | 인덱스 통계 조회 |
| DELETE | `/api/rag/projects/{id}/index` | 프로젝트 인덱스 삭제 |

---

## Claude Sessions

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/claude-sessions` | 세션 목록 조회 |
| GET | `/api/claude-sessions/{id}` | 세션 상세 정보 |
| GET | `/api/claude-sessions/{id}/stream` | 실시간 SSE 스트리밍 |
| GET | `/api/claude-sessions/{id}/transcript` | Raw 트랜스크립트 |
| POST | `/api/claude-sessions/{id}/save` | 세션 DB 저장 |
| GET | `/api/claude-sessions/{id}/processes` | 세션 프로세스 목록 |
| POST | `/api/claude-sessions/{id}/processes/cleanup` | 프로세스 정리 |

**쿼리 파라미터** (`GET /api/claude-sessions`):
- `status`: `active` | `idle` | `completed`
- `sort_by`: `last_activity` | `created_at` | `message_count` | `estimated_cost` | `project_name`
- `sort_order`: `asc` | `desc` (기본: `desc`)
- `limit`: 최대 반환 개수 (기본: 50)

---

## Claude Code Activity

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/claude-code/activity` | 실시간 활동 목록 |
| GET | `/api/claude-code/activity/{session_id}` | 세션별 활동 상세 |
| GET | `/api/claude-code/tasks` | 태스크 목록 |
| GET | `/api/claude-code/tasks/{session_id}` | 세션별 태스크 |
| GET | `/api/claude-code/sessions` | 활성 세션 목록 |
| GET | `/api/claude-code/sessions/{session_id}/stream` | SSE 스트리밍 |

---

## RLHF Feedback

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/feedback` | 피드백 제출 |
| GET | `/api/feedback` | 피드백 목록 조회 |
| GET | `/api/feedback/stats` | 피드백 통계 |
| GET | `/api/feedback/{id}` | 단일 피드백 조회 |
| POST | `/api/feedback/{id}/process` | 피드백 → 데이터셋 변환 |
| POST | `/api/feedback/process-batch` | 일괄 처리 |
| POST | `/api/feedback/process-pending` | 대기 중 자동 처리 |
| GET | `/api/feedback/dataset/stats` | 데이터셋 통계 |
| GET | `/api/feedback/dataset/export` | 데이터셋 내보내기 (JSONL/CSV) |

**피드백 유형**: `implicit`, `explicit_positive`, `explicit_negative`

**부정 피드백 사유**: `incorrect`, `incomplete`, `off_topic`, `style`, `performance`, `other`

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
| POST | `/api/project-configs/{project_id}/skills/copy` | 스킬 복사 (다른 프로젝트에서) |

### Agents

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/{project_id}/agents` | 에이전트 목록 |
| POST | `/api/project-configs/{project_id}/agents` | 에이전트 생성 |
| PUT | `/api/project-configs/{project_id}/agents/{agent_id}` | 에이전트 수정 |
| DELETE | `/api/project-configs/{project_id}/agents/{agent_id}` | 에이전트 삭제 |
| POST | `/api/project-configs/{project_id}/agents/copy` | 에이전트 복사 |

### MCP Servers

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/{project_id}/mcp` | MCP 서버 목록 |
| POST | `/api/project-configs/{project_id}/mcp` | MCP 서버 추가 |
| PUT | `/api/project-configs/{project_id}/mcp/{server_id}` | MCP 서버 수정 |
| DELETE | `/api/project-configs/{project_id}/mcp/{server_id}` | MCP 서버 삭제 |
| POST | `/api/project-configs/{project_id}/mcp/copy` | MCP 서버 복사 |

### Hooks

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/project-configs/{project_id}/hooks` | Hook 목록 |
| POST | `/api/project-configs/{project_id}/hooks` | Hook 생성 |
| PUT | `/api/project-configs/{project_id}/hooks/{hook_id}` | Hook 수정 |
| DELETE | `/api/project-configs/{project_id}/hooks/{hook_id}` | Hook 삭제 |
| POST | `/api/project-configs/{project_id}/hooks/copy` | Hook 복사 |

**Hook 이벤트 타입**: `PreToolUse`, `PostToolUse`, `Notification`, `Stop`

---

## Usage & Analytics

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/usage` | Claude Code 사용량 (Plan Limits + 토큰 통계) |
| GET | `/api/usage/raw` | Raw stats-cache.json 데이터 |
| GET | `/api/usage/oauth-test` | OAuth 토큰 진단 |
| GET | `/api/usage/summary` | 사용량 요약 |
| GET | `/api/usage/by-session/{session_id}` | 세션별 사용량 |
| GET | `/api/usage/by-agent/{agent_id}` | 에이전트별 사용량 |
| GET | `/api/usage/trends` | 사용량 트렌드 |

**`GET /api/usage` 응답**:
- `planLimits`: Anthropic OAuth API 실시간 Plan Limits (session, weekly, model별)
- `weeklyTotalTokens`, `weeklySonnetTokens`, `weeklyOpusTokens`: 로컬 stats-cache 기반 주간 토큰
- `oauthAvailable`: OAuth 토큰 사용 가능 여부
- `isCached`: 캐시 데이터 사용 여부

**환경 변수**: `CLAUDE_OAUTH_TOKEN`, `CLAUDE_STATS_CACHE_PATH`, `CLAUDE_USAGE_CACHE_PATH` ([배포 가이드](./deployment.md#claude-code-usage-환경-변수) 참조)
| GET | `/api/analytics/overview` | 개요 메트릭 |
| GET | `/api/analytics/trends` | 시간별 트렌드 |
| GET | `/api/analytics/agents` | 에이전트 성능 메트릭 |
| GET | `/api/analytics/costs` | 비용 분석 |
| GET | `/api/analytics/activity` | 활동 히트맵 |
| GET | `/api/analytics/errors` | 에러 분석 |
| GET | `/api/analytics/dashboard` | 전체 대시보드 데이터 |
| GET | `/api/analytics/trends/compare` | 멀티 프로젝트 트렌드 비교 |

**쿼리 파라미터**: `time_range`: `1h` | `24h` | `7d` | `30d` | `all` (기본: `7d`)

**멀티 프로젝트 비교** (`GET /api/analytics/trends/compare`):
- `project_ids`: 비교할 프로젝트 ID 목록 (최대 5개, 필수)
- `metric`: `tasks` | `tokens` | `cost` | `success_rate` (기본: `tasks`)
- `time_range`: 시간 범위

---

## Audit Trail

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/audit` | 감사 로그 조회 |
| GET | `/api/audit/stats` | 감사 통계 (요약 카드용) |
| GET | `/api/audit/{log_id}` | 단일 로그 조회 |
| GET | `/api/audit/export` | 감사 로그 내보내기 (JSON/CSV) |
| GET | `/api/audit/sessions/{session_id}/trail` | 세션별 감사 추적 |
| GET | `/api/audit/actions` | 가능한 액션 타입 목록 |
| GET | `/api/audit/resource-types` | 가능한 리소스 타입 목록 |
| POST | `/api/audit/cleanup` | 오래된 로그 정리 |
| POST | `/api/audit/seed` | 테스트용 샘플 데이터 생성 |
| POST | `/api/audit/verify-integrity` | 무결성 검증 |

**쿼리 파라미터** (`GET /api/audit`):
- `session_id`, `user_id`: 필터
- `action`, `resource_type`, `status`: 타입 필터
- `start_date`, `end_date`: 날짜 범위
- `limit`, `offset`: 페이지네이션

**액션 타입**: `session_created`, `task_created`, `task_completed`, `task_failed`, `tool_executed`, `approval_granted`, `approval_denied` 등

**리소스 타입**: `session`, `task`, `approval`, `agent`, `user`, `permission`, `tool`

---

## Notifications

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/notifications/rules` | 알림 규칙 목록 |
| POST | `/api/notifications/rules` | 알림 규칙 생성 |
| PUT | `/api/notifications/rules/{id}` | 알림 규칙 수정 |
| DELETE | `/api/notifications/rules/{id}` | 알림 규칙 삭제 |
| POST | `/api/notifications/rules/{id}/toggle` | 규칙 활성화 토글 |
| GET | `/api/notifications/channels` | 알림 채널 목록 |
| PUT | `/api/notifications/channels/{channel}` | 채널 설정 업데이트 |
| POST | `/api/notifications/channels/{channel}/test` | 채널 테스트 |
| POST | `/api/notifications/send` | 수동 알림 발송 |
| GET | `/api/notifications/history` | 알림 히스토리 |

**채널**: `slack`, `discord`, `email`, `webhook`

**이벤트 타입**: `task_completed`, `task_failed`, `approval_required`, `session_started`, `session_ended`, `cost_threshold`, `error_occurred`, `agent_blocked`

---

## Playground

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/playground/sessions` | 플레이그라운드 세션 목록 |
| POST | `/api/playground/sessions` | 세션 생성 |
| GET | `/api/playground/sessions/{id}` | 세션 상세 조회 |
| DELETE | `/api/playground/sessions/{id}` | 세션 삭제 |
| PATCH | `/api/playground/sessions/{id}/settings` | 세션 설정 업데이트 |
| POST | `/api/playground/sessions/{id}/execute` | 프롬프트 실행 |
| POST | `/api/playground/sessions/{id}/execute/stream` | 스트리밍 실행 |
| GET | `/api/playground/sessions/{id}/history` | 실행 히스토리 |
| POST | `/api/playground/sessions/{id}/clear` | 히스토리 초기화 |
| GET | `/api/playground/tools` | 사용 가능한 도구 목록 |
| POST | `/api/playground/tools/test` | 도구 테스트 |
| POST | `/api/playground/compare` | 에이전트 비교 (2-5개) |
| GET | `/api/playground/models` | 사용 가능한 모델 목록 |

---

## LLM Models (Central Registry)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/llm/models` | 전체 모델 목록 |
| GET | `/api/llm/models?provider=xxx` | Provider별 필터링 |
| GET | `/api/llm/models?available_only=true` | 사용 가능한 모델만 |
| GET | `/api/llm/models/default` | 기본 모델 조회 |
| GET | `/api/llm/models/{model_id}` | 특정 모델 상세 |
| GET | `/api/llm/providers` | 지원 프로바이더 목록 |

**응답 형식** (GET /api/llm/models):
```json
{
  "models": [
    {
      "id": "claude-sonnet-4-20250514",
      "display_name": "Claude Sonnet 4",
      "provider": "anthropic",
      "context_window": 200000,
      "pricing": {"input": 0.003, "output": 0.015},
      "available": true,
      "is_default": true,
      "supports_tools": true,
      "supports_vision": true
    }
  ],
  "total": 14
}
```

**프로바이더**: `anthropic`, `google`, `openai`, `ollama`

> **Note**: 이 API는 중앙 레지스트리(`models/llm_models.py`)에서 모델 정보를 제공합니다.
> 새 모델 추가 시 해당 파일만 수정하면 전체 시스템에 반영됩니다.

---

## LLM Router

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/llm-router/providers` | LLM 프로바이더 목록 |
| POST | `/api/llm-router/providers` | 프로바이더 등록 |
| GET | `/api/llm-router/providers/{id}` | 프로바이더 상세 |
| PATCH | `/api/llm-router/providers/{id}` | 프로바이더 업데이트 |
| DELETE | `/api/llm-router/providers/{id}` | 프로바이더 삭제 |
| POST | `/api/llm-router/providers/{id}/toggle` | 활성화 토글 |
| GET | `/api/llm-router/health` | 전체 헬스체크 |
| GET | `/api/llm-router/health/{id}` | 프로바이더별 헬스체크 |
| GET | `/api/llm-router/select` | 최적 프로바이더 선택 |
| POST | `/api/llm-router/record` | 요청 결과 기록 |
| GET | `/api/llm-router/config` | 라우터 설정 조회 |
| PATCH | `/api/llm-router/config` | 라우터 설정 업데이트 |
| GET | `/api/llm-router/state` | 라우터 상태 |
| GET | `/api/llm-router/stats` | 라우팅 통계 |
| POST | `/api/llm-router/initialize` | 환경변수에서 초기화 |

**라우팅 전략**: `priority`, `round_robin`, `least_cost`, `least_latency`, `fallback_chain`

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

**설정 타입**: `agent`, `session`, `project`, `workflow`, `permission`, `notification_rule`, `llm_router`

---

## Organizations (Multi-tenant)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/organizations` | 조직 생성 |
| GET | `/api/organizations` | 조직 목록 |
| GET | `/api/organizations/{id}` | 조직 상세 |
| GET | `/api/organizations/slug/{slug}` | 슬러그로 조회 |
| PATCH | `/api/organizations/{id}` | 조직 업데이트 |
| DELETE | `/api/organizations/{id}` | 조직 삭제 |
| POST | `/api/organizations/{id}/upgrade` | 플랜 업그레이드 |
| GET | `/api/organizations/{id}/members` | 멤버 목록 |
| POST | `/api/organizations/{id}/members/invite` | 멤버 초대 |
| POST | `/api/organizations/invitations/accept` | 초대 수락 |
| PATCH | `/api/organizations/{id}/members/{mid}/role` | 역할 변경 |
| DELETE | `/api/organizations/{id}/members/{mid}` | 멤버 제거 |
| GET | `/api/organizations/user/{uid}/organizations` | 사용자 조직 목록 |
| GET | `/api/organizations/{id}/context/{uid}` | 테넌트 컨텍스트 |
| GET | `/api/organizations/{id}/stats` | 조직 통계 |
| POST | `/api/organizations/{id}/usage/track` | 토큰 사용량 기록 (user_id, session_id, model 옵션) |
| GET | `/api/organizations/{id}/quota` | Quota 현황 조회 (멤버/프로젝트/세션/토큰) |
| GET | `/api/organizations/{id}/members/usage?period=month` | 멤버별 사용량 분석 (day/week/month) |

**플랜**: `free`, `starter`, `professional`, `enterprise`

**역할**: `owner`, `admin`, `member`, `viewer`

---

## Git

### Working Directory

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/working-status` | 작업 디렉토리 상태 (staged/unstaged/untracked) |
| POST | `/api/git/projects/{id}/add` | 파일 스테이징 (git add) |
| POST | `/api/git/projects/{id}/commit` | 커밋 생성 (git commit) |
| POST | `/api/git/projects/{id}/draft-commits` | LLM 기반 커밋 초안 생성 |

**Add 요청 본문**:
```json
{
  "paths": ["file1.txt", "src/"],
  "all": false
}
```

**Commit 요청 본문**:
```json
{
  "message": "feat: Add new feature",
  "author_name": "John Doe",
  "author_email": "john@example.com"
}
```

**Draft Commits 요청 본문**:
```json
{
  "staged_only": false
}
```

**Draft Commits 응답**:
```json
{
  "drafts": [
    {
      "message": "feat(auth): add OAuth login support",
      "files": ["src/auth/oauth.py", "src/auth/config.py"],
      "type": "feat",
      "scope": "auth"
    }
  ],
  "total_files": 5,
  "token_usage": 1234
}
```

### Branches & Commits

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/branches` | 브랜치 목록 조회 |
| POST | `/api/git/projects/{id}/branches` | 브랜치 생성 |
| DELETE | `/api/git/projects/{id}/branches/{name}` | 브랜치 삭제 |
| GET | `/api/git/projects/{id}/commits` | 커밋 히스토리 |

### Remote Operations

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/git/projects/{id}/fetch` | 리모트 fetch |
| POST | `/api/git/projects/{id}/pull` | 리모트 pull |
| POST | `/api/git/projects/{id}/push` | 리모트 push |

### Merge

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/git/projects/{id}/merge/preview` | 머지 미리보기 (충돌 체크) |
| POST | `/api/git/projects/{id}/merge` | 머지 실행 |
| GET | `/api/git/projects/{id}/merge/conflicts` | 충돌 파일 상세 조회 |
| GET | `/api/git/projects/{id}/merge/status` | 진행 중인 머지 상태 |
| POST | `/api/git/projects/{id}/merge/resolve` | 단일 파일 충돌 해결 |
| POST | `/api/git/projects/{id}/merge/abort` | 진행 중 머지 취소 |
| POST | `/api/git/projects/{id}/merge/complete` | 모든 충돌 해결 후 머지 완료 |

**충돌 해결 요청 본문** (`POST /merge/resolve`):
```json
{
  "file_path": "src/example.py",
  "strategy": "ours",
  "resolved_content": null,
  "source_branch": "feature/new-feature",
  "target_branch": "main"
}
```

**해결 전략**:
- `ours`: Target 브랜치(머지 대상) 버전 유지
- `theirs`: Source 브랜치(머지 소스) 버전 유지
- `custom`: 사용자가 직접 `resolved_content`에 해결된 내용 제공

**충돌 해결 응답**:
```json
{
  "success": true,
  "file_path": "src/example.py",
  "message": "Conflict resolved using 'ours' strategy",
  "resolved_content": "..."
}
```

### Merge Requests (내부 MR)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/merge-requests` | MR 목록 |
| POST | `/api/git/projects/{id}/merge-requests` | MR 생성 |
| GET | `/api/git/projects/{id}/merge-requests/{mr_id}` | MR 상세 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/approve` | MR 승인 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/merge` | MR 머지 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/close` | MR 닫기 |

**MR 상태**: `open`, `merged`, `closed`, `draft`

**충돌 상태**: `unknown`, `no_conflicts`, `has_conflicts`

### GitHub Integration

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/github/{repo}/pulls` | GitHub PR 목록 |
| GET | `/api/git/github/{repo}/pulls/{number}` | GitHub PR 상세 |
| POST | `/api/git/github/{repo}/pulls/{number}/merge` | GitHub PR 머지 |
| GET | `/api/git/github/{repo}/pulls/{number}/reviews` | GitHub PR 리뷰 목록 |
| POST | `/api/git/github/{repo}/pulls/{number}/reviews` | GitHub PR 리뷰 생성 |

**GitHub 머지 방식**: `merge`, `squash`, `rebase`

---

## Admin

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/admin/users` | 사용자 목록 조회 (관리자 전용) |
| PATCH | `/api/admin/users/{user_id}` | 사용자 정보 수정 (관리자 전용) |
| GET | `/api/admin/menu-visibility` | 메뉴 가시성 설정 조회 (인증 사용자) |
| PUT | `/api/admin/menu-visibility` | 메뉴 가시성 일괄 업데이트 (관리자 전용) |
| GET | `/api/admin/system-info` | 시스템 정보 조회 (관리자 전용) |

**사용자 목록 쿼리 파라미터** (`GET /api/admin/users`):
- `is_active`: 활성 상태 필터
- `is_admin`: 관리자 필터
- `role`: 역할 필터 (`user`, `manager`, `admin`)
- `search`: 이메일/이름 검색
- `limit`, `offset`: 페이지네이션

**메뉴 가시성 응답** (`GET /api/admin/menu-visibility`):
```json
{
  "visibility": {
    "dashboard": {"user": true, "manager": true, "admin": true},
    "agents": {"user": false, "manager": true, "admin": true}
  },
  "menu_order": ["dashboard", "projects", "tasks", "agents", "..."]
}
```

**메뉴 가시성 업데이트 요청** (`PUT /api/admin/menu-visibility`):
```json
{
  "visibility": {"dashboard": {"user": true, "manager": true, "admin": true}},
  "menu_order": ["dashboard", "projects", "tasks"]
}
```

**역할**: `user`, `manager`, `admin`

---

## Rate Limits

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/rate-limits/status` | 현재 사용자 제한 상태 |
| GET | `/api/rate-limits/config` | 제한 설정 조회 |
| PATCH | `/api/rate-limits/config` | 제한 설정 수정 |

---

## Cost Allocation

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/cost-allocation/summary` | 비용 요약 |
| GET | `/api/cost-allocation/by-session/{id}` | 세션별 비용 |
| GET | `/api/cost-allocation/by-organization/{id}` | 조직별 비용 |
| GET | `/api/cost-allocation/trends` | 비용 트렌드 |
| POST | `/api/cost-allocation/track` | 사용량 기록 |

---

## Health

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | 기본 헬스체크 |
| GET | `/api/health/detailed` | 상세 헬스체크 |
| GET | `/api/health/components` | 컴포넌트별 상태 |

---

## Project Monitoring

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/monitor/projects` | 프로젝트 목록 |
| POST | `/api/monitor/projects/{id}/check` | 헬스 체크 실행 |
| GET | `/api/monitor/projects/{id}/status` | 체크 상태 조회 |
| POST | `/api/monitor/projects/{id}/check/stop` | 체크 중지 |
| GET | `/api/monitor/projects/{id}/history` | 체크 히스토리 |
| GET | `/api/monitor/projects/{id}/stream` | 실시간 출력 스트림 (SSE) |

**체크 타입**: `test`, `lint`, `build`, `type_check`

---

## WebSocket Events

### 클라이언트 → 서버

| 타입 | 설명 |
|------|------|
| `task_create` | 태스크 생성 |
| `user_message` | 사용자 메시지 |
| `task_cancel` | 태스크 취소 |
| `approval_response` | 승인/거부 응답 |
| `ping` | 연결 확인 |

### 서버 → 클라이언트

| 타입 | 설명 |
|------|------|
| `task_started` | 태스크 시작됨 |
| `task_progress` | 태스크 진행 상황 |
| `task_completed` | 태스크 완료 |
| `task_failed` | 태스크 실패 |
| `agent_thinking` | 에이전트 사고 중 |
| `agent_action` | 에이전트 액션 |
| `state_update` | 상태 업데이트 |
| `approval_required` | 승인 필요 |
| `approval_granted` | 승인됨 |
| `approval_denied` | 거부됨 |
| `token_update` | 토큰 사용량 업데이트 |
| `error` | 에러 발생 |
| `pong` | 연결 확인 응답 |
