# API Reference - Agents

에이전트 레지스트리, 오케스트레이션, Tmux, MCP 서버, Claude 세션 모니터링 API입니다.

## Base URL
- Development: `http://localhost:8000`

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
