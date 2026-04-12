# API Reference - Automation

워크플로우(CI/CD), 시크릿, 웹훅, 아티팩트, 템플릿, 자동화 루프, 파이프라인, Warp 터미널, MCP Protocol, RAG API입니다.

## Base URL
- Development: `http://localhost:8000`

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

## RAG (Vector DB)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/rag/projects/{id}/index` | 프로젝트 벡터 인덱싱 |
| POST | `/api/rag/projects/{id}/query` | 의미론적 검색 쿼리 |
| GET | `/api/rag/projects/{id}/stats` | 인덱스 통계 조회 |
| DELETE | `/api/rag/projects/{id}/index` | 프로젝트 인덱스 삭제 |

---

## RAG Extended

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/rag/status/{project_id}` | RAG 인덱스 상태 |
| POST | `/api/rag/query` | 일반 RAG 쿼리 |
| GET | `/api/rag/collections` | 벡터 컬렉션 목록 |
| GET | `/api/rag/projects/{project_id}/entities` | 코드 엔티티 추출 |
| GET | `/api/rag/projects/{project_id}/dependencies` | 의존성 맵핑 |
