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
| GET | `/api/sessions/{id}/info` | 세션 메타데이터/TTL 조회 |
| POST | `/api/sessions/{id}/refresh` | 세션 만료 갱신 |
| DELETE | `/api/sessions/{id}` | 세션 삭제 |
| GET | `/api/sessions/{id}/sync` | 클라이언트 상태 동기화 |
| POST | `/api/sessions/{id}/cancel` | 활성 오케스트레이션 취소 |
| POST | `/api/sessions/{id}/tasks/{tid}/retry` | 태스크 재시도 |
| POST | `/api/sessions/{id}/tasks/{tid}/cancel` | 태스크 취소 |
| DELETE | `/api/sessions/{id}/tasks/{tid}` | 태스크 소프트 삭제 |
| GET | `/api/sessions/{id}/tasks/{tid}` | 특정 태스크 조회 |
| GET | `/api/sessions/{id}/tasks/{tid}/deletion-info` | 삭제 영향 미리보기 |
| POST | `/api/sessions/{id}/tasks/{tid}/pause` | 태스크 일시정지 |
| POST | `/api/sessions/{id}/tasks/{tid}/resume` | 태스크 재개 |
| GET | `/api/sessions/{id}/tree` | 태스크 트리 구조 |
| GET | `/api/sessions/{id}/context-usage` | 컨텍스트 사용량 메트릭 |
| GET | `/api/sessions/{id}/permissions` | 세션 권한 조회 |
| PUT | `/api/sessions/{id}/permissions` | 권한 업데이트 |
| POST | `/api/sessions/{id}/permissions/toggle/{permission}` | 권한 토글 |
| POST | `/api/sessions/{id}/permissions/agents/{agent_id}/toggle` | 에이전트 토글 |

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
| GET | `/api/auth/status` | OAuth 설정 상태 확인 |

---

## Agents

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/agents` | 에이전트 목록 조회 |
| GET | `/api/agents/stats` | 레지스트리 통계 |
| GET | `/api/agents/{agent_id}` | 에이전트 상세 조회 |
| POST | `/api/agents/search` | 능력 기반 검색 |
| POST | `/api/agents/{agent_id}/status` | 에이전트 상태 업데이트 |
| POST | `/api/agents/ocr` | 이미지 OCR 텍스트 추출 (Vision LLM) |

### Task Analysis & Orchestration

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/agents/orchestrate/analyze` | 태스크 분석 |
| POST | `/api/agents/orchestrate/analyze-with-images` | 이미지 포함 태스크 분석 |
| GET | `/api/agents/orchestrate/analyses` | 분석 이력 조회 |
| GET | `/api/agents/orchestrate/analyses/{analysis_id}` | 분석 상세 조회 |
| DELETE | `/api/agents/orchestrate/analyses/{analysis_id}` | 분석 삭제 |
| POST | `/api/agents/orchestrate/execute-analysis` | 분석 실행 |
| GET | `/api/agents/orchestrate/strategies` | 실행 전략 목록 |
| GET | `/api/agents/orchestrate/claude-auth-status` | Claude 인증 상태 |

