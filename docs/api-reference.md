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
| POST | `/api/agents/mcp/tools/call` | MCP 도구 호출 |

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
| GET | `/api/project-configs/{project_id}/skills` | 스킬 목록 |
| POST | `/api/project-configs/{project_id}/skills` | 스킬 생성 |
| PUT | `/api/project-configs/{project_id}/skills/{skill_id}` | 스킬 수정 |
| DELETE | `/api/project-configs/{project_id}/skills/{skill_id}` | 스킬 삭제 |
| GET | `/api/project-configs/{project_id}/agents` | 에이전트 목록 |
| POST | `/api/project-configs/{project_id}/agents` | 에이전트 생성 |
| PUT | `/api/project-configs/{project_id}/agents/{agent_id}` | 에이전트 수정 |
| DELETE | `/api/project-configs/{project_id}/agents/{agent_id}` | 에이전트 삭제 |
| GET | `/api/project-configs/{project_id}/commands` | 명령어 목록 |
| POST | `/api/project-configs/{project_id}/commands` | 명령어 생성 |
| PUT | `/api/project-configs/{project_id}/commands/{command_id}` | 명령어 수정 |
| DELETE | `/api/project-configs/{project_id}/commands/{command_id}` | 명령어 삭제 |

---

## Usage & Analytics

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/usage/summary` | 사용량 요약 |
| GET | `/api/usage/by-session/{session_id}` | 세션별 사용량 |
| GET | `/api/usage/by-agent/{agent_id}` | 에이전트별 사용량 |
| GET | `/api/usage/trends` | 사용량 트렌드 |
| GET | `/api/analytics/overview` | 개요 메트릭 |
| GET | `/api/analytics/trends` | 시간별 트렌드 |
| GET | `/api/analytics/agents` | 에이전트 성능 메트릭 |
| GET | `/api/analytics/costs` | 비용 분석 |
| GET | `/api/analytics/activity` | 활동 히트맵 |
| GET | `/api/analytics/errors` | 에러 분석 |
| GET | `/api/analytics/dashboard` | 전체 대시보드 데이터 |

**쿼리 파라미터**: `time_range`: `1h` | `24h` | `7d` | `30d` | `all` (기본: `7d`)

---

## Audit Trail

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/audit` | 감사 로그 조회 |
| GET | `/api/audit/export` | 감사 로그 내보내기 (JSON/CSV) |
| GET | `/api/audit/sessions/{session_id}/trail` | 세션별 감사 추적 |

**쿼리 파라미터**:
- `session_id`, `user_id`: 필터
- `action`, `resource_type`, `status`: 타입 필터
- `start_date`, `end_date`: 날짜 범위

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
| POST | `/api/organizations/{id}/usage/track` | 토큰 사용량 기록 |

**플랜**: `free`, `starter`, `professional`, `enterprise`

**역할**: `owner`, `admin`, `member`, `viewer`

---

## Git

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/branches` | 브랜치 목록 조회 |
| POST | `/api/git/projects/{id}/branches` | 브랜치 생성 |
| DELETE | `/api/git/projects/{id}/branches/{name}` | 브랜치 삭제 |
| GET | `/api/git/projects/{id}/commits` | 커밋 히스토리 |
| POST | `/api/git/projects/{id}/fetch` | 리모트 fetch |
| POST | `/api/git/projects/{id}/pull` | 리모트 pull |
| POST | `/api/git/projects/{id}/push` | 리모트 push |
| POST | `/api/git/projects/{id}/merge/preview` | 머지 미리보기 (충돌 체크) |
| POST | `/api/git/projects/{id}/merge` | 머지 실행 |
| GET | `/api/git/projects/{id}/merge-requests` | MR 목록 |
| POST | `/api/git/projects/{id}/merge-requests` | MR 생성 |
| GET | `/api/git/projects/{id}/merge-requests/{mr_id}` | MR 상세 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/approve` | MR 승인 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/merge` | MR 머지 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/close` | MR 닫기 |
| GET | `/api/git/github/{repo}/pulls` | GitHub PR 목록 |
| GET | `/api/git/github/{repo}/pulls/{number}` | GitHub PR 상세 |
| POST | `/api/git/github/{repo}/pulls/{number}/merge` | GitHub PR 머지 |
| GET | `/api/git/github/{repo}/pulls/{number}/reviews` | GitHub PR 리뷰 목록 |
| POST | `/api/git/github/{repo}/pulls/{number}/reviews` | GitHub PR 리뷰 생성 |

**MR 상태**: `open`, `merged`, `closed`, `draft`

**충돌 상태**: `unknown`, `no_conflicts`, `has_conflicts`

**GitHub 머지 방식**: `merge`, `squash`, `rebase`
