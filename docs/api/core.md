# API Reference - Core

세션 관리, 인증, WebSocket, HITL(Human-in-the-Loop) API입니다.

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