### Tmux Session Management

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/agents/orchestrate/execute-with-tmux` | Tmux 세션으로 실행 |
| GET | `/api/agents/orchestrate/tmux-sessions` | Tmux 세션 목록 |
| GET | `/api/agents/orchestrate/tmux-sessions/{name}/status` | 세션 상태 조회 |
| GET | `/api/agents/orchestrate/tmux-sessions/{name}/stream` | 세션 출력 스트리밍 |
| POST | `/api/agents/orchestrate/tmux-sessions/{name}/stop` | 세션 중지 |

### MCP Server Management

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/agents/mcp/servers` | MCP 서버 목록 |
| GET | `/api/agents/mcp/servers/{id}` | MCP 서버 상세 |
| POST | `/api/agents/mcp/servers/{id}/start` | MCP 서버 시작 |
| POST | `/api/agents/mcp/servers/{id}/stop` | MCP 서버 중지 |
| POST | `/api/agents/mcp/servers/{id}/restart` | MCP 서버 재시작 |
| GET | `/api/agents/mcp/servers/{id}/tools` | 서버 도구 목록 |
| POST | `/api/agents/mcp/tools/call` | MCP 도구 호출 |
| POST | `/api/agents/mcp/tools/batch-call` | MCP 도구 일괄 호출 |
| GET | `/api/agents/mcp/tools` | 전체 도구 목록 |
| GET | `/api/agents/mcp/stats` | MCP 통계 |

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
| GET | `/api/claude-sessions/external-paths` | 외부 경로 목록 |
| POST | `/api/claude-sessions/external-paths` | 외부 경로 추가 |
| DELETE | `/api/claude-sessions/external-paths/{path}` | 외부 경로 제거 |
| GET | `/api/claude-sessions/source-users` | 사용자 목록 |
| GET | `/api/claude-sessions/projects` | 프로젝트 목록 |
| GET | `/api/claude-sessions/empty/list` | 빈 세션 목록 |
| GET | `/api/claude-sessions/ghost/list` | 고스트 프로세스 목록 |
| DELETE | `/api/claude-sessions/ghost` | 고스트 프로세스 정리 |
| GET | `/api/claude-sessions/processes` | 프로세스 목록 |
| POST | `/api/claude-sessions/processes/kill` | 프로세스 종료 |
| POST | `/api/claude-sessions/processes/cleanup-stale` | 오래된 프로세스 정리 |
| GET | `/api/claude-sessions/summaries/pending-count` | 요약 대기 수 |
| POST | `/api/claude-sessions/summaries/generate-batch` | 요약 일괄 생성 |
| POST | `/api/claude-sessions/{id}/summary` | 세션 요약 생성 |
| GET | `/api/claude-sessions/{id}/summary` | 세션 요약 조회 |
| DELETE | `/api/claude-sessions/{id}` | 세션 삭제 |
| DELETE | `/api/claude-sessions` | 전체 세션 삭제 |
| GET | `/api/claude-sessions/{id}/activity` | 세션 활동 조회 |
| GET | `/api/claude-sessions/{id}/activity/stream` | 활동 스트림 |
| GET | `/api/claude-sessions/{id}/tasks` | 세션 태스크 목록 |

**쿼리 파라미터** (`GET /api/claude-sessions`):
- `status`: `active` | `idle` | `completed`
- `sort_by`: `last_activity` | `created_at` | `message_count` | `estimated_cost` | `project_name`
- `sort_order`: `asc` | `desc` (기본: `desc`)
- `limit`: 최대 반환 개수 (기본: 50)
- `offset`: 시작 오프셋 (기본: 0)
- `project`: 프로젝트 이름 필터 (선택)
- `source_user`: 소스 사용자 필터 (선택)

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
| POST | `/api/feedback/task-evaluation` | 태스크 평가 제출 |
| GET | `/api/feedback/task-evaluation/stats` | 평가 통계 |
| GET | `/api/feedback/task-evaluation/list` | 평가 목록 |
| GET | `/api/feedback/task-evaluation/{session_id}/{task_id}` | 특정 평가 조회 |

**피드백 유형**: `implicit`, `explicit_positive`, `explicit_negative`

**부정 피드백 사유**: `incorrect`, `incomplete`, `off_topic`, `style`, `performance`, `other`

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

