# API Reference - Monitoring

사용량/분석, 외부 LLM 사용량, 감사 로그, 헬스체크, 알림, 조직, 관리자, Rate Limit, 비용 할당, RLHF 피드백 API입니다.

## Base URL
- Development: `http://localhost:8000`

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

**환경 변수**: `CLAUDE_OAUTH_TOKEN`, `CLAUDE_STATS_CACHE_PATH`, `CLAUDE_USAGE_CACHE_PATH` ([배포 가이드](../deployment.md#claude-code-usage-환경-변수) 참조)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/analytics/overview` | 개요 메트릭 |
| GET | `/api/analytics/trends` | 시간별 트렌드 |
| GET | `/api/analytics/agents` | 모델별 성능 메트릭 |
| GET | `/api/analytics/costs` | 비용 분석 (모델별/프로젝트별) |
| GET | `/api/analytics/activity` | 활동 히트맵 |
| GET | `/api/analytics/errors` | 에러 분석 |
| GET | `/api/analytics/dashboard` | 전체 대시보드 데이터 |
| GET | `/api/analytics/trends/compare` | 멀티 프로젝트 트렌드 비교 |

**데이터 소스**: Claude 세션 파일 기반 (`~/.claude/projects/` + 등록된 외부 경로). `USE_DATABASE` 설정과 무관하게 항상 세션 파일에서 실제 데이터를 읽음. 외부 경로는 `/api/claude-sessions/external-paths` 또는 `CLAUDE_EXTERNAL_PROJECTS` env 로 등록.

**쿼리 파라미터**:
- `time_range`: `1h` | `24h` | `7d` | `30d` | `all` (기본: `7d`)
- `project_id`: 프로젝트 이름으로 필터 (선택)

**버킷팅 기준** (`/api/analytics/activity`):
- 윈도우 필터: 세션 `last_activity` ≥ `start` (시작이 윈도우 밖이지만 활성인 세션 포함)
- 좌표: 표시 시간대(env `HEATMAP_DISPLAY_TZ`, 기본 `Asia/Seoul`) 기준 weekday/hour
- 한 세션이 여러 시간대에 걸치면 시간 단위로 분산 카운트 (>30일 long-running 세션은 시작 시각만 카운트하는 안전 가드 적용)

**외부 세션 경로 등록** (Admin > External Sources):

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/claude-sessions/external-paths` | 등록된 외부 경로 목록 |
| POST | `/api/claude-sessions/external-paths` | 외부 경로 추가 (body: `{path}`) |
| DELETE | `/api/claude-sessions/external-paths/{path_encoded}` | 외부 경로 삭제 (URL-encoded path) |

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
| GET | `/api/organizations/{id}/members/{user_id}/usage-detail` | 멤버 개인 상세 사용량 (일별 트렌드, 모델별 분류) |
| GET | `/api/organizations/{id}/source-user-map` | 소스 유저(OS 유저네임)→멤버 매핑 조회 |
| PUT | `/api/organizations/{id}/source-user-map` | 소스 유저 매핑 업데이트 |

**플랜**: `free`, `starter`, `professional`, `enterprise`

**역할**: `owner`, `admin`, `member`, `viewer`

**멤버 상세 사용량** (`GET /api/organizations/{id}/members/{user_id}/usage-detail`):
- `period`: `day` | `week` | `month` (기본: `month`)
- 응답: 일별 토큰 트렌드 (`daily_usage`), 모델별 사용량 분류 (`model_breakdown`), 총 토큰/세션/비용

**소스 유저 매핑** (`PUT /api/organizations/{id}/source-user-map`):
- Body: `{"mapping": {"os-username": "member-user-id", ...}}`
- Claude Code 세션의 OS 유저네임을 조직 멤버에 연결하여 사용량 귀속 추적

---

## Admin

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/admin/users` | 사용자 목록 조회 (관리자 전용) |
| PATCH | `/api/admin/users/{user_id}` | 사용자 정보 수정 (관리자 전용) |
| DELETE | `/api/admin/users/{user_id}` | 사용자 삭제 (관리자 전용) |
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