## Usage & Analytics

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/usage` | Claude Code 사용량 (Plan Limits + 토큰 통계) |
| GET | `/api/usage/raw` | Raw stats-cache.json 데이터 |
| GET | `/api/usage/oauth-test` | OAuth 토큰 진단 |
| GET | `/api/usage/claude-config` | Claude 설정 조회 |
| PUT | `/api/usage/claude-config` | Claude 설정 업데이트 |

**`GET /api/usage` 응답**:
- `planLimits`: Anthropic OAuth API 실시간 Plan Limits (session, weekly, model별)
- `weeklyTotalTokens`, `weeklySonnetTokens`, `weeklyOpusTokens`: 로컬 stats-cache 기반 주간 토큰
- `oauthAvailable`: OAuth 토큰 사용 가능 여부
- `isCached`: 캐시 데이터 사용 여부

**환경 변수**: `CLAUDE_OAUTH_TOKEN`, `CLAUDE_STATS_CACHE_PATH`, `CLAUDE_USAGE_CACHE_PATH` ([배포 가이드](./deployment.md#claude-code-usage-환경-변수) 참조)
| GET | `/api/analytics/overview` | 개요 메트릭 |
| GET | `/api/analytics/trends` | 시간별 트렌드 |
| GET | `/api/analytics/agents` | 모델별 성능 메트릭 |
| GET | `/api/analytics/costs` | 비용 분석 (모델별/프로젝트별) |
| GET | `/api/analytics/activity` | 활동 히트맵 |
| GET | `/api/analytics/errors` | 에러 분석 |
| GET | `/api/analytics/dashboard` | 전체 대시보드 데이터 |
| GET | `/api/analytics/trends/compare` | 멀티 프로젝트 트렌드 비교 |

**데이터 소스**: Claude 세션 파일 기반 (`~/.claude/projects/` 스캔). `USE_DATABASE` 설정과 무관하게 항상 세션 파일에서 실제 데이터를 읽음.

**쿼리 파라미터**:
- `time_range`: `1h` | `24h` | `7d` | `30d` | `all` (기본: `7d`)
- `project_id`: 프로젝트 이름으로 필터 (선택)

**버킷팅 기준**: 세션 `created_at` (생성 시점) 기준으로 시간별 분포 계산

**멀티 프로젝트 비교** (`GET /api/analytics/trends/compare`):
- `project_ids`: 비교할 프로젝트 ID 목록 (최대 5개, 필수)
- `metric`: `tasks` | `tokens` | `cost` | `success_rate` (기본: `tasks`)
- `time_range`: 시간 범위

---

## External Usage (외부 LLM 사용량)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/external-usage/summary` | 외부 LLM 프로바이더 사용량 요약 |
| GET | `/api/external-usage/providers` | 지원 프로바이더 목록 및 설정 상태 |
| GET | `/api/external-usage/providers/{provider}/health` | 프로바이더 연결 상태 확인 |
| POST | `/api/external-usage/sync` | 사용량 데이터 수동 동기화 |

**쿼리 파라미터** (`GET /summary`):
- `start_time`: 시작 시간 (기본: 30일 전)
- `end_time`: 종료 시간 (기본: 현재)
- `providers`: 필터할 프로바이더 목록

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
| GET | `/api/audit/integrity/verify` | 무결성 검증 |
| GET | `/api/audit/compliance/report` | 컴플라이언스 보고서 |
| POST | `/api/audit/retention/apply` | 보존 정책 적용 |
| GET | `/api/audit/retention-policies` | 보존 정책 목록 |
| GET | `/api/audit/data-classifications` | 데이터 분류 목록 |

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
| GET | `/api/notifications/rules/{id}` | 특정 규칙 조회 |
| GET | `/api/notifications/channels/{channel}` | 채널 설정 조회 |
| DELETE | `/api/notifications/history` | 히스토리 삭제 |
| GET | `/api/notifications/event-types` | 이벤트 타입 목록 |
| GET | `/api/notifications/priorities` | 우선순위 목록 |

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

---

## LLM Models (Central Registry)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/llm/models` | 전체 모델 목록 |
| GET | `/api/llm/models?provider=xxx` | Provider별 필터링 |
| GET | `/api/llm/models?available_only=true` | 사용 가능한 모델만 |
| GET | `/api/llm/models/default` | 기본 모델 조회 |
| GET | `/api/llm/models/{model_id}` | 특정 모델 상세 |
| PATCH | `/api/llm/models/{model_id}` | 모델 설정 수정 |
| GET | `/api/llm/providers` | 지원 프로바이더 목록 |

**응답 형식** (GET /api/llm/models):
```json
{
  "models": [
    {
      "id": "claude-sonnet-4-6",
      "display_name": "Claude Sonnet 4.6",
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
| GET | `/api/config-versions/by-number/{type}/{id}/{number}` | 버전 번호로 조회 |

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
| GET | `/api/organizations/user/{uid}/memberships` | 사용자 멤버십 목록 |
| GET | `/api/organizations/{id}/invitations` | 초대 목록 |
| DELETE | `/api/organizations/{id}/invitations/{invitation_id}` | 초대 취소 |
| GET | `/api/organizations/{id}/context/{uid}` | 테넌트 컨텍스트 |
| GET | `/api/organizations/{id}/stats` | 조직 통계 |
| POST | `/api/organizations/{id}/usage/track` | 토큰 사용량 기록 (user_id, session_id, model 옵션) |
| GET | `/api/organizations/{id}/quota` | Quota 현황 조회 (멤버/프로젝트/세션/토큰) |
| GET | `/api/organizations/{id}/members/usage?period=month` | 멤버별 사용량 분석 (day/week/month) |

**플랜**: `free`, `starter`, `professional`, `enterprise`

**역할**: `owner`, `admin`, `member`, `viewer`

---

## Git

### Git 상태 & 경로

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/status` | Git 상태 조회 (현재 브랜치, 변경 파일 등) |
| PUT | `/api/git/projects/{id}/git-path` | Git 경로 업데이트 |
| GET | `/api/git/projects/{id}/worktrees` | Worktree 목록 조회 |

### Working Directory

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/working-status` | 작업 디렉토리 상태 (staged/unstaged/untracked) |
| POST | `/api/git/projects/{id}/add` | 파일 스테이징 (git add) |
| POST | `/api/git/projects/{id}/commit` | 커밋 생성 (git commit) |
| POST | `/api/git/projects/{id}/unstage` | 파일 언스테이징 |
| POST | `/api/git/projects/{id}/draft-commits` | LLM 기반 커밋 초안 생성 |

### Staging Area (Hunk 단위)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/file-diff` | 파일 diff 조회 |
| GET | `/api/git/projects/{id}/staged-diff` | 스테이지된 변경사항 diff |
| GET | `/api/git/projects/{id}/file-hunks` | 파일 hunk 목록 조회 |
| POST | `/api/git/projects/{id}/stage-hunks` | Hunk 단위 스테이징 |

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
| POST | `/api/git/projects/{id}/branches/{name}/checkout` | 브랜치 체크아웃 |
| GET | `/api/git/projects/{id}/branches/{name}/diff` | 브랜치 diff (base 대비) |
| GET | `/api/git/projects/{id}/commits` | 커밋 히스토리 |
| GET | `/api/git/projects/{id}/commits/{sha}` | 커밋 상세 조회 |
| GET | `/api/git/projects/{id}/commits/{sha}/files` | 커밋 파일 목록 |
| GET | `/api/git/projects/{id}/commits/{sha}/diff` | 커밋 diff |

**브랜치 삭제 쿼리 파라미터** (`DELETE /api/git/projects/{id}/branches/{name}`):
- `force`: 머지되지 않은 브랜치 강제 삭제 (기본: `false`)
- `delete_remote`: 원격 추적 브랜치도 삭제 (기본: `false`)
- `remove_worktree`: 연관 worktree 제거 후 삭제 (기본: `false`)

**삭제 시 동작**: 삭제된 브랜치가 source_branch인 열린 MR을 자동으로 닫음

**응답**:
```json
{
  "success": true,
  "message": "Branch 'feature/old' deleted (2 open MR(s) auto-closed)"
}
```

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
| GET | `/api/git/projects/{id}/merge/three-way-diff` | 3-way diff 조회 |
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
| PUT | `/api/git/projects/{id}/merge-requests/{mr_id}` | MR 수정 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/approve` | MR 승인 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/merge` | MR 머지 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/close` | MR 닫기 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/refresh-conflicts` | 충돌 상태 갱신 |

**MR 상태**: `open`, `merged`, `closed`, `draft`

**충돌 상태**: `unknown`, `no_conflicts`, `has_conflicts`

**MR 생성 시 `auto_merge: true`**: 승인 조건 충족 시 자동 머지 실행

**Auto-Deploy**: 브랜치 보호 규칙에 `auto_deploy` 설정 시 머지 후 GitHub Actions workflow 자동 트리거

### Branch Protection Rules

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/branch-protection` | 보호 규칙 목록 |
| POST | `/api/git/projects/{id}/branch-protection` | 보호 규칙 생성 |
| PUT | `/api/git/projects/{id}/branch-protection/{rule_id}` | 보호 규칙 수정 |
| DELETE | `/api/git/projects/{id}/branch-protection/{rule_id}` | 보호 규칙 삭제 |

**규칙 필드**: `branch_pattern`, `require_approvals`, `require_no_conflicts`, `allowed_merge_roles`, `allow_force_push`, `allow_deletion`, `auto_deploy`, `deploy_workflow`, `enabled`

### Remote Management

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/remotes` | 리모트 목록 조회 |
| POST | `/api/git/projects/{id}/remotes` | 리모트 추가 |
| PUT | `/api/git/projects/{id}/remotes/{remote_name}` | 리모트 수정 |
| DELETE | `/api/git/projects/{id}/remotes/{remote_name}` | 리모트 삭제 |

### Git Repository Registry

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/repositories` | 등록된 Git 저장소 목록 |
| POST | `/api/git/repositories` | Git 저장소 등록 |
| GET | `/api/git/repositories/{repo_id}` | 저장소 상세 조회 |
| PUT | `/api/git/repositories/{repo_id}` | 저장소 정보 수정 |
| DELETE | `/api/git/repositories/{repo_id}` | 저장소 삭제 |

### GitHub Integration

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/github/{owner}/{repo}/pulls` | GitHub PR 목록 |
| GET | `/api/git/github/{owner}/{repo}/pulls/{number}` | GitHub PR 상세 |
| POST | `/api/git/github/{owner}/{repo}/pulls/{number}/merge` | GitHub PR 머지 |
| GET | `/api/git/github/{owner}/{repo}/pulls/{number}/reviews` | GitHub PR 리뷰 목록 |
| POST | `/api/git/github/{owner}/{repo}/pulls/{number}/reviews` | GitHub PR 리뷰 생성 |
| GET | `/api/git/github/{owner}/{repo}/pulls/{number}/mergeable` | PR 머지 가능 여부 |
| GET | `/api/git/github/{owner}/{repo}/info` | 저장소 정보 |
| GET | `/api/git/github/{owner}/{repo}/branches` | 저장소 브랜치 목록 |

**GitHub 머지 방식**: `merge`, `squash`, `rebase`

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
| GET | `/api/rate-limits/tiers` | 제한 티어 목록 |
| GET | `/api/rate-limits/tiers/{tier}` | 특정 티어 설정 |
| POST | `/api/rate-limits/reset` | 제한 초기화 |
| GET | `/api/rate-limits/overrides` | 오버라이드 목록 |
| GET | `/api/rate-limits/overrides/{identifier}` | 특정 오버라이드 조회 |
| POST | `/api/rate-limits/overrides` | 오버라이드 생성 |
| DELETE | `/api/rate-limits/overrides/{identifier}` | 오버라이드 삭제 |
| POST | `/api/rate-limits/check` | 제한 확인 |

---

## Cost Allocation

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/cost/summary` | 비용 요약 |
| GET | `/api/cost/report` | 비용 리포트 |
| GET | `/api/cost/forecast` | 비용 예측 |
| GET | `/api/cost/chargeback/export` | 차지백 내보내기 (CSV/JSON) |
| GET | `/api/cost/alerts` | 예산 알림 목록 |

### Cost Centers

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/cost/cost-centers` | 비용 센터 목록 |
| POST | `/api/cost/cost-centers` | 비용 센터 생성 |
| GET | `/api/cost/cost-centers/{id}` | 비용 센터 상세 |
| PATCH | `/api/cost/cost-centers/{id}` | 비용 센터 수정 |
| DELETE | `/api/cost/cost-centers/{id}` | 비용 센터 삭제 (비활성화) |

---

## Health

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | 기본 헬스체크 |
| GET | `/api/health/detailed` | 상세 헬스체크 |
| GET | `/api/health/live` | Liveness 프로브 |
| GET | `/api/health/ready` | Readiness 프로브 |
| GET | `/api/health/database` | 데이터베이스 헬스 |
| GET | `/api/health/redis` | Redis 헬스 |
| GET | `/api/health/llm` | LLM 프로바이더 헬스 |
| GET | `/api/health/services` | 서비스 상태 조회 |
| GET | `/api/health/services/conflicts` | 포트 충돌 조회 |

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

## Workflows (CI/CD Automation)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/workflows` | 워크플로우 목록 조회 (`?project_id=` 필터) |
| POST | `/api/workflows` | 워크플로우 생성 (YAML 또는 JSON 정의) |
| GET | `/api/workflows/{id}` | 워크플로우 상세 조회 |
| PUT | `/api/workflows/{id}` | 워크플로우 수정 |
| DELETE | `/api/workflows/{id}` | 워크플로우 삭제 |
| GET | `/api/workflows/{id}/runs` | 실행 이력 조회 (`?limit=50`) |
| POST | `/api/workflows/{id}/runs` | 워크플로우 실행 트리거 |
| GET | `/api/workflows/runs/{run_id}` | 실행 상세 조회 |
| POST | `/api/workflows/runs/{run_id}/cancel` | 실행 취소 |
| POST | `/api/workflows/runs/{run_id}/retry` | 실패한 실행 재시도 |
| GET | `/api/workflows/runs/{run_id}/stream` | SSE 실시간 로그 스트림 |
| GET | `/api/workflows/{id}/yaml` | YAML 내보내기 |

---

## Secrets

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/secrets` | 시크릿 목록 조회 (`?scope=`, `?scope_id=`) |
| POST | `/api/secrets` | 시크릿 생성 (name, value, scope) |
| PUT | `/api/secrets/{id}` | 시크릿 수정 |
| DELETE | `/api/secrets/{id}` | 시크릿 삭제 |

---

## Webhooks

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/webhooks/{webhook_id}` | Webhook 수신 (HMAC-SHA256 검증) |
| GET | `/api/workflows/{id}/webhooks` | 워크플로우 웹훅 목록 |
| POST | `/api/workflows/{id}/webhooks` | 웹훅 생성 |
| DELETE | `/api/workflows/{id}/webhooks/{webhook_id}` | 웹훅 삭제 |

---

## Artifacts

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/workflows/runs/{run_id}/artifacts` | 실행별 아티팩트 목록 |
| POST | `/api/workflows/runs/{run_id}/artifacts` | 아티팩트 업로드 (multipart) |
| GET | `/api/workflows/artifacts/{id}/download` | 아티팩트 다운로드 |
| DELETE | `/api/workflows/artifacts/{id}` | 아티팩트 삭제 |

---

## Templates

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/workflows/templates` | 템플릿 목록 (`?category=`, `?search=`) |
| POST | `/api/workflows/templates` | 템플릿 생성 |
| GET | `/api/workflows/templates/{id}` | 템플릿 상세 |
| POST | `/api/workflows/from-template/{id}` | 템플릿으로 워크플로우 생성 |

---

## Automation (자동화 루프)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/automation/loops` | 자동화 루프 생성 |
| GET | `/api/automation/loops` | 자동화 루프 목록 조회 |
| GET | `/api/automation/loops/{loop_id}` | 특정 루프 상태 조회 |
| POST | `/api/automation/loops/{loop_id}/start` | 루프 시작 |
| POST | `/api/automation/loops/{loop_id}/stop` | 루프 중지 |
| DELETE | `/api/automation/loops/{loop_id}` | 루프 삭제 (실행 중이면 먼저 중지) |

**루프 생성 요청 본문** (`POST /api/automation/loops`):
```json
{
  "name": "DB Health Monitor",
  "interval_seconds": 60,
  "max_iterations": null,
  "conditions": [
    {
      "metric": "health.database.latency_ms",
      "operator": "gt",
      "threshold": 500,
      "duration_seconds": 0
    }
  ],
  "actions": [
    {
      "type": "notify",
      "target": "slack-channel",
      "params": {}
    }
  ],
  "cooldown_seconds": 300
}
```

**조건 연산자**: `gt`, `lt`, `eq`, `ne`, `gte`, `lte`

**액션 타입**: `webhook`, `workflow`, `log`, `notify`, `pipeline`

**루프 상태**: `pending`, `running`, `stopped`, `completed`, `error`

---

## Pipelines (데이터 파이프라인)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/pipelines` | 파이프라인 정의 생성 |
| GET | `/api/pipelines` | 파이프라인 목록 조회 |
| POST | `/api/pipelines/{pipeline_id}/execute` | 파이프라인 실행 |
| GET | `/api/pipelines/{pipeline_id}/runs/{run_id}` | 실행 결과 조회 |
| DELETE | `/api/pipelines/{pipeline_id}` | 파이프라인 삭제 |

**파이프라인 생성 요청 본문** (`POST /api/pipelines`):
```json
{
  "name": "Data Processing Pipeline",
  "stages": [
    {"stage_type": "collect", "name": "Collect Data", "config": {}},
    {"stage_type": "transform", "name": "Transform", "config": {}},
    {"stage_type": "analyze", "name": "Analyze", "config": {}},
    {"stage_type": "output", "name": "Output Results", "config": {}}
  ],
  "error_strategy": "fail_fast",
  "max_retries": 2,
  "timeout_seconds": 300
}
```

**내장 스테이지 타입**: `collect`, `transform`, `analyze`, `output`

**에러 전략**: `fail_fast`, `continue`, `retry`

---

## Warp Terminal

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/warp/open` | Warp 터미널에서 프로젝트 열기 |
| GET | `/api/warp/status` | Warp 설치 상태 확인 |
| POST | `/api/warp/cleanup` | 오래된 설정 파일 정리 |

**Warp Open 요청 본문** (`POST /api/warp/open`):
```json
{
  "project_id": "project-uuid",
  "command": "npm test",
  "title": "Tab Title",
  "new_window": true,
  "use_claude_cli": false,
  "image_paths": ["/path/to/screenshot.png"],
  "branch_name": "feature/my-branch"
}
```

**확장 기능**:
- `branch_name`: 실행 전 feature branch 자동 생성 (`git checkout -b`)
- `image_paths`: Claude CLI 실행 시 `--image` 플래그로 이미지 전달
- `use_claude_cli`: `claude --dangerously-skip-permissions` 래핑 모드
- Docker 모드: URI를 프론트엔드로 반환 (`open_via_frontend: true`)

---

## MCP Protocol (Warp Terminal Integration)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/mcp/sse` | MCP SSE 스트림 (Warp 클라이언트 연결) |
| POST | `/mcp/messages` | MCP 메시지 전송 |
| GET | `/mcp/health` | MCP 헬스체크 |
| GET | `/mcp/tools` | MCP 도구 목록 |

> **Note**: 이 API는 Warp 터미널 MCP 클라이언트와의 통신용입니다. MCP 서버 관리는 `/api/agents/mcp/` 엔드포인트를 사용합니다.

---

## HITL (Human-in-the-Loop)

HITL 엔드포인트는 세션 컨텍스트 하에 동작합니다. 승인 요청은 Sessions & Tasks 섹션 내에 포함됩니다.

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/sessions/{session_id}/approvals` | 세션의 대기 중인 승인 요청 목록 |
| POST | `/api/sessions/{session_id}/approve/{approval_id}` | 작업 승인 및 실행 재개 |
| POST | `/api/sessions/{session_id}/deny/{approval_id}` | 작업 거부 및 태스크 실패 처리 |

**승인 요청 응답 필드**: `approval_id`, `task_id`, `tool_name`, `tool_args`, `risk_level`, `risk_description`, `created_at`, `status`

**승인/거부 요청 본문** (선택 사항):
```json
{
  "note": "승인/거부 사유"
}
```

---

## LLM Credentials

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/users/me/llm-credentials` | LLM 자격증명 목록 조회 |
| POST | `/api/users/me/llm-credentials` | LLM 자격증명 추가 |
| PUT | `/api/users/me/llm-credentials/{id}` | LLM 자격증명 수정 |
| DELETE | `/api/users/me/llm-credentials/{id}` | LLM 자격증명 삭제 |
| POST | `/api/users/me/llm-credentials/{id}/verify` | 자격증명 연결 검증 |

---

## LLM Proxy

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/proxy/chat/completions` | LLM 채팅 완료 프록시 (OpenAI 호환) |

---

## RAG Extended

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/rag/status/{project_id}` | RAG 인덱스 상태 |
| POST | `/api/rag/query` | 일반 RAG 쿼리 |
| GET | `/api/rag/collections` | 벡터 컬렉션 목록 |
| GET | `/api/rag/projects/{project_id}/entities` | 코드 엔티티 추출 |
| GET | `/api/rag/projects/{project_id}/dependencies` | 의존성 맵핑 |

---

## Playground Extended

| Method | Path | 설명 |
|--------|------|------|
| PATCH | `/api/playground/sessions/{id}/settings` | 세션 설정 변경 |
| POST | `/api/playground/sessions/{id}/clear` | 대화 이력 초기화 |
| POST | `/api/playground/sessions/{id}/execute/stream` | 스트리밍 실행 |
| GET | `/api/playground/sessions/{id}/history` | 대화 이력 조회 |
| GET | `/api/playground/tools` | 사용 가능 도구 목록 |
| POST | `/api/playground/tools/test` | 도구 테스트 실행 |
| POST | `/api/playground/compare` | 에이전트 비교 실행 |
| GET | `/api/playground/models` | 사용 가능 모델 목록 |

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
